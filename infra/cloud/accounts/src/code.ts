/** Code uses OAuth access tokens; Mail's native session-token adapter stays separate. */
import { getOAuthProviderApi, type OAuthOptions } from "@better-auth/oauth-provider";
import { APIError, createAuthEndpoint, createAuthMiddleware } from "better-auth/api";
import { and, desc, eq, gt, isNull, lt, notExists } from "drizzle-orm";
import type { Env } from "./env.ts";
import type { Db } from "./store.ts";
import {
  identityApps,
  oauthAccessToken,
  oauthRefreshToken,
  suiteSession,
  session,
} from "./schema.ts";

const clients = new Set([
  "otter-code-web",
  "otter-code-desktop",
  "otter-code-mobile",
  "otter-code-cli",
]);
const SUITE_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const SUITE_SESSION_REUSE_MIN_MS = 24 * 60 * 60 * 1000;
export const codeRelayOrigin = (env: Env) =>
  env.CODE_RELAY_ORIGIN ?? "https://relay.code.otterware.app";
export const codeOrigin = (env: Env) => env.CODE_ORIGIN ?? "https://code.otterware.app";

export function codeOAuthOptions(env: Env) {
  return {
    loginPage: `${env.BETTER_AUTH_URL}/otter/sign-in`,
    consentPage: `${env.BETTER_AUTH_URL}/otter/consent`,
    scopes: ["openid", "profile", "email", "offline_access"],
    grantTypes: ["authorization_code", "refresh_token"],
    resources: [
      {
        identifier: codeRelayOrigin(env),
        allowedScopes: ["openid", "profile", "email", "offline_access"],
        accessTokenTtl: 900,
      },
    ],
  } satisfies OAuthOptions;
}

