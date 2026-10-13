import type { ProviderToken } from "@otterware/otter-cloud-client";
import { GMAIL_SCOPES } from "../mail/contracts/google.ts";
import { EncryptJWT, jwtDecrypt, createRemoteJWKSet, jwtVerify } from "jose";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { cloudKey, allowedOrigin } from "./auth.ts";
import type { Env, Identity } from "./env.ts";
export const providerSchema = z.enum(["google", "microsoft"]);
type Provider = z.infer<typeof providerSchema>;
const scopes = {
  google: [
    ...GMAIL_SCOPES,
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/contacts.readonly",
  ],
  microsoft: [
    "openid",
    "email",
    "profile",
    "offline_access",
    "User.Read",
    "Mail.ReadWrite",
    "Mail.Send",
    "Calendars.ReadWrite",
    "Calendars.Read",
    "Contacts.Read",
  ],
};
export const connectSchema = z
  .object({
    provider: providerSchema,
    scopes: z.array(z.string()).min(1).max(20),
    returnTo: z.url(),
  })
  .strict();
const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().optional(),
  id_token: z.string().optional(),
  expires_in: z.number().positive().max(86400),
  scope: z.string().optional(),
  token_type: z.string().optional(),
});
type Connection = {
  id: string;
  user_id: string;
  provider: Provider;
  provider_subject: string;
  email: string;
  scopes: string;
  refresh_token: string;
  updated_at: number;
};
const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const microsoftKeys = createRemoteJWKSet(
  new URL("https://login.microsoftonline.com/common/discovery/v2.0/keys"),
);
function providerConfig(env: Env, provider: Provider) {
  const google = provider === "google";
  const secret = google ? env.GOOGLE_PROVIDER_CLIENT_SECRET : env.MICROSOFT_PROVIDER_CLIENT_SECRET;
  if (!secret)
    throw new HTTPException(503, {
      message: `${provider} provider client secret is not configured.`,
    });
  return {
    clientId: google ? env.GOOGLE_PROVIDER_CLIENT_ID : env.MICROSOFT_PROVIDER_CLIENT_ID,
    secret,
    authorize: google
      ? "https://accounts.google.com/o/oauth2/v2/auth"
      : "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token: google
      ? "https://oauth2.googleapis.com/token"
      : "https://login.microsoftonline.com/common/oauth2/v2.0/token",
  };
}
const callbackUrl = (env: Env, provider: Provider) =>
  `${env.CLOUD_ORIGIN}/v1/cloud/providers/${provider}/callback`;
const encode = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
const seal = async (env: Env, userId: string, connectionId: string, token: string) =>
  new EncryptJWT({ token })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setSubject(userId)
    .setAudience(connectionId)
    .encrypt(await cloudKey(env, "provider"));

/** Concurrent callbacks for the same subject must seal against the same persisted row ID. */
export async function connectionId(userId: string, provider: Provider, subject: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify([userId, provider, subject])),
    ),
  );
  bytes[6] = (bytes[6]! & 0x0f) | 0x80;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes.slice(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function startConnection(
  env: Env,
  identity: Identity,
  input: z.infer<typeof connectSchema>,
) {
  const config = providerConfig(env, input.provider);
  const destination = new URL(input.returnTo);
  if (
    !allowedOrigin(env, destination.origin) ||
    destination.username ||
    destination.password ||
    input.scopes.some((s) => !scopes[input.provider].includes(s))
  )
    throw new HTTPException(400, { message: "Invalid return URL or provider scopes." });
  const requested = [
    ...new Set([
      "openid",
      "email",
      "profile",
      ...(input.provider === "microsoft" ? ["offline_access"] : []),
      ...input.scopes,
    ]),
  ];
  const state = crypto.randomUUID(),
    nonce = crypto.randomUUID();
  const verifier = encode(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = encode(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))),
  );
  await env.ACCOUNT_DATA.batch([
    env.ACCOUNT_DATA.prepare("DELETE FROM provider_oauth_state WHERE expires_at<?").bind(
      Date.now(),
    ),
    env.ACCOUNT_DATA.prepare("INSERT INTO provider_oauth_state VALUES(?,?,?,?,?,?,?,?,?)").bind(
      state,
      identity.userId,
      identity.sessionId,
      input.provider,
      verifier,
      nonce,
      requested.join(" "),
      input.returnTo,
      Date.now() + 600_000,
    ),
  ]);
  const url = new URL(config.authorize);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: callbackUrl(env, input.provider),
    response_type: "code",
    scope: requested.join(" "),
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    ...(input.provider === "google"
      ? { access_type: "offline", prompt: "consent" }
      : { prompt: "select_account" }),
  }).toString();
  return { url: url.href, state };
}

