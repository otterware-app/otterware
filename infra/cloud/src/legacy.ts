import { HTTPException } from "hono/http-exception";
import accountsVars from "../accounts/vars.json";
import mailVars from "../mail/vars.json";
import type { Env } from "./env.ts";
import type { Env as AccountsEnv } from "../accounts/src/env.ts";
import type { Env as MailEnv } from "../mail/src/worker.ts";
import type { Env as DriveEnv } from "../drive/src/server/types.ts";
import accounts from "../accounts/src/worker.ts";
import mail from "../mail/src/worker.ts";
import { handler as driveApi } from "../drive/src/api.ts";
import { handler as driveAuth } from "../drive/src/auth-handler.ts";
import { identityRequest } from "../drive/src/server/identity.ts";
import {
  serveRawContent,
  serveSignedContent,
  serveThumbnail,
  startContentSession,
} from "../drive/src/server/content.ts";
import { errorResponse } from "../drive/src/server/http.ts";
import {
  hostNotFound,
  isAllowedHostPath,
  migrateLegacyRequest,
} from "../drive/src/server/host-policy.ts";
import { authenticate as cloudAuthenticate } from "./auth.ts";
import { createAuth } from "../drive/src/server/auth.ts";
import { authenticate } from "../drive/src/server/actor.ts";

export function accountsEnv(env: Env): AccountsEnv {
  return {
    ...accountsVars,
    DB: env.ACCOUNTS_DB,
    MAIL: env.MAIL_LIFECYCLE,
    BETTER_AUTH_SECRET: env.ACCOUNTS_SECRET ?? "",
    GOOGLE_WEB_CLIENT_SECRET: env.LEGACY_GOOGLE_WEB_CLIENT_SECRET ?? "",
    GOOGLE_AUTH_CLIENT_SECRET: env.GOOGLE_PROVIDER_CLIENT_SECRET,
    MICROSOFT_CLIENT_SECRET: env.MICROSOFT_PROVIDER_CLIENT_SECRET,
    RESEND_API_KEY: env.RESEND_API_KEY,
  };
}
export function mailEnv(env: Env): MailEnv {
  return {
    ...mailVars,
    IDENTITY_MODE: "accounts",
    DB: env.MAIL_DB,
    ACCOUNTS: env.ACCOUNTS,
    USER_HUB: env.LEGACY_USER_HUB,
    AGENT_HUB: env.LEGACY_AGENT_HUB,
    GOOGLE_WEB_CLIENT_SECRET: env.LEGACY_GOOGLE_WEB_CLIENT_SECRET ?? "",
    GOOGLE_GMAIL_CLIENT_SECRET: env.GOOGLE_PROVIDER_CLIENT_SECRET,
    BETTER_AUTH_SECRET: env.MAIL_SECRET ?? "",
    APNS_TEAM_ID: env.APNS_TEAM_ID,
    APNS_KEY_ID: env.APNS_KEY_ID,
    APNS_PRIVATE_KEY: env.APNS_PRIVATE_KEY,
    TUNNEL_LIMIT: env.TUNNEL_LIMIT,
    TUNNEL_UNLINKED_LIMIT: env.TUNNEL_UNLINKED_LIMIT,
  };
}
export function driveEnv(env: Env, parallel = false): DriveEnv {
  return {
    DB: env.DRIVE_DB,
    ARTIFACTS: env.ARTIFACTS,
    ASSETS: env.ASSETS,
    BROWSER: env.BROWSER,
    APP_URL: parallel ? env.CLOUD_ORIGIN : "https://drive.otterware.app",
    CONTENT_URL: "https://usercontent.otterware.app",
    OTTER_AUTH_URL: "https://accounts.otterware.app/v1/auth",
    MAIL_AUTH_URL: "https://relay.mail.otterware.app",
    MAIL_URL: "https://mail.otterware.app",
    ADMIN_EMAIL: "chris.kafrouni@gmail.com",
    BETTER_AUTH_SECRET: env.DRIVE_SECRET ?? "",
    CONTENT_SIGNING_KEY: env.CONTENT_SIGNING_KEY ?? "",
    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
    RESEND_API_KEY: env.RESEND_API_KEY,
    EMAIL_FROM: "Otter Drive <noreply@otterware.app>",
  };
}

