import type { Auth } from "./auth.ts";
import type { Db } from "./store.ts";

export interface Env {
  DB: D1Database;
  MAIL: {
    disconnect(userId: string, sessionId?: string): Promise<void>;
    deleteUser(userId: string): Promise<void>;
  };
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  MAIL_AUTH_URL: string;
  APP_ORIGIN: string;
  DRIVE_ORIGIN: string;
  CODE_ORIGIN?: string;
  CODE_RELAY_ORIGIN?: string;
  /** otterware.app, the apps' site: its nav asks whether this browser is signed in. */
  SITE_ORIGIN: string;
  COOKIE_DOMAIN?: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_IOS_CLIENT_ID?: string;
  GOOGLE_CALENDAR_CLIENT_ID?: string;
  GOOGLE_OTTERWARE_CLIENT_ID?: string;
  GOOGLE_WEB_CLIENT_ID: string;
  GOOGLE_WEB_CLIENT_SECRET: string;
  /** The shared Google sign-in client; legacy Mail clients remain trusted below. */
  GOOGLE_AUTH_CLIENT_ID?: string;
  GOOGLE_AUTH_CLIENT_SECRET?: string;
  GOOGLE_LEGACY_CLIENT_IDS?: string;
  GOOGLE_JWKS_URL?: string;
  /** Microsoft sign-in (work, school and personal accounts) when both are set. */
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
  /** Email and password sign-in when set: Resend sends the confirmation and reset links. */
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  /** Stops identity writes while importing the original Mail identity database. */
  MAINTENANCE?: string;
}

export type App = { Bindings: Env; Variables: { db: Db; auth: Auth } };
