// @effect-diagnostics globalDate:off -- Promise-based provider port for module workers, like the server's DeviceGoogle.
/**
 * Google in this browser, the way standalone Otter Mail web does it: Otter Mail's relay runs
 * Google's consent with its web client and seals the refresh token for this Otter Account. The
 * browser keeps the sealed token (sealed again under this profile's key) and asks the relay for
 * each access token. Neither the relay nor Otter Cloud stores it, and it does not follow the
 * account to other devices; each device connects Google itself.
 *
 * @module BrowserGoogle
 */
import type { DeviceProviders } from "@otterware/module-kit/account";
import { SuiteSqlClient } from "@otterware/module-kit/runtime";
import { PROVIDER_SCOPES } from "@otterware/otter-cloud-client/scopes";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { BrowserPlatform } from "../BrowserPlatform.ts";
import { BrowserSecrets } from "../BrowserSecrets.ts";
import { BrowserAccount } from "./BrowserAccount.ts";

const DEFAULT_RELAY = "https://relay.mail.otterware.app";
const ID_PREFIX = "browser:google:";

const Grants = Schema.fromJsonString(
  Schema.Record(
    Schema.String,
    Schema.Struct({ email: Schema.String, sealed: Schema.String, updatedAt: Schema.Number }),
  ),
);
type Grants = { -readonly [id in keyof typeof Grants.Type]: (typeof Grants.Type)[id] };
const decodeGrants = Schema.decodeEffect(Grants);
const encodeGrants = Schema.encodeEffect(Grants);

export class BrowserGoogle extends Context.Service<
  BrowserGoogle,
  DeviceProviders & {
    /** Keeps the sealed grant the relay's popup handed the page. */
    readonly save: (grant: { readonly email: string; readonly sealed: string }) => Promise<void>;
  }
>()("@otterware/browser-environment/account/BrowserGoogle") {}

export const layer = Layer.effect(
  BrowserGoogle,
  Effect.gen(function* () {
    const account = yield* BrowserAccount;
    const platform = yield* BrowserPlatform;
    const secrets = yield* BrowserSecrets;
    const sql = yield* SuiteSqlClient;
    const listeners = new Set<() => void>();
    const access = new Map<string, { accessToken: string; expiresAt: number }>();

    const signedIn = () =>
      Effect.runPromise(
        Effect.all([account.state, account.sessionToken, account.credential]).pipe(
          Effect.map(([state, token, credential]) =>
            state.userId && Option.isSome(token) && Option.isSome(credential)
              ? {
                  userId: state.userId,
                  token: token.value,
                  relay: (credential.value.mailRelayUrl ?? DEFAULT_RELAY).replace(/\/$/, ""),
                }
              : null,
          ),
        ),
      );
    const required = async () => {
      const current = await signedIn();
      if (!current) throw new Error("Sign in to your Otter Account.");
      return current;
    };
    const read = (userId: string) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const rows = yield* sql<{ readonly value: string }>`
            SELECT value FROM browser_meta WHERE key = ${`google:${userId}`}
          `;
          const stored = rows[0]?.value;
          if (stored === undefined) return {};
          const text = yield* secrets.open(stored);
          return yield* decodeGrants(text).pipe(
            Effect.map((grants): Grants => ({ ...grants })),
            Effect.orElseSucceed((): Grants => ({})),
          );
        }),
      );
    const write = (userId: string, grants: Grants) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const value = yield* secrets.seal(yield* encodeGrants(grants));
          yield* sql`
            INSERT INTO browser_meta (key, value) VALUES (${`google:${userId}`}, ${value})
            ON CONFLICT (key) DO UPDATE SET value = excluded.value
          `;
        }),
      );
    const changed = () => {
      for (const listener of [...listeners]) listener();
    };
    const relay = async (path: string, body: unknown) => {
      const current = await required();
      const response = await platform.fetch(`${current.relay}${path}`, {
        method: "POST",
        headers: { authorization: `Bearer ${current.token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        credentials: "omit",
        cache: "no-store",
      });
      if (response.status === 410)
        throw new Error("Google ended this sign-in. Connect Google in this browser again.");
      if (!response.ok) throw new Error("Could not reach Otter Mail's relay. Try again.");
      return (await response.json()) as Record<string, unknown>;
    };

    return BrowserGoogle.of({
      connections: async () => {
        const current = await signedIn();
        if (!current) return [];
        return Object.entries(await read(current.userId)).map(([id, grant]) => ({
          id,
          provider: "google" as const,
          email: grant.email,
          scopes: [...PROVIDER_SCOPES.google],
          updatedAt: grant.updatedAt,
        }));
      },
      providerToken: async (id) => {
        const current = await required();
        const grant = (await read(current.userId))[id];
        if (!grant) throw new Error("Google is not connected in this browser.");
        let token = access.get(id);
        if (!token || token.expiresAt < Date.now() + 60_000) {
          const fresh = await relay("/v1/gmail/token", { sealed: grant.sealed });
          token = {
            accessToken: String(fresh.accessToken),
            expiresAt: Date.now() + Number(fresh.expiresIn) * 1_000,
          };
          access.set(id, token);
        }
        return {
          connectionId: id,
          accessToken: token.accessToken,
          expiresAt: token.expiresAt,
          audience: "device",
          scopes: [...PROVIDER_SCOPES.google],
        };
      },
      connect: async (provider) => {
        if (provider !== "google")
          throw new Error("Only Google can be connected in this browser for now.");
        const { url } = await relay("/v1/gmail/start", {});
        return { url: String(url) };
      },
      disconnect: async (id) => {
        const current = await required();
        const grants = await read(current.userId);
        if (!grants[id]) return;
        delete grants[id];
        access.delete(id);
        // Forget it here only: Google revokes per project, which would end other devices too.
        await write(current.userId, grants);
        changed();
      },
      save: async ({ email, sealed }) => {
        const current = await required();
        const grants = await read(current.userId);
        grants[`${ID_PREFIX}${email}`] = { email, sealed, updatedAt: Date.now() };
        access.delete(`${ID_PREFIX}${email}`);
        await write(current.userId, grants);
        changed();
      },
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    });
  }),
);
