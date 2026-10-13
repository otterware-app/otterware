/**
 * Otter account sign-in, with better-auth (served under /v1/auth).
 *
 * The desktop and iPhone apps sign in to Google themselves and hand the relay the ID token
 * (`POST /v1/auth/sign-in/social`, `{ provider: "google", idToken }`); the
 * bearer plugin answers with a session token the app keeps. One session per
 * device, so Settings can list and sign out devices.
 *
 * The browser pages also sign in with Microsoft, and with an email and password once the
 * address is confirmed. One verified address is one account, however it signs in.
 */

import { oauthDeviceAuthorization, oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { bearer, jwt } from "better-auth/plugins";
import { and, eq, ne, notExists } from "drizzle-orm";

import { GOOGLE_JWKS_URL, remoteKeys, verifyGoogleJwt } from "./google-jwt.ts";
import * as schema from "./schema.ts";
import type { Db } from "./store.ts";
import type { Env } from "./env.ts";
import { codeIdentity, codeOAuthOptions } from "./code.ts";
import { sendPasswordEmail, sendVerificationEmail } from "./email.ts";

const DAY_S = 24 * 60 * 60;

export const googleKeys = (env: Env) => remoteKeys(env.GOOGLE_JWKS_URL || GOOGLE_JWKS_URL);

/** The audiences of ID tokens from Otter applications' Google sign-ins. */
export const googleClientIds = (env: Env) =>
  [
    env.GOOGLE_AUTH_CLIENT_ID,
    env.GOOGLE_WEB_CLIENT_ID,
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CALENDAR_CLIENT_ID,
    env.GOOGLE_OTTERWARE_CLIENT_ID,
    ...(env.GOOGLE_IOS_CLIENT_ID ?? "").split(","),
    ...(env.GOOGLE_LEGACY_CLIENT_IDS ?? "").split(","),
  ].filter((id): id is string => Boolean(id));

/** The sign-in methods this deployment offers besides Google. */
export const signInOptions = (env: Env) => ({
  microsoft: Boolean(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET),
  password: Boolean(env.RESEND_API_KEY),
});

export type SignInMethod = "google" | "microsoft" | "password";
const methodOf: Record<string, SignInMethod> = {
  google: "google",
  microsoft: "microsoft",
  credential: "password",
};

/** How a user can sign in, in the order the methods were added. */
export async function signInMethods(db: Db, userId: string) {
  const accounts = await db.query.account.findMany({
    columns: { providerId: true },
    where: eq(schema.account.userId, userId),
    orderBy: schema.account.createdAt,
  });
  return [...new Set(accounts.flatMap((account) => methodOf[account.providerId] ?? []))];
}

/** Microsoft's tenant for personal accounts. */
const MICROSOFT_PERSONAL_TENANT = "9188040d-6c67-4c5b-b112-36a304b66dad";

/**
 * The address a Microsoft ID token names, and whether it proves it. A work or school tenant
 * can put any unverified address in `email` ("nOAuth"), so trust it only for personal
 * accounts, when Microsoft says the domain is verified (`xms_edov`), or when it is the
 * user's UPN, which must be in one of the tenant's verified domains.
 */
export function microsoftEmail(claims: Record<string, unknown>) {
  const upn =
    typeof claims.preferred_username === "string" && claims.preferred_username.includes("@")
      ? claims.preferred_username.toLowerCase()
      : undefined;
  const email = typeof claims.email === "string" ? claims.email.toLowerCase() : upn;
  const emailVerified =
    Boolean(email) &&
    (claims.tid === MICROSOFT_PERSONAL_TENANT || claims.xms_edov === true || email === upn);
  return { email, emailVerified };
}

export function createAuth(env: Env, db: Db, legacy = false) {
  const options = signInOptions(env);
  /**
   * A verified sign-in proves the address. A password sign-up that never confirmed it gives
   * way: anyone could have chosen its password, and it never had a session.
   */
  const releaseUnconfirmed = async (email: unknown) => {
    if (typeof email !== "string") return;
    await db.delete(schema.user).where(
      and(
        eq(schema.user.email, email.toLowerCase()),
        eq(schema.user.emailVerified, false),
        notExists(
          db
            .select()
            .from(schema.account)
            .where(
              and(
                eq(schema.account.userId, schema.user.id),
                ne(schema.account.providerId, "credential"),
              ),
            ),
        ),
      ),
    );
  };
  const auth = betterAuth({
    appName: "Otter",
    baseURL: legacy ? env.MAIL_AUTH_URL : env.BETTER_AUTH_URL,
    basePath: "/v1/auth",
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    // The web app signs in with Google by redirect, and comes back to its origin.
    trustedOrigins: [env.APP_ORIGIN, env.BETTER_AUTH_URL, env.MAIL_AUTH_URL],
    socialProviders: {
      google: {
        // The web client does the redirect sign-in; ID tokens may come from either app.
        clientId: googleClientIds(env),
        clientSecret: env.GOOGLE_AUTH_CLIENT_SECRET ?? env.GOOGLE_WEB_CLIENT_SECRET ?? "",
        redirectURI: `${env.MAIL_AUTH_URL}/v1/auth/callback/google`,
        verifyIdToken: async (token) => {
          try {
            await verifyGoogleJwt(token, googleClientIds(env), googleKeys(env));
            return true;
          } catch {
            return false;
          }
        },
        mapProfileToUser: async (profile) => {
          if (profile.email_verified) await releaseUnconfirmed(profile.email);
          return {};
        },
      },
      ...(options.microsoft && {
        microsoft: {
          clientId: env.MICROSOFT_CLIENT_ID!,
          clientSecret: env.MICROSOFT_CLIENT_SECRET!,
          // Work, school and personal accounts.
          tenantId: "common",
          redirectURI: `${env.BETTER_AUTH_URL}/v1/auth/callback/microsoft`,
          // Sign-in only: no Graph access, refresh token or profile photo.
          disableDefaultScope: true,
          scope: ["openid", "email", "profile"],
          disableProfilePhoto: true,
          prompt: "select_account",
          mapProfileToUser: async (profile) => {
            const address = microsoftEmail(profile);
            if (address.emailVerified) await releaseUnconfirmed(address.email);
            return address;
          },
        },
      }),
    },
    // Better Auth links a provider to the account with its address only when both sides
    // verified it. Passwords join an account through a link emailed to its address.
    emailAndPassword: {
      enabled: options.password,
      requireEmailVerification: true,
      minPasswordLength: 10,
      sendResetPassword: ({ user, url }) => sendPasswordEmail(env, user.email, url),
      // The link went to the address, so choosing a password with it confirms the address.
      onPasswordReset: async ({ user }) => {
        if (!user.emailVerified)
          await db
            .update(schema.user)
            .set({ emailVerified: true })
            .where(eq(schema.user.id, user.id));
      },
      // Signing up with a known address emails it a link to choose a password instead.
      // The response looks the same either way, so it doesn't reveal who has an account.
      onExistingUserSignUp: async ({ user }): Promise<void> => {
        await auth.api.requestPasswordReset({
          body: { email: user.email, redirectTo: `${env.BETTER_AUTH_URL}/otter/reset-password` },
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: ({ user, url }) => sendVerificationEmail(env, user.email, url),
    },
    // Workers keep nothing between requests, so the password endpoints count attempts in D1,
    // per client IP. Mail and Code reach the others from shared servers: leave them be.
    rateLimit: {
      enabled: true,
      storage: "database",
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
        "/request-password-reset": { window: 60, max: 3 },
        "/send-verification-email": { window: 60, max: 3 },
        "/reset-password": { window: 60, max: 5 },
        "/**": false,
      },
    },
    session: {
      // A desktop app stays signed in: sessions last 90 days and renew with use.
      expiresIn: 90 * DAY_S,
      updateAge: DAY_S,
      // Deleting the account needs no recent sign-in; the app asks for confirmation.
      freshAge: 0,
    },
    // Old Mail clients only confirm deleting Mail data. Shared accounts must
    // confirm the wider effect on the account page before this endpoint runs.
    user: {
      // Never create an account or link one on an address Microsoft didn't verify.
      validateUserInfo: ({ user, source }) => {
        if (
          source.oauth?.providerId === "microsoft" &&
          source.action !== "sign-in" &&
          !user.emailVerified
        )
          return {
            error: "microsoft_email_unverified",
            errorDescription: "Microsoft hasn't verified this account's email address.",
          };
      },
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => {
          const linked = await db.query.identityApps.findFirst({
            where: eq(schema.identityApps.userId, user.id),
          });
          if (linked)
            throw new APIError("FORBIDDEN", {
              message: `This account also signs in to other Otter apps. Manage deletion at ${env.BETTER_AUTH_URL}/otter/account.`,
            });
        },
      },
    },
    disabledPaths: ["/token"],
    plugins: [
      bearer(),
      jwt({
        jwt: { issuer: `${env.BETTER_AUTH_URL}/v1/auth` },
        jwks: { keyPairConfig: { alg: "RS256" } },
        disableSettingJwtHeader: true,
      }),
      oauthProvider({
        ...codeOAuthOptions(env),
        allowDynamicClientRegistration: false,
        clientPrivileges: () => false,
        customIdTokenClaims: async ({ user, metadata, scopes }) => {
          if (metadata?.app === "otter-drive" || metadata?.app === "otter-code") {
            await db
              .insert(schema.identityApps)
              .values({ userId: user.id, appId: metadata.app })
              .onConflictDoNothing();
          }
          return {
            ...(scopes.includes("email")
              ? { email: user.email, email_verified: user.emailVerified }
              : {}),
            ...(scopes.includes("profile") ? { name: user.name, picture: user.image } : {}),
          };
        },
      }),
      oauthDeviceAuthorization({ verificationUri: `${env.BETTER_AUTH_URL}/otter/device` }),
      codeIdentity(env, db),
    ],
    databaseHooks: {
      session: {
        delete: {
          // Signed out or revoked: close that device's event stream.
          after: async (session) => {
            await env.MAIL.disconnect(session.userId, session.id);
          },
        },
      },
      user: {
        delete: {
          before: async (user) => {
            await env.MAIL.deleteUser(user.id);
          },
        },
      },
    },
    advanced: {
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      ...(legacy
        ? env.COOKIE_DOMAIN
          ? { crossSubDomainCookies: { enabled: true, domain: env.COOKIE_DOMAIN } }
          : {}
        : {
            // __Host also prevents an uploaded sibling-origin page from injecting
            // a parent-domain cookie with the same name. Preserve legacy Mail names.
            useSecureCookies: false,
            cookiePrefix: env.BETTER_AUTH_URL.startsWith("https:")
              ? "__Host-otter-accounts"
              : "otter-accounts",
            defaultCookieAttributes: {
              secure: env.BETTER_AUTH_URL.startsWith("https:"),
              path: "/",
            },
          }),
    },
    telemetry: { enabled: false },
  });
  return auth;
}

export type Auth = ReturnType<typeof createAuth>;
