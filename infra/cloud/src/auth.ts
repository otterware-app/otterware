import { EncryptJWT, jwtDecrypt } from "jose";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { derivedKey } from "../mail/src/keys.ts";
import { isPublicDriveRequest } from "./drive-browser.ts";
import type { Env } from "./env.ts";

export const audienceSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-zA-Z0-9:/._-]+$/);
const claimsSchema = z.object({
  sub: z.string(),
  sid: z.string(),
  token: z.string(),
  aud: audienceSchema,
  exp: z.number(),
});
export const allowedOrigin = (env: Env, origin: string) =>
  [env.CLOUD_ORIGIN, ...env.ALLOWED_ORIGINS.split(",")].includes(origin);

export function requireBrowserOrigin(request: Request, env: Env) {
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigin(env, origin))
    throw new HTTPException(403, { message: "Origin is not allowed." });
}

/** Secrets have separate derivation contexts; no shared cookies or raw refresh tokens. */
export const cloudKey = (env: Env, purpose: string) => {
  if (!env.CLOUD_SECRET || env.CLOUD_SECRET.length < 32)
    throw new HTTPException(503, { message: "Cloud signing secret is not configured." });
  return derivedKey(env.CLOUD_SECRET, `otter-cloud ${purpose}`);
};

export async function accountSession(env: Env, token: string) {
  const session = await env.ACCOUNTS.getSession({ authorization: `Bearer ${token}` });
  if (!session || new Date(session.session.expiresAt).getTime() <= Date.now())
    throw new HTTPException(401, { message: "Sign in to your Otter Account again." });
  return session;
}

/** Exchanges an existing offline account session for a 15-minute, audience-bound Cloud capability. */
export async function issueToken(env: Env, sessionToken: string, audience: string) {
  const found = await accountSession(env, sessionToken);
  const expiresAt = Math.min(Date.now() + 900_000, new Date(found.session.expiresAt).getTime());
  const accessToken = await new EncryptJWT({ sid: found.session.id, token: sessionToken })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuer(env.CLOUD_ORIGIN)
    .setSubject(found.user.id)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt / 1000))
    .encrypt(await cloudKey(env, "access"));
  return { accessToken, expiresAt, audience };
}

export async function verifyToken(env: Env, token: string, audience: string) {
  const key = await cloudKey(env, "access");
  let claims;
  try {
    const { payload } = await jwtDecrypt(token, key, {
      issuer: env.CLOUD_ORIGIN,
      audience,
      keyManagementAlgorithms: ["dir"],
      contentEncryptionAlgorithms: ["A256GCM"],
    });
    claims = claimsSchema.parse(payload);
  } catch {
    throw new HTTPException(401, { message: "Invalid or expired Cloud token." });
  }
  // Check revocation online, including on every credential hand-out over a socket.
  const found = await accountSession(env, claims.token);
  if (found.user.id !== claims.sub || found.session.id !== claims.sid)
    throw new HTTPException(401, { message: "Account session changed." });
  return {
    userId: claims.sub,
    sessionId: claims.sid,
    sessionToken: claims.token,
    audience,
    expiresAt: claims.exp * 1000,
    accountUser: found.user,
  };
}

export async function authenticate(request: Request, env: Env) {
  if (!isPublicDriveRequest(request)) requireBrowserOrigin(request, env);
  const header = request.headers.get("authorization");
  const audience = request.headers.get("x-otter-audience");
  if (!header?.startsWith("Bearer ") || !audience) throw new HTTPException(401);
  return verifyToken(env, header.slice(7), audience);
}