export async function drive(request: Request, env: Env, parallel: boolean) {
  if (!env.DRIVE_SECRET || !env.CONTENT_SIGNING_KEY)
    return new Response("Drive signing secrets are not configured", { status: 503 });
  const bindings = driveEnv(env, parallel);
  const migrated = migrateLegacyRequest(request, bindings);
  if (migrated instanceof Response) return migrated;
  request = migrated;
  if (!isAllowedHostPath(request, bindings)) return hostNotFound();
  const url = new URL(request.url);
  try {
    if (url.pathname.startsWith("/api/v1/")) {
      // Cloud tokens map to an explicitly linked Drive identity, never an email match.
      if (request.headers.has("x-otter-audience")) {
        const identity = await cloudAuthenticate(request, env);
        const linked = await env.DRIVE_DB.prepare(
          "SELECT a.userId FROM account a JOIN user u ON u.id=a.userId WHERE a.providerId='otter' AND a.accountId=? AND coalesce(u.banned,0)=0",
        )
          .bind(identity.userId)
          .first<{ userId: string }>();
        if (!linked)
          return Response.json(
            { error: "Sign in to Drive once to create your account." },
            { status: 409 },
          );
        const auth = createAuth(bindings);
        // Reuse Drive's actor/access checks without minting a persistent Drive session.
        const actor = await authenticate(request, bindings, auth, {
          id: linked.userId,
          name: identity.userId,
          email: "",
        });
        return driveApi(request, bindings, actor);
      }
      if (!env.DRIVE_SECRET)
        return new Response("Drive compatibility secret is not configured", { status: 503 });
      return driveApi(request, bindings);
    }
    if (url.pathname.startsWith("/api/auth/"))
      return parallel ? hostNotFound() : driveAuth(request, bindings);
    if (url.pathname.startsWith("/api/identity/"))
      return parallel ? hostNotFound() : identityRequest(request, bindings);
    if (url.pathname.startsWith("/raw/")) {
      if (!["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 405 });
      const parts = url.pathname.split("/").map(decodeURIComponent);
      if (parts[2] === "session" && parts[3])
        return startContentSession(request, bindings, parts[3]);
      if (parts[2] === "thumbnail" && parts[3]) return serveThumbnail(request, bindings, parts[3]);
      if (parts[2] === "t" && parts[3])
        return serveSignedContent(request, bindings, parts[3], parts.slice(4).join("/"));
      if (parts[2] === "a" && parts[3] && parts[4])
        return serveRawContent(request, bindings, parts[3], parts[4], parts.slice(5).join("/"));
      return hostNotFound();
    }
    return env.ASSETS.fetch(request);
  } catch (error) {
    if (error instanceof HTTPException)
      return Response.json({ error: error.message }, { status: error.status });
    return errorResponse(error);
  }
}

export async function legacy(request: Request, env: Env, ctx: ExecutionContext) {
  const host = new URL(request.url).hostname;
  if (env.LEGACY_HOSTS !== "enabled") return hostNotFound();
  if (host === "accounts.otterware.app")
    return env.ACCOUNTS_SECRET
      ? accounts.fetch(request, accountsEnv(env), ctx)
      : new Response("Accounts secret missing", { status: 503 });
  if (["relay.mail.otterware.app", "relay.mail.otterware.dev"].includes(host))
    return env.MAIL_SECRET
      ? mail.fetch(request, mailEnv(env), ctx)
      : new Response("Mail secret missing", { status: 503 });
  return drive(request, env, false);
}
