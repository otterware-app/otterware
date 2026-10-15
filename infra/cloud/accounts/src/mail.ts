/** Mail's installed clients retain their API and cookies. Browser sign-in uses OIDC. */
import { Hono } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { createLocalJWKSet, jwtVerify } from "jose";
import { and, eq } from "drizzle-orm";
import { createAuth } from "./auth.ts";
import type { App } from "./env.ts";
import { session } from "./schema.ts";

const routes = new Hono<App>();
const stateCookie = (secure: boolean) => `${secure ? "__Host-" : ""}otter-mail-login`;

routes.post("/start", async (c) => {
  if (c.req.header("origin") !== c.env.APP_ORIGIN && c.req.header("origin") !== c.env.MAIL_AUTH_URL)
    throw new HTTPException(403, { message: "Start sign-in from Otter Mail." });
  const body = await c.req.json<{ callbackURL?: string }>();
  const callback = new URL(body.callbackURL || c.env.APP_ORIGIN, c.env.APP_ORIGIN);
  if (callback.origin !== c.env.APP_ORIGIN)
    throw new HTTPException(400, { message: "Invalid Mail callback." });
  const state = crypto.randomUUID();
  const verifier = crypto.randomUUID() + crypto.randomUUID();
  const challenge = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  const encoded = btoa(String.fromCharCode(...challenge))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM mail_login WHERE expires_at < ?").bind(Date.now()),
    c.env.DB.prepare(
      "INSERT INTO mail_login (state, verifier, callback, expires_at) VALUES (?, ?, ?, ?)",
    ).bind(state, verifier, callback.toString(), Date.now() + 600_000),
  ]);
  await setSignedCookie(
    c,
    stateCookie(c.env.MAIL_AUTH_URL.startsWith("https:")),
    state,
    c.env.BETTER_AUTH_SECRET,
    {
      httpOnly: true,
      secure: c.env.MAIL_AUTH_URL.startsWith("https:"),
      sameSite: "Lax",
      path: "/",
      maxAge: 600,
    },
  );
  const query = new URLSearchParams({
    client_id: "otter-mail",
    redirect_uri: `${c.env.MAIL_AUTH_URL}/v1/auth/callback/otter`,
    response_type: "code",
    scope: "openid profile email",
    state,
    nonce: state,
    code_challenge: encoded,
    code_challenge_method: "S256",
  });
  return c.json({
    url: `${c.env.BETTER_AUTH_URL}/v1/auth/oauth2/authorize?${query}`,
    redirect: true,
  });
});

routes.get("/callback", async (c) => {
  const state = c.req.query("state");
  const code = c.req.query("code");
  if (
    !state ||
    !code ||
    (await getSignedCookie(
      c,
      c.env.BETTER_AUTH_SECRET,
      stateCookie(c.env.MAIL_AUTH_URL.startsWith("https:")),
    )) !== state
  )
    throw new HTTPException(400, { message: "Sign-in expired. Start again from Mail." });
  const login = await c.env.DB.prepare(
    "DELETE FROM mail_login WHERE state = ? AND expires_at > ? RETURNING verifier, callback",
  )
    .bind(state, Date.now())
    .first<{ verifier: string; callback: string }>();
  if (!login) throw new HTTPException(400, { message: "Sign-in expired. Start again from Mail." });
  deleteCookie(c, stateCookie(c.env.MAIL_AUTH_URL.startsWith("https:")), {
    path: "/",
    secure: c.env.MAIL_AUTH_URL.startsWith("https:"),
  });
  const auth = createAuth(c.env, c.var.db);
  const response = await auth.handler(
    new Request(`${c.env.BETTER_AUTH_URL}/v1/auth/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: "otter-mail",
        grant_type: "authorization_code",
        code,
        code_verifier: login.verifier,
        redirect_uri: `${c.env.MAIL_AUTH_URL}/v1/auth/callback/otter`,
      }),
    }),
  );
  if (!response.ok)
    throw new HTTPException(400, { message: "Could not finish sign-in. Try again." });
  const { id_token: token } = (await response.json()) as { id_token: string };
  const keys = (await (
    await auth.handler(new Request(`${c.env.BETTER_AUTH_URL}/v1/auth/jwks`))
  ).json()) as Parameters<typeof createLocalJWKSet>[0];
  const { payload } = await jwtVerify(token, createLocalJWKSet(keys), {
    issuer: `${c.env.BETTER_AUTH_URL}/v1/auth`,
    audience: "otter-mail",
    algorithms: ["RS256"],
  });
  if (payload.nonce !== state || typeof payload.sid !== "string" || !payload.sub)
    throw new HTTPException(400, { message: "Invalid sign-in." });
  const found = await c.var.db.query.session.findFirst({
    where: and(eq(session.id, payload.sid), eq(session.userId, payload.sub)),
  });
  if (!found || found.expiresAt.getTime() <= Date.now()) throw new HTTPException(401);
  // The Mail cookie retains its original signature and domain. The session is owned by Accounts.
  const legacy = await createAuth(c.env, c.var.db, true).$context;
  const cookie = legacy.authCookies.sessionToken;
  await setSignedCookie(c, cookie.name, found.token, c.env.BETTER_AUTH_SECRET, {
    ...cookie.attributes,
    sameSite: "Lax",
    maxAge: Math.floor((found.expiresAt.getTime() - Date.now()) / 1000),
  });
  return c.redirect(login.callback);
});

export default routes;
