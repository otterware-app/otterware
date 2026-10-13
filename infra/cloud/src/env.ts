import type { Env as AccountsEnv } from "../accounts/src/env.ts";
import type { Env as MailEnv } from "../mail/src/worker.ts";
import type { Env as DriveEnv } from "../drive/src/server/types.ts";
import type { EnvironmentHub } from "./environment-hub.ts";
import type { CloudAgentHub } from "./agent-hub.ts";

export interface Env {
  ACCOUNT_DATA: D1Database;
  ACCOUNTS_DB: D1Database;
  DRIVE_DB: D1Database;
  MAIL_DB: D1Database;
  ACCOUNTS: NonNullable<MailEnv["ACCOUNTS"]>;
  MAIL_LIFECYCLE: AccountsEnv["MAIL"];
  LEGACY_USER_HUB: MailEnv["USER_HUB"];
  LEGACY_AGENT_HUB: NonNullable<MailEnv["AGENT_HUB"]>;
  ENVIRONMENT_HUB: DurableObjectNamespace<EnvironmentHub>;
  CLOUD_AGENT_HUB: DurableObjectNamespace<CloudAgentHub>;
  ARTIFACTS: R2Bucket;
  BROWSER: DriveEnv["BROWSER"];
  ASSETS: Fetcher;
  TUNNEL_LIMIT: RateLimit;
  TUNNEL_UNLINKED_LIMIT: RateLimit;
  CLOUD_ORIGIN: string;
  CONTENT_ORIGIN: string;
  ALLOWED_ORIGINS: string;
  CLOUD_SECRET: string;
  GOOGLE_PROVIDER_CLIENT_ID: string;
  GOOGLE_PROVIDER_CLIENT_SECRET?: string;
  MICROSOFT_PROVIDER_CLIENT_ID: string;
  MICROSOFT_PROVIDER_CLIENT_SECRET?: string;
  ACCOUNTS_SECRET?: string;
  MAIL_SECRET?: string;
  DRIVE_SECRET?: string;
  CONTENT_SIGNING_KEY?: string;
  RESEND_API_KEY?: string;
  LEGACY_GOOGLE_WEB_CLIENT_SECRET?: string;
  APNS_TEAM_ID?: string;
  APNS_KEY_ID?: string;
  APNS_PRIVATE_KEY?: string;
  /** Future cutover only; the parallel deployment never enables these routes. */
  LEGACY_HOSTS?: string;
}
export type Identity = {
  userId: string;
  sessionId: string;
  sessionToken: string;
  audience: string;
  expiresAt: number;
};
export type App = { Bindings: Env; Variables: { identity: Identity } };
