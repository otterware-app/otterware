import * as NodeFSP from "node:fs/promises";
const { readFile, readdir } = NodeFSP;

import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { bundle } from "../scripts/bundle.ts";

let runtime: Miniflare;
const origin = "https://cloud.otterware.app";
const audience = "environment:test";
const identityScript = `
import { WorkerEntrypoint, DurableObject } from 'cloudflare:workers';
const revoked = new Set();
export class Identity extends WorkerEntrypoint {
  async getSession(headers) {
    const token = headers.authorization?.replace(/^Bearer /, '');
    if (!['offline-a','offline-b'].includes(token) || revoked.has(token)) return null;
    return { session: { id: token, token, expiresAt: new Date(Date.now()+86400000), createdAt: new Date() }, user: { id: token, email: token+'@example.com', name: token, emailVerified: true } };
  }
}
export class LegacyHub extends DurableObject {
  fetch() { const pair = new WebSocketPair(); this.ctx.acceptWebSocket(pair[1]); return new Response(null,{status:101,webSocket:pair[0]}); }
  publish(event) { for (const ws of this.ctx.getWebSockets()) ws.send(JSON.stringify(event)); }
}
export default { async fetch(request, env) {
  if (new URL(request.url).pathname === '/revoke') { revoked.add(await request.text()); return new Response(null); }
  const { user, event } = await request.json(); await env.HUB.get(env.HUB.idFromName(user)).publish(event); return new Response(null);
} };
`;
beforeAll(async () => {
  const result = await bundle("src/worker.ts", false);
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: "cloud",
          modules: true,
          script: result.outputFiles![0]!.text,
          compatibilityDate: "2026-09-01",
          compatibilityFlags: ["nodejs_compat"],
          bindings: {
            CLOUD_ORIGIN: origin,
            DRIVE_SECRET: "test-drive-secret-is-at-least-32-characters",
            CONTENT_SIGNING_KEY: "test-content-secret-is-at-least-32-characters",
            CLOUD_SECRET: "test-cloud-secret-is-at-least-32-characters",
            ALLOWED_ORIGINS: "https://mail.otterware.app",
            GOOGLE_PROVIDER_CLIENT_ID: "google-test",
            MICROSOFT_PROVIDER_CLIENT_ID: "ms-test",
          },
          d1Databases: {
            ACCOUNT_DATA: "cloud",
            ACCOUNTS_DB: "accounts",
            DRIVE_DB: "drive",
            MAIL_DB: "mail",
          },
          durableObjects: {
            ENVIRONMENT_HUB: { className: "EnvironmentHub", useSQLite: true },
            CLOUD_AGENT_HUB: { className: "CloudAgentHub", useSQLite: true },
            LEGACY_USER_HUB: { className: "LegacyHub", scriptName: "identity", useSQLite: true },
          },
          serviceBindings: { ACCOUNTS: { name: "identity", entrypoint: "Identity" } },
        },
        {
          name: "identity",
          modules: true,
          script: identityScript,
          compatibilityDate: "2026-09-01",
          durableObjects: { HUB: { className: "LegacyHub", useSQLite: true } },
        },
      ],
    }),
  );
  const database = await runtime.getD1Database("ACCOUNT_DATA", "cloud");
  const sql = await readFile(
    new URL("../migrations/0001_account_services.sql", import.meta.url),
    "utf8",
  );
  await database.batch(
    sql
      .replace(/^--.*$/gm, "")
      .split(";")
      .filter((s) => s.trim())
      .map((s) => database.prepare(s)),
  );
  const drive = await runtime.getD1Database("DRIVE_DB", "cloud");
  for (const file of (await readdir(new URL("../drive/migrations/", import.meta.url)))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const migration = await readFile(
      new URL(`../drive/migrations/${file}`, import.meta.url),
      "utf8",
    );
    await drive.batch(
      migration
        .replace(/^\s*--.*$/gm, "")
        .split(";")
        .filter((s) => s.trim())
        .map((s) => drive.prepare(s)),
    );
  }
  await drive.batch([
    drive.prepare(
      "INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES('drive-user','Drive User','user@example.com',1,'2026-01-01','2026-01-01')",
    ),
    drive.prepare(
      "INSERT INTO account(id,accountId,providerId,userId,createdAt,updatedAt) VALUES('link','offline-a','otter','drive-user','2026-01-01','2026-01-01')",
    ),
  ]);
});
afterAll(async () => {
  await runtime?.dispose();
});
const request = (path: string, init?: Parameters<Miniflare["dispatchFetch"]>[1]) =>
  runtime.dispatchFetch(origin + path, init);
