export interface Env {
  APP_URL: string;
  CONTENT_URL: string;
  ADMIN_EMAIL: string;
  BETTER_AUTH_SECRET: string;
  CONTENT_SIGNING_KEY: string;
  OTTER_AUTH_URL: string;
  MAIL_AUTH_URL: string;
  MAIL_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  DB: D1Database;
  ARTIFACTS: R2Bucket;
  ASSETS: Fetcher;
  BROWSER: BrowserRun;
}

export interface AuthenticatedActor {
  type: "user" | "api_key";
  id: string;
  name: string;
  userId: string | null;
  folderId: string;
  ownerUserId?: string;
  keyScopeId?: string | null;
  roles: string[];
  permissions: Record<string, string[]>;
}
