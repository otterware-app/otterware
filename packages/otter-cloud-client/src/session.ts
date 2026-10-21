import * as Schema from "effect/Schema";
import { OtterCloudClient } from "./index.ts";

/** An environment's Account sign-in, as hosts hand it to engines (ADR 0018). */
export type AccountCredential = {
  /** Code's Account OAuth access token. */
  readonly oauthToken: string;
  /** Otter Accounts' API root, e.g. `https://accounts.otterware.app/v1/auth`. */
  readonly accountsUrl: string;
  readonly cloudOrigin: string;
  /** Stable per device and purpose; Cloud binds every credential to it. */
  readonly audience: string;
};

export type AccountCloud = { readonly accountId: string; readonly client: OtterCloudClient };

const SuiteSession = Schema.Struct({
  token: Schema.String,
  expiresAt: Schema.Number,
  user: Schema.Struct({ id: Schema.String }),
});
const decodeSuiteSession = Schema.decodeUnknownSync(SuiteSession);

/**
 * Turns the host's Account sign-in into a Cloud client: exchanges it at
 * Accounts for the shared suite session and keeps that client until the
 * credential changes or the session nears its end. Promise-based, so engines
 * of any style can hold one.
 */
export class AccountSessions {
  private cached: { key: string; expiresAt: number; cloud: AccountCloud } | null = null;
  private pending: Promise<AccountCloud | null> | null = null;
  private readonly options: {
    fetch?: typeof globalThis.fetch;
    WebSocket?: typeof globalThis.WebSocket;
    now?: () => number;
  };
  constructor(options: AccountSessions["options"] = {}) {
    this.options = options;
  }

  /** Null while signed out; throws when Accounts refuses or cannot be reached. */
  async current(credential: AccountCredential | null): Promise<AccountCloud | null> {
    if (credential === null) {
      this.cached?.cloud.client.clearSession();
      this.cached = null;
      return null;
    }
    const key = JSON.stringify([
      credential.oauthToken,
      credential.accountsUrl,
      credential.cloudOrigin,
      credential.audience,
    ]);
    const now = (this.options.now ?? Date.now)();
    if (this.cached && this.cached.key === key && this.cached.expiresAt > now + 60_000)
      return this.cached.cloud;
    this.pending ??= this.exchange(credential, key).finally(() => (this.pending = null));
    return this.pending;
  }

  private async exchange(credential: AccountCredential, key: string) {
    const fetcher = this.options.fetch ?? globalThis.fetch;
    const response = await fetcher(`${credential.accountsUrl.replace(/\/$/, "")}/suite/session`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${credential.oauthToken}`,
        "content-type": "application/json",
      },
      body: "{}",
      credentials: "omit",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Otter Accounts refused the session (${response.status}).`);
    const session = decodeSuiteSession(await response.json());
    this.cached?.cloud.client.clearSession();
    const client = new OtterCloudClient({
      origin: credential.cloudOrigin,
      audience: credential.audience,
      sessionToken: async () => session.token,
      fetch: fetcher,
      ...(this.options.WebSocket ? { WebSocket: this.options.WebSocket } : {}),
    });
    const cloud = { accountId: session.user.id, client };
    this.cached = { key, expiresAt: session.expiresAt, cloud };
    return cloud;
  }
}
