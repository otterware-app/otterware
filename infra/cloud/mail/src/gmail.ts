/**
 * Gmail sign-in for the web app. A browser can't keep a Google refresh token
 * on its own (web OAuth clients need a secret), so the relay does the OAuth
 * exchange with the web client and seals the refresh token: the browser
 * keeps the sealed token, only the relay can open it, and the relay stores
 * nothing. The desktop app signs in to Gmail itself and never comes here.
 *
 *   GET  /v1/gmail/authorize  (popup) → Google's consent
 *   POST /v1/gmail/start      Otterware's apps (bearer session): `{ url }` of the same consent,
 *                             asking for Mail, Calendar and contacts at once
 *   GET  /v1/gmail/callback   → posts the sealed token and a first access token to the page
 *   POST /v1/gmail/token      `{ sealed }` → a fresh access token (410 once Google revoked it)
 *   POST /v1/dev/gmail        `pnpm dev:demo` only: a saved sign-in, sealed as the popup would
 */

import { PROVIDER_SCOPES } from "@otterware/otter-cloud-client/scopes";
import { GMAIL_SCOPES } from "../contracts/google.ts";
import { EncryptJWT, jwtDecrypt, jwtVerify, SignJWT } from "jose";

import { googleKeys } from "./auth.ts";
import { derivedKey } from "./keys.ts";
import { verifyGoogleJwt } from "./google-jwt.ts";
import type { Env } from "./worker.ts";

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const tokenUrl = (env: Env) => env.GOOGLE_TOKEN_URL || TOKEN_URL;
const clientId = (env: Env) => env.GOOGLE_GMAIL_CLIENT_ID;

export const callbackUrl = (env: Env) => `${env.BETTER_AUTH_URL}/v1/gmail/callback`;

/** One key signs sign-in states, one seals refresh tokens. */
const key = (env: Env, purpose: "state" | "seal") =>
  derivedKey(env.BETTER_AUTH_SECRET, `otter-mail gmail ${purpose}`);

/** Otterware's browser apps: one consent covers Mail, Calendar and contacts in that browser. */
const SUITE_SCOPES = ["openid", "email", "profile", ...PROVIDER_SCOPES.google];

/** Otterware app origins that sign in here with a bearer session (no relay cookie). */
export const suiteOrigins = (env: Env) =>
  (env.SUITE_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

/**
 * Google's consent screen for the web client, for the signed-in user. `suiteOrigin` is the
 * Otterware app that asked; the state carries it, since Google's redirect back has no cookie.
 */
export async function authorizeUrl(
  env: Env,
  userId: string,
  loginHint?: string,
  suiteOrigin?: string,
): Promise<string> {
  const state = await new SignJWT(suiteOrigin ? { origin: suiteOrigin } : {})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setExpirationTime("10m")
    .sign(await key(env, "state"));
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: clientId(env),
    redirect_uri: callbackUrl(env),
    response_type: "code",
    scope: (suiteOrigin ? SUITE_SCOPES : GMAIL_SCOPES).join(" "),
    access_type: "offline",
    // Consent every time, so Google always returns a refresh token.
    prompt: "consent",
    state,
    ...(loginHint ? { login_hint: loginHint } : {}),
  }).toString();
  return url.toString();
}

/** Who a sign-in state was issued to, and for which Otterware app; throws if forged or stale. */
export async function readState(
  env: Env,
  state: string,
): Promise<{ userId: string; origin: string | null }> {
  const { payload } = await jwtVerify<{ origin?: string }>(state, await key(env, "state"), {
    algorithms: ["HS256"],
  });
  const origin = typeof payload.origin === "string" ? payload.origin : null;
  return {
    userId: payload.sub!,
    origin: origin && suiteOrigins(env).includes(origin) ? origin : null,
  };
}

/** The Otter user a sign-in state was issued to; throws if forged or stale. */
export async function stateUser(env: Env, state: string): Promise<string> {
  return (await readState(env, state)).userId;
}

type GoogleTokens = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  error?: string;
};

async function tokenRequest(env: Env, params: Record<string, string>): Promise<GoogleTokens> {
  const response = await fetch(tokenUrl(env), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId(env),
      client_secret: env.GOOGLE_GMAIL_CLIENT_SECRET,
      ...params,
    }),
  });
  const body = (await response.json().catch(() => ({}))) as GoogleTokens;
  if (!response.ok || body.error)
    throw new GoogleTokenError(body.error ?? `HTTP ${response.status}`);
  return body;
}