async function exchange(env: Env, provider: Provider, params: Record<string, string>) {
  const config = providerConfig(env, provider);
  const response = await fetch(config.token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.secret,
      ...params,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new HTTPException(response.status === 400 ? 409 : 502, {
      message: "Provider grant unavailable. Reconnect this provider.",
    });
  return tokenSchema.parse(await response.json());
}

/** A host-only HttpOnly state cookie prevents linking an attacker's grant into another browser. */
export async function finishConnection(
  env: Env,
  provider: Provider,
  code: string,
  state: string,
  cookieState: string | undefined,
) {
  if (!cookieState || cookieState !== state)
    throw new HTTPException(400, { message: "Invalid OAuth state." });
  const pending = await env.ACCOUNT_DATA.prepare(
    "DELETE FROM provider_oauth_state WHERE id=? AND provider=? AND expires_at>? RETURNING *",
  )
    .bind(state, provider, Date.now())
    .first<{
      user_id: string;
      session_id: string;
      verifier: string;
      nonce: string;
      return_to: string;
      scopes: string;
    }>();
  if (!pending) throw new HTTPException(400, { message: "OAuth request expired or already used." });
  // The original account must still exist with the same unexpired session.
  const active = await env.ACCOUNTS_DB.prepare(
    "SELECT id FROM session WHERE id=? AND userId=? AND expiresAt>?",
  )
    .bind(pending.session_id, pending.user_id, Date.now())
    .first();
  if (!active) throw new HTTPException(401);
  const tokens = await exchange(env, provider, {
    grant_type: "authorization_code",
    code,
    code_verifier: pending.verifier,
    redirect_uri: callbackUrl(env, provider),
  });
  if (!tokens.id_token || !tokens.refresh_token)
    throw new HTTPException(409, {
      message: "Provider did not grant offline access. Connect again with consent.",
    });
  const config = providerConfig(env, provider);
  const { payload } = await jwtVerify(
    tokens.id_token,
    provider === "google" ? googleKeys : microsoftKeys,
    {
      audience: config.clientId,
      algorithms: ["RS256"],
      ...(provider === "google"
        ? { issuer: ["https://accounts.google.com", "accounts.google.com"] }
        : {}),
    },
  );
  if (
    payload.nonce !== pending.nonce ||
    !payload.sub ||
    (provider === "microsoft" &&
      (typeof payload.tid !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(payload.tid) ||
        payload.iss !== `https://login.microsoftonline.com/${payload.tid}/v2.0`))
  )
    throw new HTTPException(401);
  if (
    provider === "google" &&
    (payload.email_verified !== true || typeof payload.email !== "string")
  )
    throw new HTTPException(401);
  const subject = provider === "microsoft" ? `${payload.tid}:${payload.sub}` : payload.sub;
  const existing = await env.ACCOUNT_DATA.prepare(
    "SELECT id FROM provider_connection WHERE user_id=? AND provider=? AND provider_subject=?",
  )
    .bind(pending.user_id, provider, subject)
    .first<{ id: string }>();
  const id = existing?.id ?? (await connectionId(pending.user_id, provider, subject));
  const granted = tokens.scope?.split(" ").filter(Boolean);
  if (!granted)
    throw new HTTPException(502, { message: "Provider did not return granted scopes." });
  await env.ACCOUNT_DATA.prepare(
    `INSERT INTO provider_connection VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,provider,provider_subject) DO UPDATE SET scopes=excluded.scopes, refresh_token=excluded.refresh_token, email=excluded.email, updated_at=excluded.updated_at`,
  )
    .bind(
      id,
      pending.user_id,
      provider,
      subject,
      String(payload.email ?? payload.preferred_username ?? ""),
      JSON.stringify(granted),
      await seal(env, pending.user_id, id, tokens.refresh_token),
      Date.now(),
    )
    .run();
  await env.ENVIRONMENT_HUB.get(env.ENVIRONMENT_HUB.idFromName(pending.user_id)).publish({
    type: "connections.changed",
  });
  return pending.return_to;
}

export async function listConnections(env: Env, userId: string) {
  const rows = await env.ACCOUNT_DATA.prepare(
    "SELECT id,provider,email,scopes,updated_at FROM provider_connection WHERE user_id=? ORDER BY id",
  )
    .bind(userId)
    .all<Pick<Connection, "id" | "provider" | "email" | "scopes" | "updated_at">>();
  return {
    connections: rows.results.map((r) => ({
      id: r.id,
      provider: r.provider,
      email: r.email,
      scopes: JSON.parse(r.scopes) as string[],
      updatedAt: r.updated_at,
    })),
  };
}

export async function providerToken(env: Env, identity: Identity, id: string) {
  const row = await env.ACCOUNT_DATA.prepare(
    "SELECT * FROM provider_connection WHERE id=? AND user_id=?",
  )
    .bind(id, identity.userId)
    .first<Connection>();
  if (!row) throw new HTTPException(404, { message: "Provider connection not found." });
  const { payload } = await jwtDecrypt(row.refresh_token, await cloudKey(env, "provider"), {
    subject: identity.userId,
    audience: id,
  });
  if (typeof payload.token !== "string") throw new HTTPException(500);
  const tokens = await exchange(env, row.provider, {
    grant_type: "refresh_token",
    refresh_token: payload.token,
  });
  // Compare-and-swap prevents an in-flight refresh from recreating a disconnected grant.
  const result = await env.ACCOUNT_DATA.prepare(
    "UPDATE provider_connection SET refresh_token=?,scopes=?,updated_at=? WHERE id=? AND user_id=? AND refresh_token=?",
  )
    .bind(
      tokens.refresh_token
        ? await seal(env, identity.userId, id, tokens.refresh_token)
        : row.refresh_token,
      tokens.scope ? JSON.stringify(tokens.scope.split(" ").filter(Boolean)) : row.scopes,
      Date.now(),
      id,
      identity.userId,
      row.refresh_token,
    )
    .run();
  if (!result.meta.changes)
    throw new HTTPException(409, { message: "Provider connection changed. Retry." });
  return {
    connectionId: id,
    accessToken: tokens.access_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
    audience: identity.audience,
    scopes: tokens.scope?.split(" ").filter(Boolean) ?? (JSON.parse(row.scopes) as string[]),
  } satisfies ProviderToken;
}
export async function disconnect(env: Env, userId: string, id: string) {
  // Delete locally first: no new credentials can be handed out, even if the provider is down.
  await env.ACCOUNT_DATA.prepare("DELETE FROM provider_connection WHERE id=? AND user_id=?")
    .bind(id, userId)
    .run();
}