export function codeIdentity(env: Env, db: Db) {
  const identity = async (ctx: Parameters<typeof getOAuthProviderApi>[0]) => {
    const header = ctx.headers?.get("authorization");
    if (!header?.startsWith("Bearer ")) throw new APIError("UNAUTHORIZED");
    const claims = await getOAuthProviderApi(ctx, codeOAuthOptions(env)).requireActiveAccessToken(
      header.slice(7),
    );
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (
      typeof claims.sub !== "string" ||
      !clients.has(String(claims.azp ?? claims.client_id)) ||
      !audiences.includes(codeRelayOrigin(env)) ||
      claims.cnf
    )
      throw new APIError("UNAUTHORIZED");
    const tokenHash = await getOAuthProviderApi(ctx, codeOAuthOptions(env)).hashToken(
      header.slice(7),
      "access_token",
    );
    const active = await db.query.oauthAccessToken.findFirst({
      where: eq(oauthAccessToken.token, tokenHash),
    });
    if (!active || active.revoked || active.expiresAt.getTime() <= Date.now() || !active.refreshId)
      throw new APIError("UNAUTHORIZED");
    const grant = await db.query.oauthRefreshToken.findFirst({
      where: eq(oauthRefreshToken.id, active.refreshId),
    });
    if (!grant || grant.revoked || grant.expiresAt.getTime() <= Date.now())
      throw new APIError("UNAUTHORIZED");
    const subject = claims.sub;
    const user = await db.query.user.findFirst({ where: (user) => eq(user.id, subject) });
    if (!user?.emailVerified) throw new APIError("UNAUTHORIZED");
    await db
      .insert(identityApps)
      .values({ userId: user.id, appId: "otter-code" })
      .onConflictDoNothing();
    return { user, grant };
  };
  const cleanRevokedSessions = createAuthMiddleware(async (ctx) => {
    const linked = await db
      .select()
      .from(suiteSession)
      .where(
        notExists(
          db
            .select({ id: oauthRefreshToken.id })
            .from(oauthRefreshToken)
            .where(
              and(
                eq(oauthRefreshToken.authorizationCodeId, suiteSession.authorizationCodeId),
                isNull(oauthRefreshToken.revoked),
                gt(oauthRefreshToken.expiresAt, new Date()),
              ),
            ),
        ),
      );
    for (const link of linked) {
      const grant = await db.query.oauthRefreshToken.findFirst({
        where: and(
          eq(oauthRefreshToken.authorizationCodeId, link.authorizationCodeId),
          isNull(oauthRefreshToken.revoked),
          gt(oauthRefreshToken.expiresAt, new Date()),
        ),
      });
      if (grant) continue;
      const device = await db.query.session.findFirst({ where: eq(session.id, link.sessionId) });
      if (device) await ctx.context.internalAdapter.deleteSession(device.token);
    }
  });
  return {
    id: "otter-code-identity",
    hooks: {
      before: [
        {
          matcher: (ctx: { path?: string }) => ctx.path === "/get-session",
          handler: createAuthMiddleware(async (ctx) => {
            const bearer = new Headers(ctx.headers).get("authorization");
            if (!bearer?.startsWith("Bearer ")) return;
            const device = await db.query.session.findFirst({
              where: eq(session.token, bearer.slice(7)),
            });
            if (!device) return;
            const link = await db.query.suiteSession.findFirst({
              where: eq(suiteSession.sessionId, device.id),
            });
            // Better Auth's default sliding lifetime is 90 days. A suite credential
            // instead keeps its fixed, capped grant lifetime; every lookup checks the grant below.
            if (link) return { context: { query: { ...ctx.query, disableRefresh: true } } };
          }),
        },
      ],
      after: [
        {
          matcher: (ctx: { path?: string }) => ctx.path === "/get-session",
          handler: createAuthMiddleware(async (ctx) => {
            const returned: unknown = ctx.context.returned;
            if (!returned || typeof returned !== "object" || !("session" in returned)) return;
            const device = returned.session as { id: string; token: string } | null;
            if (!device) return;
            const link = await db.query.suiteSession.findFirst({
              where: eq(suiteSession.sessionId, device.id),
            });
            if (!link) return;
            const grant = await db.query.oauthRefreshToken.findFirst({
              where: and(
                eq(oauthRefreshToken.authorizationCodeId, link.authorizationCodeId),
                isNull(oauthRefreshToken.revoked),
                gt(oauthRefreshToken.expiresAt, new Date()),
              ),
            });
            if (grant) return;
            await ctx.context.internalAdapter.deleteSession(device.token);
            return ctx.json(null);
          }),
        },
        {
          matcher: (ctx: { path?: string }) => ctx.path === "/oauth2/revoke",
          handler: cleanRevokedSessions,
        },
        {
          matcher: (ctx: { path?: string; body?: unknown }) =>
            ctx.path === "/oauth2/token" &&
            Boolean(
              ctx.body &&
              typeof ctx.body === "object" &&
              "client_id" in ctx.body &&
              clients.has(String(ctx.body.client_id)),
            ),
          handler: createAuthMiddleware(async (ctx) => {
            const response: unknown = ctx.context.returned;
            if (
              !response ||
              typeof response !== "object" ||
              !("access_token" in response) ||
              typeof response.access_token !== "string" ||
              !("refresh_token" in response) ||
              typeof response.refresh_token !== "string" ||
              !("expires_in" in response) ||
              typeof response.expires_in !== "number"
            )
              return;
            const provider = getOAuthProviderApi(ctx, codeOAuthOptions(env));
            const refreshHash = await provider.hashToken(response.refresh_token, "refresh_token");
            const refresh = await db.query.oauthRefreshToken.findFirst({
              where: eq(oauthRefreshToken.token, refreshHash),
            });
            if (!refresh || refresh.revoked) throw new APIError("INTERNAL_SERVER_ERROR");
            // Device-flow grants have no authorization code. Rotation copies this ID forward, so
            // every sign-in is one grant: it can hold a suite session and be listed or revoked.
            if (!refresh.authorizationCodeId)
              await db
                .update(oauthRefreshToken)
                .set({ authorizationCodeId: `grant:${refresh.id}` })
                .where(eq(oauthRefreshToken.id, refresh.id));
            // JWTs normally have no revocation record. Code uses the provider's grant table
            // as well so native sign-out revokes access immediately, without a second identity store.
            await db
              .insert(oauthAccessToken)
              .values({
                id: crypto.randomUUID(),
                token: await provider.hashToken(response.access_token, "access_token"),
                clientId: refresh.clientId,
                userId: refresh.userId,
                sessionId: refresh.sessionId,
                refreshId: refresh.id,
                resources: refresh.resources,
                scopes: refresh.scopes,
                expiresAt: new Date(Date.now() + response.expires_in * 1000),
                createdAt: new Date(),
              })
              .onConflictDoNothing();
            await db.delete(oauthAccessToken).where(lt(oauthAccessToken.expiresAt, new Date()));
          }),
        },
      ],
    },
    endpoints: {
      suiteSession: createAuthEndpoint("/suite/session", { method: "POST" }, async (ctx) => {
        const { user, grant } = await identity(ctx);
        if (!grant.authorizationCodeId) throw new APIError("UNAUTHORIZED");
        const now = Date.now();
        // Rotation revokes the old row and issues a new expiry within the same authorization.
        const currentGrant = await db.query.oauthRefreshToken.findFirst({
          where: and(
            eq(oauthRefreshToken.authorizationCodeId, grant.authorizationCodeId),
            isNull(oauthRefreshToken.revoked),
            gt(oauthRefreshToken.expiresAt, new Date(now)),
          ),
          orderBy: [desc(oauthRefreshToken.createdAt), desc(oauthRefreshToken.expiresAt)],
        });
        if (!currentGrant) throw new APIError("UNAUTHORIZED");
        // Cap each credential at 30 days even when the sign-in grant lasts longer.
        const expiresAt = new Date(
          Math.min(currentGrant.expiresAt.getTime(), now + SUITE_SESSION_MAX_AGE_MS),
        );
        await db
          .insert(identityApps)
          .values([
            { userId: user.id, appId: "otter-mail" },
            { userId: user.id, appId: "otter-drive" },
          ])
          .onConflictDoNothing();
        const link = await db.query.suiteSession.findFirst({
          where: eq(suiteSession.authorizationCodeId, grant.authorizationCodeId!),
        });
        const saved = link
          ? await db.query.session.findFirst({ where: eq(session.id, link.sessionId) })
          : null;
        if (saved && saved.expiresAt.getTime() > now + SUITE_SESSION_REUSE_MIN_MS)
          return ctx.json({
            token: saved.token,
            expiresAt: saved.expiresAt.getTime(),
            user: { id: user.id, email: user.email, name: user.name || null, image: user.image },
          });
        if (saved) await ctx.context.internalAdapter.deleteSession(saved.token);
        const device = await ctx.context.internalAdapter.createSession(
          user.id,
          false,
          { expiresAt, userAgent: "Otterware shared account" },
          true,
        );
        if (!device) throw new APIError("INTERNAL_SERVER_ERROR");
        await db
          .insert(suiteSession)
          .values({ sessionId: device.id, authorizationCodeId: grant.authorizationCodeId! })
          .onConflictDoNothing();
        const winner = await db.query.suiteSession.findFirst({
          where: eq(suiteSession.authorizationCodeId, grant.authorizationCodeId!),
        });
        if (winner && winner.sessionId !== device.id) {
          await ctx.context.internalAdapter.deleteSession(device.token);
          const existing = await db.query.session.findFirst({
            where: eq(session.id, winner.sessionId),
          });
          if (!existing || existing.expiresAt.getTime() <= Date.now())
            throw new APIError("CONFLICT");
          return ctx.json({
            token: existing.token,
            expiresAt: existing.expiresAt.getTime(),
            user: { id: user.id, email: user.email, name: user.name || null, image: user.image },
          });
        }
        return ctx.json({
          token: device.token,
          expiresAt: device.expiresAt.getTime(),
          user: { id: user.id, email: user.email, name: user.name || null, image: user.image },
        });
      }),
      /** Every app, device and command line signed in to this account, one row per sign-in. */
      codeGrants: createAuthEndpoint("/code/grants", { method: "GET" }, async (ctx) => {
        const { user, grant } = await identity(ctx);
        const rows = await db.query.oauthRefreshToken.findMany({
          where: and(
            eq(oauthRefreshToken.userId, user.id),
            isNull(oauthRefreshToken.revoked),
            gt(oauthRefreshToken.expiresAt, new Date()),
          ),
          orderBy: [desc(oauthRefreshToken.createdAt)],
        });
        const grants = new Map<string, { clientId: string; usedAt: number }>();
        for (const row of rows)
          if (row.authorizationCodeId && !grants.has(row.authorizationCodeId))
            grants.set(row.authorizationCodeId, {
              clientId: row.clientId,
              usedAt: row.createdAt.getTime(),
            });
        return ctx.json({
          grants: [...grants].map(([id, row]) => ({
            id,
            clientId: row.clientId,
            usedAt: row.usedAt,
            current: id === grant.authorizationCodeId,
          })),
        });
      }),
      revokeCodeGrant: createAuthEndpoint(
        "/code/grants/revoke",
        { method: "POST" },
        async (ctx) => {
          const { user } = await identity(ctx);
          const body: unknown = ctx.body;
          const id =
            body && typeof body === "object" && "id" in body && typeof body.id === "string"
              ? body.id
              : null;
          if (!id) throw new APIError("BAD_REQUEST");
          const now = new Date();
          const chain = and(
            eq(oauthRefreshToken.userId, user.id),
            eq(oauthRefreshToken.authorizationCodeId, id),
          );
          const revoked = await db
            .update(oauthRefreshToken)
            .set({ revoked: now })
            .where(and(chain, isNull(oauthRefreshToken.revoked)))
            .returning({ id: oauthRefreshToken.id });
          for (const row of revoked)
            await db
              .update(oauthAccessToken)
              .set({ revoked: now })
              .where(eq(oauthAccessToken.refreshId, row.id));
          // The suite session derived from this sign-in ends with it (Mail, Calendar, Drive, Cloud).
          const link = await db.query.suiteSession.findFirst({
            where: eq(suiteSession.authorizationCodeId, id),
          });
          const device = link
            ? await db.query.session.findFirst({ where: eq(session.id, link.sessionId) })
            : null;
          if (device?.userId === user.id)
            await ctx.context.internalAdapter.deleteSession(device.token);
          return ctx.json({ revoked: revoked.length > 0 });
        },
      ),
      codeSession: createAuthEndpoint("/code/session", { method: "GET" }, async (ctx) => {
        const { user } = await identity(ctx);
        return ctx.json({
          id: user.id,
          email: user.email,
          name: user.name || null,
          image: user.image,
        });
      }),
    },
  };
}