export class GoogleTokenError extends Error {
  get revoked() {
    return this.message === "invalid_grant";
  }
}

/** What the popup hands the page (apps/web/src/web/protocol.ts, GoogleSignInResult). */
export type SignInResult = {
  email: string;
  name: string;
  picture: string | null;
  sealed: string;
  accessToken: string;
  expiresIn: number;
};

/** Exchanges the code, then seals the refresh token for this user. */
export async function completeSignIn(
  env: Env,
  userId: string,
  code: string,
): Promise<SignInResult> {
  const tokens = await tokenRequest(env, {
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl(env),
  });
  if (!tokens.refresh_token || !tokens.id_token) {
    throw new GoogleTokenError("Google did not return a refresh token.");
  }
  return sealSignIn(env, userId, tokens.refresh_token, tokens);
}

/**
 * The demo (`pnpm dev:demo`, DEV_DEMO): its mailbox's saved sign-in with
 * the web client, sealed for this user as the popup's would be.
 */
export async function demoSignIn(
  env: Env,
  userId: string,
  refreshToken: string,
): Promise<SignInResult> {
  const tokens = await tokenRequest(env, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  if (!tokens.id_token) throw new GoogleTokenError("Google did not return an ID token.");
  return sealSignIn(env, userId, refreshToken, tokens);
}

/** Seals the refresh token for this user: what the page keeps, with a first access token. */
async function sealSignIn(
  env: Env,
  userId: string,
  refreshToken: string,
  tokens: GoogleTokens,
): Promise<SignInResult> {
  const claims = await verifyGoogleJwt(tokens.id_token!, clientId(env), googleKeys(env));
  const sealed = await new EncryptJWT({
    email: claims.email,
    refreshToken,
    clientId: clientId(env),
  })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setSubject(userId)
    .setIssuedAt()
    .encrypt(await key(env, "seal"));
  return {
    email: claims.email,
    name: claims.name ?? claims.email,
    picture: claims.picture ?? null,
    sealed,
    accessToken: tokens.access_token,
    expiresIn: tokens.expires_in,
  };
}

/** A fresh access token (and ID token) from a sealed refresh token, for its owner only. */
export async function refresh(env: Env, userId: string, sealed: string) {
  const { payload } = await jwtDecrypt<{ refreshToken: string; clientId?: string }>(
    sealed,
    await key(env, "seal"),
    {
      subject: userId,
    },
  );
  // A grant sealed for another client can't be refreshed: sign in again.
  if (payload.clientId !== clientId(env)) throw new GoogleTokenError("invalid_grant");
  const tokens = await tokenRequest(env, {
    grant_type: "refresh_token",
    refresh_token: payload.refreshToken,
  });
  return {
    accessToken: tokens.access_token,
    expiresIn: tokens.expires_in,
    idToken: tokens.id_token ?? null,
  };
}

/** The popup's last page: hands the result (or error) to the app and closes. */
export function popupResponse(
  env: Env,
  message: { result?: SignInResult; error?: string },
  suiteOrigin: string | null = null,
) {
  return popupPage(env, "gmail", message, suiteOrigin);
}

/** Shared result transport; suite origins were validated in the signed consent state. */
export function popupPage(
  env: Env,
  provider: "gmail" | "outlook",
  message: { result?: unknown; error?: string },
  suiteOrigin: string | null = null,
) {
  const payload = JSON.stringify({ type: `otter:${provider}-sign-in`, ...message }).replace(
    /</g,
    "\\u003c",
  );
  const html = `<!doctype html><meta charset="utf-8"><title>Otter Mail</title>
<body style="font:15px -apple-system,BlinkMacSystemFont,sans-serif;display:grid;place-items:center;height:90vh">
<p>${message.error ? "Sign-in didn't work. You can close this window." : "Signed in. You can close this window."}</p>
<script>
const message = ${payload};
if (window.opener) {
  window.opener.postMessage(message, ${JSON.stringify(suiteOrigin ?? env.APP_ORIGIN)});
  window.close();
} else if (${JSON.stringify(suiteOrigin === null)}) {
  // Signed in in the app's own tab (the browser blocked the popup): take the answer back there.
  location.replace(${JSON.stringify(`${env.APP_ORIGIN}/app`)} + "#${provider}-sign-in=" + encodeURIComponent(JSON.stringify(message)));
}
</script>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