async function token(session = "offline-a", target = audience) {
  const response = await request("/v1/cloud/token", {
    method: "POST",
    headers: { authorization: `Bearer ${session}`, "content-type": "application/json" },
    body: JSON.stringify({ audience: target }),
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { accessToken: string }).accessToken;
}
const headers = (accessToken: string, target = audience) => ({
  authorization: `Bearer ${accessToken}`,
  "x-otter-audience": target,
  "content-type": "application/json",
});
const mutation = (
  id: string,
  modifiedAt: number,
  value: unknown,
  mutationId = crypto.randomUUID(),
) => ({ collection: "settings", id, modifiedAt, value, mutationId });

describe("parallel Cloud Worker", () => {
  it("serves health only on the new hostname and rejects uploaded-content paths", async () => {
    expect((await request("/health")).status).toBe(200);
    expect((await request("/raw/a/test/version/index.html")).status).toBe(404);
    expect((await runtime.dispatchFetch("https://accounts.otterware.app/health")).status).toBe(404);
    expect(
      (await runtime.dispatchFetch("https://usercontent.otterware.app/v1/cloud/connections"))
        .status,
    ).toBe(404);
  });
  it("rejects missing sessions, cookie authentication, and the wrong audience", async () => {
    expect(
      (
        await request("/v1/cloud/token", {
          method: "POST",
          body: JSON.stringify({ audience }),
          headers: { authorization: "Bearer invalid", "content-type": "application/json" },
        })
      ).status,
    ).toBe(401);
    expect(
      (await request("/v1/cloud/connections", { headers: { cookie: "session=offline-a" } })).status,
    ).toBe(401);
    const accessToken = await token();
    expect(
      (
        await request("/v1/cloud/connections", {
          headers: headers(accessToken, "environment:other"),
        })
      ).status,
    ).toBe(401);
    expect((await request("/v1/cloud/connections", { headers: headers(accessToken) })).status).toBe(
      200,
    );
    expect(
      (
        await request("/v1/cloud/connections", {
          headers: { ...headers(accessToken), origin: "https://usercontent.otterware.app" },
        })
      ).status,
    ).toBe(403);
  });
  it("resolves offline conflicts, retries and deletions deterministically, scoped to the account", async () => {
    const accessToken = await token();
    const low = "00000000-0000-4000-8000-000000000001",
      high = "00000000-0000-4000-8000-000000000002";
    const push = async (records: unknown[]) =>
      (
        await request("/v1/cloud/sync", {
          method: "POST",
          headers: headers(accessToken),
          body: JSON.stringify({ records }),
        })
      ).json() as Promise<{ records: { value: unknown; revision: number }[] }>;
    await push([mutation("theme", 100, "dark", low)]);
    const latest = await push([mutation("theme", 100, "light", high)]);
    const stale = await push([mutation("theme", 99, "older")]);
    const retry = await push([mutation("theme", 100, "light", high)]);
    expect(stale.records[0]!.value).toBe("light");
    expect(retry.records[0]!.revision).toBe(latest.records[0]!.revision);
    const removed = await push([mutation("theme", 101, null)]);
    expect(removed.records[0]!.value).toBeNull();
    const page = (await (
      await request(`/v1/cloud/sync?cursor=${latest.records[0]!.revision}`, {
        headers: headers(accessToken),
      })
    ).json()) as { records: { value: unknown }[] };
    expect(page.records).toHaveLength(1);
    expect(page.records[0]!.value).toBeNull();
    const other = (await (
      await request("/v1/cloud/sync", { headers: headers(await token("offline-b")) })
    ).json()) as { records: unknown[] };
    expect(other.records).toEqual([]);
  });
  it("paginates a reconnect snapshot and rejects unsupported collections and oversized bodies", async () => {
    const accessToken = await token();
    const h = headers(accessToken);
    const records = Array.from({ length: 100 }, (_, i) => mutation(`record-${i}`, i, { text: i }));
    expect(
      (
        await request("/v1/cloud/sync", {
          method: "POST",
          headers: h,
          body: JSON.stringify({ records }),
        })
      ).status,
    ).toBe(200);
    const first = (await (await request("/v1/cloud/sync", { headers: h })).json()) as {
      cursor: number;
      hasMore: boolean;
      records: unknown[];
    };
    expect(first.records).toHaveLength(100);
    expect(first.hasMore).toBe(true);
    const second = (await (
      await request(`/v1/cloud/sync?cursor=${first.cursor}`, { headers: h })
    ).json()) as { records: unknown[]; hasMore: boolean };
    expect(second.records).toHaveLength(1);
    expect(second.hasMore).toBe(false);
    expect(
      (
        await request("/v1/cloud/sync", {
          method: "POST",
          headers: h,
          body: JSON.stringify({ records: [{ ...records[0], collection: "credentials" }] }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request("/v1/cloud/sync", {
          method: "POST",
          headers: h,
          body: JSON.stringify({ records: [mutation("large", 1, "x".repeat(260_000))] }),
        })
      ).status,
    ).toBe(413);
  });
  it("uses one-time WebSocket tickets, forwards old Mail push, and checks auth for channel commands", async () => {
    const accessToken = await token();
    const response = await request("/v1/cloud/channel-ticket", {
      method: "POST",
      headers: headers(accessToken),
    });
    const { ticket } = (await response.json()) as { ticket: string };
    const upgrade = await request(`/v1/cloud/channel?ticket=${ticket}`, {
      headers: { upgrade: "websocket" },
    });
    expect(upgrade.status).toBe(101);
    const socket = upgrade.webSocket!;
    socket.accept();
    expect(
      (await request(`/v1/cloud/channel?ticket=${ticket}`, { headers: { upgrade: "websocket" } }))
        .status,
    ).toBe(401);
    const message = () =>
      new Promise<string>((resolve) =>
        socket.addEventListener("message", (event) => resolve(String(event.data)), { once: true }),
      );
    const reply = message();
    socket.send(JSON.stringify({ id: "pull", type: "sync.pull", cursor: 0 }));
    expect(JSON.parse(await reply)).toMatchObject({ type: "result", id: "pull" });
    const pushed = message();
    const identity = await runtime.getWorker("identity");
    await identity.fetch("https://identity/publish", {
      method: "POST",
      body: JSON.stringify({
        user: "offline-a",
        event: { type: "mail", email: "test@example.com", historyId: "42" },
      }),
    });
    expect(JSON.parse(await pushed)).toMatchObject({
      type: "module.push",
      module: "mail",
      event: { historyId: "42" },
    });
    socket.close();
  });
  it("keeps the imported OpenRouter connection API account-scoped", async () => {
    const response = await request("/v1/cloud/agent/connection", {
      headers: headers(await token()),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ connected: false });
  });
  it("accepts cookie-free standalone Drive requests and returns canonical document links", async () => {
    const response = await request("/v1/cloud/drive-token", {
      method: "POST",
      headers: { authorization: "Bearer offline-a", origin: "https://drive.otterware.app" },
    });
    expect(response.status).toBe(200);
    const { accessToken } = (await response.json()) as { accessToken: string };
    const h = { ...headers(accessToken, "otterware:drive"), origin: "https://drive.otterware.app" };
    const draft = await request("/api/v1/artifacts", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ title: "Standalone document", slug: "standalone-document" }),
    });
    expect(draft.status, await draft.clone().text()).toBe(201);
    const document = (await draft.json()) as { data: { url: string } };
    expect(new URL(document.data.url).origin).toBe("https://drive.otterware.app");
    expect((await request("/api/v1/folders", { headers: h })).status).toBe(200);
    expect((await request("/v1/cloud/connections", { headers: h })).status).toBe(403);
  });

  it("provisions a personal Drive on concurrent first authenticated calls", async () => {
    const h = { ...headers(await token("offline-b")), origin: "https://drive.otterware.app" };
    const responses = await Promise.all(
      [0, 1, 2].map(() => request("/api/v1/folders", { headers: h })),
    );
    for (const response of responses) {
      expect(response.status, await response.clone().text()).toBe(200);
      expect(await response.json()).toMatchObject({
        data: [expect.objectContaining({ kind: "personal", ownerUserId: "offline-b" })],
      });
    }
    const db = await runtime.getD1Database("DRIVE_DB", "cloud");
    expect(await db.prepare("SELECT count(*) AS n FROM user WHERE id='offline-b'").first()).toEqual(
      { n: 1 },
    );
    expect(
      await db
        .prepare(
          "SELECT count(*) AS n FROM account WHERE providerId='otter' AND accountId='offline-b'",
        )
        .first(),
    ).toEqual({ n: 1 });
    expect(
      await db
        .prepare(
          "SELECT count(*) AS n FROM folder WHERE kind='personal' AND owner_user_id='offline-b'",
        )
        .first(),
    ).toEqual({ n: 1 });
  });

  it("authorizes Drive mutations by the Cloud account despite unrelated host-only cookies", async () => {
    const accessToken = await token();
    const response = await request("/api/v1/folders", {
      method: "POST",
      headers: {
        ...headers(accessToken),
        origin: "https://mail.otterware.app",
        cookie: "__Host-otter-cloud-google=unrelated-state",
      },
      body: JSON.stringify({ name: "Cloud Drive", kind: "shared" }),
    });
    expect(response.status).toBe(201);
    const result = (await (
      await request("/api/v1/folders", { headers: headers(accessToken) })
    ).json()) as { data: { name: string }[] };
    expect(result.data.some((folder) => folder.name === "Cloud Drive")).toBe(true);
    expect((await request("/api/v1/folders", { headers: headers("invalid") })).status).toBe(401);
    expect(
      (await request("/api/v1/folders", { headers: headers(await token("offline-b")) })).status,
    ).toBe(200);
  });
  it("rejects an otherwise unexpired token immediately after account sign-out", async () => {
    const accessToken = await token("offline-b");
    const identity = await runtime.getWorker("identity");
    await identity.fetch("https://identity/revoke", { method: "POST", body: "offline-b" });
    expect((await request("/v1/cloud/connections", { headers: headers(accessToken) })).status).toBe(
      401,
    );
  });
});
