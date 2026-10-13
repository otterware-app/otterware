import { gmailPush } from "./push.ts";
import mail from "../mail/src/worker.ts";
import { mailEnv } from "./legacy.ts";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  allowedOrigin,
  audienceSchema,
  authenticate,
  issueToken,
  requireBrowserOrigin,
} from "./auth.ts";
import {
  connectSchema,
  disconnect,
  finishConnection,
  listConnections,
  providerSchema,
  startConnection,
} from "./providers.ts";
import { pullRecords, pushRecords, pushSchema } from "./sync.ts";
import { drive, legacy } from "./legacy.ts";
import type { App, Env } from "./env.ts";
import { SESSION_HEADER } from "../mail/src/user-hub.ts";
export { EnvironmentHub } from "./environment-hub.ts";
export { CloudAgentHub } from "./agent-hub.ts";

const app = new Hono<App>();
app.use("*", async (c, next) => {
  c.header("cache-control", "no-store");
  c.header("referrer-policy", "no-referrer");
  c.header("x-content-type-options", "nosniff");
  return cors({
    origin: (origin) => (allowedOrigin(c.env, origin) ? origin : ""),
    allowHeaders: ["Authorization", "Content-Type", "X-Otter-Audience"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  })(c, next);
});
app.onError((error, c) => {
  if (error instanceof HTTPException)
    return c.json({ error: error.message || "Request rejected." }, error.status);
  if (error instanceof z.ZodError || error instanceof SyntaxError)
    return c.json({ error: "Invalid request." }, 400);
  // OAuth responses and credentials are deliberately never logged.
  return c.json({ error: "Cloud request failed." }, 500);
});
app.get("/health", (c) =>
  c.json({
    service: "otterware-cloud",
    mode: "parallel",
    issuer: "https://accounts.otterware.app/v1/auth",
  }),
);
app.get("/", (c) =>
  c.json({
    service: "otterware-cloud",
    api: "/v1/cloud",
    drive: "/api/v1",
    signIn: "https://accounts.otterware.app",
  }),
);
app.use("/push/*", bodyLimit({ maxSize: 20000 }));
app.post("/push/gmail", (c) => gmailPush(c.req.raw, c.env));
app.use("/v1/cloud/*", (c, next) =>
  bodyLimit({ maxSize: c.req.path.startsWith("/v1/cloud/agent/") ? 70 * 1024 * 1024 : 256_000 })(
    c,
    next,
  ),
);
app.post("/v1/cloud/token", async (c) => {
  requireBrowserOrigin(c.req.raw, c.env);
  const header = c.req.header("authorization");
  if (!header?.startsWith("Bearer ")) throw new HTTPException(401);
  const { audience } = z
    .object({ audience: audienceSchema })
    .strict()
    .parse(await c.req.json());
  return c.json(await issueToken(c.env, header.slice(7), audience));
});
app.get("/v1/cloud/providers/:provider/callback", async (c) => {
  const provider = providerSchema.parse(c.req.param("provider"));
  const name = `__Host-otter-cloud-${provider}`;
  const cookie = getCookie(c, name);
  deleteCookie(c, name, { path: "/", secure: true });
  const { code, state } = z
    .object({ code: z.string().min(1).max(4096), state: z.uuid() })
    .parse(c.req.query());
  const destination = await finishConnection(c.env, provider, code, state, cookie);
  return c.redirect(destination, 303);
});
app.get("/v1/cloud/channel", async (c) => {
  requireBrowserOrigin(c.req.raw, c.env);
  if (c.req.header("upgrade")?.toLowerCase() !== "websocket") throw new HTTPException(426);
  const ticket = z.uuid().parse(c.req.query("ticket"));
  const row = await c.env.ACCOUNT_DATA.prepare(
    "DELETE FROM channel_ticket WHERE id=? AND expires_at>? RETURNING credential",
  )
    .bind(ticket, Date.now())
    .first<{ credential: string }>();
  if (!row) throw new HTTPException(401);
  const credential = z
    .object({ token: z.string(), audience: audienceSchema })
    .parse(JSON.parse(row.credential));
  const request = new Request(c.req.raw, {
    headers: {
      upgrade: "websocket",
      authorization: `Bearer ${credential.token}`,
      "x-otter-audience": credential.audience,
    },
  });
  const identity = await authenticate(request, c.env);
  return c.env.ENVIRONMENT_HUB.get(c.env.ENVIRONMENT_HUB.idFromName(identity.userId)).fetch(
    request,
  );
});
app.use("/v1/cloud/*", async (c, next) => {
  c.set("identity", await authenticate(c.req.raw, c.env));
  await next();
});
app.get("/v1/cloud/connections", async (c) =>
  c.json(await listConnections(c.env, c.var.identity.userId)),
);
app.post("/v1/cloud/connections", async (c) => {
  const input = connectSchema.parse(await c.req.json());
  const result = await startConnection(c.env, c.var.identity, input);
  setCookie(c, `__Host-otter-cloud-${input.provider}`, result.state, {
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "Lax",
    maxAge: 600,
  });
  return c.json({ url: result.url });
});
app.delete("/v1/cloud/connections/:id", async (c) => {
  await disconnect(c.env, c.var.identity.userId, z.uuid().parse(c.req.param("id")));
  await c.env.ENVIRONMENT_HUB.get(c.env.ENVIRONMENT_HUB.idFromName(c.var.identity.userId)).publish({
    type: "connections.changed",
  });
  return c.body(null, 204);
});
app.post("/v1/cloud/connections/:id/token", async (c) =>
  c.json(
    await c.env.ENVIRONMENT_HUB.get(c.env.ENVIRONMENT_HUB.idFromName(c.var.identity.userId)).token(
      c.var.identity,
      z.uuid().parse(c.req.param("id")),
    ),
  ),
);
app.post("/v1/cloud/channel-ticket", async (c) => {
  const ticket = crypto.randomUUID();
  const expiresAt = Date.now() + 30_000;
  await c.env.ACCOUNT_DATA.batch([
    c.env.ACCOUNT_DATA.prepare("DELETE FROM channel_ticket WHERE expires_at<?").bind(Date.now()),
    c.env.ACCOUNT_DATA.prepare("INSERT INTO channel_ticket VALUES(?,?,?)").bind(
      ticket,
      JSON.stringify({
        token: c.req.header("authorization")!.slice(7),
        audience: c.var.identity.audience,
      }),
      expiresAt,
    ),
  ]);
  return c.json({ ticket, expiresAt });
});
app.get("/v1/cloud/sync", async (c) =>
  c.json(
    await pullRecords(
      c.env,
      c.var.identity.userId,
      z.coerce
        .number()
        .int()
        .nonnegative()
        .max(Number.MAX_SAFE_INTEGER)
        .parse(c.req.query("cursor") ?? 0),
    ),
  ),
);
app.post("/v1/cloud/sync", async (c) => {
  const { records } = pushSchema.parse(await c.req.json());
  const result = await pushRecords(c.env, c.var.identity.userId, records);
  await c.env.ENVIRONMENT_HUB.get(c.env.ENVIRONMENT_HUB.idFromName(c.var.identity.userId)).publish({
    type: "sync.changed",
  });
  return c.json(result);
});
app.all("/v1/cloud/agent/*", async (c) => {
  const headers = new Headers(c.req.raw.headers);
  headers.set(SESSION_HEADER, c.var.identity.sessionId);
  headers.delete("authorization");
  headers.delete("cookie");
  return c.env.CLOUD_AGENT_HUB.get(c.env.CLOUD_AGENT_HUB.idFromName(c.var.identity.userId)).fetch(
    new Request(c.req.raw, { headers }),
  );
});
app.all("/v1/cloud/mail/*", async (c) => {
  if (!c.env.MAIL_SECRET)
    throw new HTTPException(503, { message: "Mail compatibility secret is not configured." });
  const url = new URL(c.req.url);
  url.pathname = url.pathname.replace("/v1/cloud/mail/", "/v1/");
  // Authentication is checked at the Cloud boundary, then the existing relay checks the account session.
  const headers = new Headers(c.req.raw.headers);
  headers.set("authorization", `Bearer ${c.var.identity.sessionToken}`);
  headers.delete("cookie");
  const bindings = { ...mailEnv(c.env), APP_ORIGIN: c.req.header("origin") ?? c.env.CLOUD_ORIGIN };
  return mail.fetch(
    new Request(url, new Request(c.req.raw, { headers })),
    bindings,
    c.executionCtx,
  );
});
app.all("/api/*", (c) => drive(c.req.raw, c.env, true));

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.origin !== env.CLOUD_ORIGIN) return legacy(request, env, ctx);
    // Uploaded executable content is never served on the Cloud/account API origin.
    if (url.pathname.startsWith("/raw/")) return new Response("Not found", { status: 404 });
    return app.fetch(request, env, ctx);
  },
};
