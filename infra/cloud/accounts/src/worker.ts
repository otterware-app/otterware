import { WorkerEntrypoint } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { createAuth, signInMethods } from "./auth.ts";
import type { App, Env } from "./env.ts";
import identity from "./identity.ts";
import mail from "./mail.ts";
import { favicon } from "./page.ts";
import { verification } from "./schema.ts";
import { openDb } from "./store.ts";
import { continueLogout, endSession, logoutDestination, requireOrigin } from "./browser.ts";

const app = new Hono<App>();
// Before the middleware: a static file, cached, that needs no database.
app.get("/favicon.svg", (c) =>
  c.body(favicon, 200, {
    "Content-Type": "image/svg+xml",
    "Cache-Control": "public, max-age=86400",
  }),
);
app.use(async (c, next) => {
  if (c.env.MAINTENANCE === "true" && c.req.path !== "/health") {
    c.header("Retry-After", "60");
    return c.json({ error: "Account maintenance in progress. Please try again shortly." }, 503);
  }
  const db = openDb(c.env.DB);
  c.set("db", db);
  c.set("auth", createAuth(c.env, db, new URL(c.req.url).origin === c.env.MAIL_AUTH_URL));
  // These public-client endpoints use bearer tokens/PKCE and never browser cookies.
  const publicOAuth = [
    "/v1/auth/oauth2/token",
    "/v1/auth/oauth2/revoke",
    "/v1/auth/code/session",
    "/v1/auth/code/grants",
    "/v1/auth/code/grants/revoke",
    "/v1/auth/suite/session",
  ].includes(c.req.path);
  const responseHeaders = () => {
    if (publicOAuth) {
      c.header("Access-Control-Allow-Origin", "*");
      c.header("Access-Control-Allow-Headers", "authorization, content-type");
      c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    }
  };
  c.header("Cache-Control", "no-store");
  c.header("Referrer-Policy", "no-referrer");
  if (publicOAuth && c.req.method === "OPTIONS") {
    responseHeaders();
    return c.body(null, 204);
  }
  await next();
  // Better Auth returns its own Response. Apply headers to the final response.
  responseHeaders();
});
app.onError((error, c) => {
  if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
  console.error("Accounts request failed", error);
  return c.json({ error: "Something went wrong." }, 500);
});
app.get("/", (c) => c.redirect("/otter/account"));
app.get("/health", (c) => c.json({ service: "otter-accounts" }));
app.route("/otter", identity);
app.route("/mail", mail);
app.on(["GET", "POST"], "/v1/auth/*", async (c) => {
  const url = new URL(c.req.url);
  const legacy = url.origin === c.env.MAIL_AUTH_URL;
  if (legacy && c.req.method === "POST" && url.pathname === "/v1/auth/browser-sign-out/start") {
    requireOrigin(c, [c.env.APP_ORIGIN]);
    return continueLogout(c, `${c.env.BETTER_AUTH_URL}/otter/sign-out`, "mail");
  }
  if (legacy && c.req.method === "POST" && url.pathname === "/v1/auth/browser-sign-out") {
    requireOrigin(c, [c.env.BETTER_AUTH_URL]);
    const app = await logoutDestination(c);
    await endSession(c);
    return continueLogout(c, `${c.env.DRIVE_ORIGIN}/api/auth/browser-sign-out`, app);
  }
  // Google's existing registered callback remains valid. Route new flows to the
  // host that owns their state cookie, then let Better Auth verify it normally.
  if (legacy && url.pathname === "/v1/auth/callback/google" && url.searchParams.has("state")) {
    const state = await c.var.db.query.verification.findFirst({
      where: eq(verification.identifier, url.searchParams.get("state")!),
    });
    if (
      state &&
      state.expiresAt.getTime() > Date.now() &&
      JSON.parse(state.value).otterAccounts === true
    )
      return c.redirect(`${c.env.BETTER_AUTH_URL}${url.pathname}${url.search}`);
  }
  if (legacy && url.pathname === "/v1/auth/callback/otter")
    return app.fetch(
      new Request(`${c.env.MAIL_AUTH_URL}/mail/callback${url.search}`, c.req.raw),
      c.env,
      c.executionCtx,
    );
  if (
    c.req.method === "POST" &&
    (url.pathname === "/v1/auth/sign-in/social" || url.pathname === "/v1/auth/link-social")
  ) {
    const body = await c.req.json<Record<string, unknown>>();
    if (legacy && !body.idToken && url.pathname === "/v1/auth/sign-in/social")
      return app.fetch(
        new Request(`${c.env.MAIL_AUTH_URL}/mail/start`, {
          method: "POST",
          headers: c.req.raw.headers,
          body: JSON.stringify(body),
        }),
        c.env,
        c.executionCtx,
      );
    const request = new Request(c.req.raw, {
      method: "POST",
      body: JSON.stringify({
        ...body,
        additionalData: { ...(body.additionalData as object), otterAccounts: !legacy },
      }),
    });
    return c.var.auth.handler(request);
  }
  return c.var.auth.handler(c.req.raw);
});
app.get("/.well-known/*", (c) => c.var.auth.handler(c.req.raw));

/** Only Mail's private service binding reaches legacy hosts and session RPC. */
export class MailIdentity extends WorkerEntrypoint<Env> {
  override fetch(request: Request) {
    const incoming = new URL(request.url);
    const canonical = new URL(this.env.MAIL_AUTH_URL);
    incoming.protocol = canonical.protocol;
    incoming.host = canonical.host;
    return app.fetch(new Request(incoming, request), this.env, this.ctx);
  }
  /** The session, with how its user can sign in: `user.signInMethods`. */
  async getSession(headers: Record<string, string>) {
    if (this.env.MAINTENANCE === "true") throw new Error("Accounts maintenance in progress.");
    const db = openDb(this.env.DB);
    const found = await createAuth(this.env, db, true).api.getSession({
      headers: new Headers(headers),
    });
    if (!found) return found;
    return {
      ...found,
      user: { ...found.user, signInMethods: await signInMethods(db, found.user.id) },
    };
  }
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // Internal Mail routes cannot be reached through the Accounts public host.
    if (new URL(request.url).pathname.startsWith("/mail/"))
      return new Response(null, { status: 404 });
    return app.fetch(request, env, ctx);
  },
};
