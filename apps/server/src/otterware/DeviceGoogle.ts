// @effect-diagnostics globalFetch:off globalTimers:off globalDate:off nodeBuiltinImport:off -- Promise-based provider port for module workers; the layer scope closes it.
/**
 * Google on this device: one consent (Mail, Calendar and contacts) per environment, with the
 * refresh token kept in this environment's secret store. It never reaches Otter Cloud and does
 * not follow the account to other devices; each device connects Google itself.
 *
 * The client is a Google "Desktop app" OAuth client (`T3CODE_GOOGLE_CLIENT_ID`/`_SECRET`, the
 * same configuration Calendar's local sign-in reads); its loopback redirect runs on this machine.
 *
 * @module DeviceGoogle
 */
import * as NodeCrypto from "node:crypto";
import * as NodeHttp from "node:http";
import type { DeviceProviders } from "@otterware/module-kit/account";
import { PROVIDER_SCOPES } from "@otterware/otter-cloud-client/scopes";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { ServerSecretStore } from "../auth/ServerSecretStore.ts";

const SECRET = "otterware-device-google";
const ID_PREFIX = "device:google:";

interface Grant {
  readonly email: string;
  readonly refreshToken: string;
  readonly scopes: ReadonlyArray<string>;
  readonly updatedAt: number;
}
interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

export const make = Effect.gen(function* () {
  const secrets = yield* ServerSecretStore;
  const client = yield* Config.all({
    clientId: Config.String("T3CODE_GOOGLE_CLIENT_ID").pipe(Config.withDefault("")),
    clientSecret: Config.String("T3CODE_GOOGLE_CLIENT_SECRET").pipe(Config.withDefault("")),
  });
  const listeners = new Set<() => void>();
  const access = new Map<string, { accessToken: string; expiresAt: number }>();
  let cancel: (() => void) | undefined;
  const read = async (): Promise<Record<string, Grant>> => {
    const saved = await Effect.runPromise(secrets.get(SECRET));
    if (Option.isNone(saved)) return {};
    try {
      return JSON.parse(new TextDecoder().decode(saved.value)) as Record<string, Grant>;
    } catch {
      return {};
    }
  };
  const write = (grants: Record<string, Grant>) =>
    Effect.runPromise(secrets.set(SECRET, new TextEncoder().encode(JSON.stringify(grants))));
  const changed = () => {
    for (const listener of [...listeners]) listener();
  };
  const exchange = async (body: Record<string, string>): Promise<TokenResponse> => {
    if (!client.clientId)
      throw new Error("Google sign-in is not configured in this build of Otterware.");
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: client.clientId,
        ...(client.clientSecret ? { client_secret: client.clientSecret } : {}),
        ...body,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok)
      throw new Error("Google refused this device's sign-in. Connect Google on this device again.");
    return (await response.json()) as TokenResponse;
  };
  const complete = async (code: string, redirect: string, verifier: string) => {
    const token = await exchange({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirect,
      code_verifier: verifier,
    });
    const profile = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { authorization: `Bearer ${token.access_token}` },
      signal: AbortSignal.timeout(30_000),
    });
    const user = profile.ok ? ((await profile.json()) as { email?: string }) : {};
    if (!user.email || !token.refresh_token)
      throw new Error("Google did not grant offline access to a mailbox.");
    const grants = await read();
    const id = `${ID_PREFIX}${user.email}`;
    grants[id] = {
      email: user.email,
      refreshToken: token.refresh_token,
      scopes: token.scope?.split(" ").filter(Boolean) ?? [],
      updatedAt: Date.now(),
    };
    await write(grants);
    access.set(id, {
      accessToken: token.access_token,
      expiresAt: Date.now() + token.expires_in * 1000,
    });
    changed();
  };
  /** Loopback PKCE (RFC 8252): the browser on this machine returns to a one-shot local port. */
  const connect: DeviceProviders["connect"] = async (provider) => {
    if (provider !== "google")
      throw new Error("Only Google can be connected on this device for now.");
    if (!client.clientId)
      throw new Error("Google sign-in is not configured in this build of Otterware.");
    cancel?.();
    const verifier = NodeCrypto.randomBytes(32).toString("base64url");
    const state = NodeCrypto.randomBytes(24).toString("base64url");
    let finish: (code: string | null) => void = () => {};
    const server = NodeHttp.createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/callback" || url.searchParams.get("state") !== state) {
        response.writeHead(400).end("Invalid Google sign-in callback.");
        return;
      }
      response
        .writeHead(200, { "content-type": "text/plain; charset=utf-8" })
        .end("Google is connected on this device. Return to Otterware.");
      finish(url.searchParams.get("code"));
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Could not open Google sign-in.");
    const redirect = `http://127.0.0.1:${address.port}/callback`;
    const close = () => {
      clearTimeout(timer);
      server.closeAllConnections();
      server.close();
    };
    const timer = setTimeout(() => finish(null), 5 * 60_000);
    cancel = () => finish(null);
    finish = (code) => {
      finish = () => {};
      close();
      if (code) void complete(code, redirect, verifier).catch(() => {});
    };
    const challenge = NodeCrypto.createHash("sha256").update(verifier).digest("base64url");
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: client.clientId,
      redirect_uri: redirect,
      response_type: "code",
      scope: ["openid", "email", "profile", ...PROVIDER_SCOPES.google].join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString();
    return { url: url.href };
  };
  const devices: DeviceProviders = {
    connections: async () =>
      Object.entries(await read()).map(([id, grant]) => ({
        id,
        provider: "google" as const,
        email: grant.email,
        scopes: [...grant.scopes],
        updatedAt: grant.updatedAt,
      })),
    providerToken: async (id) => {
      const grant = (await read())[id];
      if (!grant) throw new Error("Google is not connected on this device.");
      let current = access.get(id);
      if (!current || current.expiresAt < Date.now() + 60_000) {
        const token = await exchange({
          grant_type: "refresh_token",
          refresh_token: grant.refreshToken,
        });
        current = {
          accessToken: token.access_token,
          expiresAt: Date.now() + token.expires_in * 1000,
        };
        access.set(id, current);
      }
      return {
        connectionId: id,
        accessToken: current.accessToken,
        expiresAt: current.expiresAt,
        audience: "device",
        scopes: [...grant.scopes],
      };
    },
    connect,
    disconnect: async (id) => {
      const grants = await read();
      const grant = grants[id];
      if (!grant) return;
      delete grants[id];
      access.delete(id);
      // Forget it here only. Google revokes per project, not per device, so revoking would
      // also end other devices' sign-ins; the user removes access in their Google Account.
      await write(grants);
      changed();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  yield* Effect.addFinalizer(() => Effect.sync(() => cancel?.()));
  return devices;
});
