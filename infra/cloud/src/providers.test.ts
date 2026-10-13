import * as NodeSqlite from "node:sqlite";
const { DatabaseSync } = NodeSqlite;
type DatabaseSync = NodeSqlite.DatabaseSync;

import * as NodeFS from "node:fs";
const { readFileSync } = NodeFS;

import { EncryptJWT, jwtDecrypt } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { cloudKey } from "./auth.ts";
import {
  connectionId,
  disconnect,
  listConnections,
  providerToken,
  startConnection,
} from "./providers.ts";
import type { Env, Identity } from "./env.ts";

let sqlite: DatabaseSync;
let env: Env;
const identity: Identity = {
  userId: "user",
  sessionId: "session",
  sessionToken: "test",
  audience: "environment:a",
  expiresAt: Date.now() + 900_000,
};
const id = "00000000-0000-4000-8000-000000000001";
beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    readFileSync(new URL("../migrations/0001_account_services.sql", import.meta.url), "utf8"),
  );
  const prepare = (sql: string) => {
    let params: (string | number | null)[] = [];
    const statement = {
      bind(...values: typeof params) {
        params = values;
        return statement;
      },
      async first() {
        return sqlite.prepare(sql).get(...params) ?? null;
      },
      async all() {
        return {
          results: sqlite.prepare(sql).all(...params),
          meta: { changes: Number(sqlite.prepare("SELECT changes() AS n").get()!.n) },
        };
      },
      async run() {
        return statement.all();
      },
    };
    return statement;
  };
  env = {
    CLOUD_SECRET: "test-secret-with-at-least-thirty-two-characters",
    CLOUD_ORIGIN: "https://cloud.otterware.app",
    ALLOWED_ORIGINS: "https://mail.otterware.app",
    GOOGLE_PROVIDER_CLIENT_ID: "google",
    GOOGLE_PROVIDER_CLIENT_SECRET: "google-secret",
    MICROSOFT_PROVIDER_CLIENT_ID: "ms",
    MICROSOFT_PROVIDER_CLIENT_SECRET: "ms-secret",
    ACCOUNT_DATA: {
      prepare,
      async batch(statements: ReturnType<typeof prepare>[]) {
        return Promise.all(statements.map((s) => s.all()));
      },
    },
  } as unknown as Env;
});
afterEach(() => {
  sqlite.close();
  vi.unstubAllGlobals();
});
async function seed() {
  const sealed = await new EncryptJWT({ token: "refresh-secret" })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setSubject("user")
    .setAudience(id)
    .encrypt(await cloudKey(env, "provider"));
  sqlite
    .prepare("INSERT INTO provider_connection VALUES(?,?,?,?,?,?,?,?)")
    .run(id, "user", "google", "google-user", "user@example.com", '["email"]', sealed, 0);
}

describe("provider credential custody", () => {
  it("uses the shared Web OAuth client with PKCE, nonce and fixed callback, rejecting unsafe origins/scopes", async () => {
    const result = await startConnection(env, identity, {
      provider: "google",
      scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
      returnTo: "https://mail.otterware.app/settings",
    });
    const url = new URL(result.url);
    expect(url.searchParams.get("client_id")).toBe("google");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("nonce")).toBeTruthy();
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://cloud.otterware.app/v1/cloud/providers/google/callback",
    );
    await expect(
      startConnection(env, identity, {
        provider: "google",
        scopes: ["email"],
        returnTo: "https://usercontent.otterware.app/steal",
      }),
    ).rejects.toThrow();
    await expect(
      startConnection(env, identity, {
        provider: "google",
        scopes: ["arbitrary"],
        returnTo: env.CLOUD_ORIGIN,
      }),
    ).rejects.toThrow();
  });
  it("never lists refresh credentials and rotates them sealed to their account and connection", async () => {
    await seed();
    expect(JSON.stringify(await listConnections(env, "user"))).not.toContain("refresh");
    const fetcher = vi.fn(async () =>
      Response.json({
        access_token: "short-lived",
        refresh_token: "rotated",
        expires_in: 3600,
        scope: "email profile",
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    const result = await providerToken(env, identity, id);
    expect(result).toMatchObject({
      audience: "environment:a",
      accessToken: "short-lived",
      scopes: ["email", "profile"],
    });
    const row = sqlite.prepare("SELECT refresh_token FROM provider_connection WHERE id=?").get(id)!;
    expect(row.refresh_token).not.toContain("rotated");
    expect(
      (
        await jwtDecrypt(String(row.refresh_token), await cloudKey(env, "provider"), {
          subject: "user",
          audience: id,
        })
      ).payload.token,
    ).toBe("rotated");
    await expect(providerToken(env, { ...identity, userId: "other" }, id)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not hand out or resurrect an in-flight grant after disconnect", async () => {
    await seed();
    vi.stubGlobal("fetch", async () => {
      await disconnect(env, "user", id);
      return Response.json({
        access_token: "must-not-leave",
        refresh_token: "rotated",
        expires_in: 3600,
      });
    });
    await expect(providerToken(env, identity, id)).rejects.toThrow("Provider connection changed");
    expect((await listConnections(env, "user")).connections).toEqual([]);
  });
});

it("assigns concurrent OAuth callbacks the same row and keeps accounts/providers separate", async () => {
  const first = await connectionId("user", "google", "subject");
  expect(await connectionId("user", "google", "subject")).toBe(first);
  expect(await connectionId("other", "google", "subject")).not.toBe(first);
  expect(await connectionId("user", "microsoft", "subject")).not.toBe(first);
});
