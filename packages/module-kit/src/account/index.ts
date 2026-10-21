// @effect-diagnostics globalTimers:off globalDate:off -- Portable Cloud SDK lifetime; hosts acquire and close this adapter in their Effect scope.
import {
  OtterCloudClient,
  type ChannelEvent,
  type CloudChannel,
  type Connection,
  type Provider,
  type ProviderToken,
} from "@otterware/otter-cloud-client";
import * as Context from "effect/Context";
import * as Schema from "effect/Schema";
import { makeLinkedAccounts, type LinkedAccount } from "./linked.ts";

export type { LinkedAccount } from "./linked.ts";

/** A module's view of the host account. Provider refresh grants never leave Cloud. */
export interface ProviderAccount {
  readonly accountId: string;
  connections: OtterCloudClient["connections"];
  providerToken: OtterCloudClient["providerToken"];
  push: OtterCloudClient["push"];
  pull: OtterCloudClient["pull"];
  subscribe: (listener: (event: ChannelEvent) => void) => () => void;
  /** Hosts that link Google accounts to the Otter Account (`DeviceProviderAccount`). */
  linked?: () => Promise<ReadonlyArray<LinkedAccount>>;
  unlink?: (email: string) => Promise<void>;
}
export interface ConnectedAccount extends ProviderAccount {
  readonly email: string;
  readonly client: OtterCloudClient;
}
/**
 * Google authorized on this device only. One consent covers Mail, Calendar and contacts here;
 * the refresh token stays in this environment's secret store and never reaches Otter Cloud.
 */
export interface DeviceProviders {
  readonly connections: () => Promise<ReadonlyArray<typeof Connection.Type>>;
  readonly providerToken: (connectionId: string) => Promise<typeof ProviderToken.Type>;
  /**
   * Returns the consent URL; the connection appears once the user approves it. `email` asks for
   * that account, to authorize an account linked on another device or to add Mail access.
   */
  readonly connect: (
    provider: typeof Provider.Type,
    email?: string,
  ) => Promise<{ readonly url: string }>;
  readonly disconnect: (connectionId: string) => Promise<void>;
  readonly subscribe: (listener: () => void) => () => void;
}
/**
 * What Mail and Calendar use: the Google accounts linked to the Otter Account, authorized with
 * grants from this device. `connections` lists this device's grants.
 */
export interface DeviceProviderAccount extends ConnectedAccount {
  readonly linked: () => Promise<ReadonlyArray<LinkedAccount>>;
  /** Authorizes Google on this device and links the account. */
  readonly connect: DeviceProviders["connect"];
  /** Unlinks the grant's account from the Otter Account, on every device. */
  readonly disconnect: (connectionId: string) => Promise<void>;
  /** Unlinks an account from the Otter Account, on every device. */
  readonly unlink: (email: string) => Promise<void>;
}
/** Where the user approves this environment's own sign-in, from any browser. */
export interface SignInPrompt {
  readonly verificationUrl: string;
  readonly userCode: string;
  readonly expiresAt: number;
}
/** The login has no fresh token right now; the environment keeps its current session. */
export class LoginUnavailable extends Error {
  constructor() {
    super("Waiting for a fresh Otter Account token.");
  }
}
/** The environment's own Otter Account login, owned and renewed by the host. */
export interface EnvironmentLogin {
  /**
   * A current access token for the environment's login, or null while signed out. Rejects with
   * `LoginUnavailable` while no fresh token can be read, which keeps the current session.
   */
  readonly accessToken: () => Promise<string | null>;
  /** Starts a device sign-in; the host stores the login and calls `signedIn` once approved. */
  readonly signIn: (signedIn: () => void) => Promise<SignInPrompt>;
  /** Revokes the environment's login at Accounts and forgets it. */
  readonly signOut: () => Promise<void>;
  /** Present when the environment is built into an app and uses the app's account (`appLogin`). */
  readonly hand?: (accessToken: string | null) => void;
}

/**
 * The login of an environment built into a desktop app: it uses the Otter Account the app is
 * signed in to, so there is no separate sign-in. The app hands over a fresh access token (null
 * once it signs out); the environment trades it for its suite session and keeps that session,
 * renewing it with the next token the app hands over. The app owns and revokes its own grant.
 */
export function appLogin(): EnvironmentLogin {
  let signedIn = false;
  let handed: string | null = null;
  return {
    accessToken: async () => {
      if (!signedIn) return null;
      const token = handed;
      handed = null;
      if (token === null) throw new LoginUnavailable();
      return token;
    },
    signIn: () =>
      Promise.reject(
        new Error("Sign in to this app. Its built-in environment uses the app's Otter Account."),
      ),
    signOut: async () => {
      signedIn = false;
      handed = null;
    },
    hand: (accessToken) => {
      signedIn = accessToken !== null;
      handed = accessToken;
    },
  };
}
export class OtterAccountSession extends Context.Service<
  OtterAccountSession,
  {
    /** The environment's account, for Code, Home and Drive. */
    readonly current: () => ConnectedAccount | null;
    /**
     * The account Mail and Calendar take provider connections from. Null on headless servers:
     * Mail and Calendar on VMs are deferred, so signing a VM in must not start their sync.
     */
    readonly providerAccount: () => DeviceProviderAccount | null;
    readonly status: () => {
      readonly pendingSignIn: SignInPrompt | null;
      readonly error: string | null;
      /** The environment uses the account of the app it is built into (`appLogin`). */
      readonly followsApp: boolean;
    };
    readonly signIn: () => Promise<SignInPrompt>;
    readonly signOut: () => Promise<void>;
    /** The app's current access token, or null once the app signs out (`appLogin` only). */
    readonly useAppAccount: (accessToken: string | null) => Promise<void>;
    readonly subscribe: (listener: () => void) => () => void;
  }
>()("@otterware/module-kit/account/OtterAccountSession") {}

const SuiteSession = Schema.Struct({
  token: Schema.String,
  expiresAt: Schema.Number,
  user: Schema.Struct({ id: Schema.String, email: Schema.String }),
});
type SuiteSession = typeof SuiteSession.Type;
const decodeSession = Schema.decodeUnknownSync(SuiteSession);
/** Accounts hands out the same suite session until a day before it ends, so hourly is cheap. */
const RENEW_EVERY_MS = 60 * 60_000;

/**
 * One scoped host account, shared by all enabled modules in an environment. It follows the
 * environment's own login: no client attaches it and no open screen keeps it alive.
 */
export function makeOtterAccountSession(options: {
  readonly accountsUrl: string;
  readonly cloudOrigin: string;
  readonly audience: string;
  readonly login: EnvironmentLogin;
  /** This device's provider grants; null on headless servers (Mail and Calendar on VMs deferred). */
  readonly devices: DeviceProviders | null;
  readonly fetch?: typeof fetch;
  readonly WebSocket?: typeof WebSocket;
}) {
  const fetcher = options.fetch ?? globalThis.fetch;
  const listeners = new Set<() => void>();
  const events = new Set<(event: ChannelEvent) => void>();
  let current: ConnectedAccount | null = null;
  let session: SuiteSession | null = null;
  let channel: CloudChannel | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let renewal: ReturnType<typeof setTimeout> | undefined;
  let pendingSignIn: SignInPrompt | null = null;
  let error: string | null = null;
  let generation = 0;
  let closed = false;
  let refreshing: Promise<void> | null = null;
  const changed = () => {
    for (const listener of [...listeners]) listener();
  };
  const disconnect = () => {
    clearTimeout(retry);
    channel?.close();
    channel = null;
    current?.client.clearSession();
  };
  const connect = (account: ConnectedAccount) => {
    if (closed || current !== account) return;
    void account.client
      .openChannel((event) => {
        if (current !== account) return;
        for (const listener of [...events]) listener(event);
        if (event.type === "connections.changed") changed();
      })
      .then((opened) => {
        if (closed || current !== account) {
          opened.close();
          return;
        }
        channel = opened;
        opened.socket.addEventListener(
          "close",
          () => {
            if (!closed && current === account) retry = setTimeout(() => connect(account), 5_000);
          },
          { once: true },
        );
      })
      .catch(() => {
        if (!closed && current === account) retry = setTimeout(() => connect(account), 5_000);
      });
  };
  const uninstall = () => {
    if (!current && !session) return;
    disconnect();
    current = null;
    session = null;
    changed();
  };
  const install = (next: SuiteSession) => {
    session = next;
    if (current?.accountId === next.user.id) return;
    disconnect();
    const accountId = next.user.id;
    const client = new OtterCloudClient({
      origin: options.cloudOrigin,
      audience: options.audience,
      fetch: fetcher,
      ...(options.WebSocket ? { WebSocket: options.WebSocket } : {}),
      sessionToken: async () => {
        if (!session || session.expiresAt <= Date.now()) await refresh();
        if (!session || session.user.id !== accountId || session.expiresAt <= Date.now())
          throw new Error(
            options.login.hand
              ? "Sign in to this app with your Otter Account again."
              : "Sign in to your Otter Account on this environment again.",
          );
        return session.token;
      },
    });
    current = {
      accountId,
      email: next.user.email,
      client,
      connections: () => client.connections(),
      providerToken: (id) => client.providerToken(id),
      push: (records) => client.push(records),
      pull: (cursor) => client.pull(cursor),
      subscribe: (listener) => {
        events.add(listener);
        return () => {
          events.delete(listener);
        };
      },
    };
    connect(current);
    changed();
    relink();
  };
  const exchange = async (version: number) => {
    const accessToken = await options.login.accessToken().catch((cause: unknown) => {
      if (cause instanceof LoginUnavailable) return undefined;
      error = "This environment's Otter Account sign-in ended. Sign it in again.";
      return null;
    });
    if (closed || version !== generation) return;
    if (accessToken === undefined) return;
    if (!accessToken) {
      uninstall();
      return;
    }
    const response = await fetcher(`${options.accountsUrl.replace(/\/$/, "")}/suite/session`, {
      method: "POST",
      // Accounts only accepts JSON posts (415 otherwise), even with nothing to send.
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: "{}",
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (closed || version !== generation) return;
    // A rejected login signs the environment out; a transient failure keeps the last session.
    if (response.status === 401 || response.status === 403) {
      error = "This environment's Otter Account sign-in ended. Sign it in again.";
      uninstall();
      return;
    }
    if (!response.ok) throw new Error(`Accounts answered ${response.status}.`);
    const next = decodeSession(await response.json());
    if (closed || version !== generation) return;
    error = null;
    install(next);
  };
  /** Re-reads the environment's login; concurrent callers share one exchange. */
  const refresh = (): Promise<void> => {
    if (refreshing) return refreshing;
    const version = ++generation;
    const before = error;
    refreshing = exchange(version)
      .catch(() => {
        if (!current) error = "Could not reach Otter Accounts. Retrying.";
      })
      .finally(() => {
        refreshing = null;
        // Identity changes notify from install/uninstall; renewals stay silent.
        if (error !== before) changed();
      });
    return refreshing;
  };
  const renew = () => {
    if (closed) return;
    void refresh().finally(() => {
      if (!closed) renewal = setTimeout(renew, RENEW_EVERY_MS);
    });
  };
  renew();
  const devices = options.devices;
  let providerAccount: {
    base: ConnectedAccount;
    account: DeviceProviderAccount;
    links: ReturnType<typeof makeLinkedAccounts>;
  } | null = null;
  const connectionsChanged = () => {
    for (const listener of [...events]) listener({ type: "connections.changed" });
    changed();
  };
  /** Brings the linked list and this device's grants together, then tells Mail and Calendar. */
  const relink = () => {
    if (!service.providerAccount()) return;
    void providerAccount?.links
      .sync()
      .then(connectionsChanged)
      .catch(() => {});
  };
  const stopDevices = devices?.subscribe(() => {
    connectionsChanged();
    relink();
  });
  // Another device linked or unlinked an account.
  events.add((event) => {
    if (event.type === "sync.changed") relink();
  });
  const service: OtterAccountSession["Service"] = {
    current: () => current,
    providerAccount: () => {
      if (!devices || !current) return null;
      if (providerAccount?.base !== current) {
        const links = makeLinkedAccounts(current, devices);
        providerAccount = {
          base: current,
          links,
          account: {
            ...current,
            connections: async () => [...(await devices.connections())],
            providerToken: devices.providerToken,
            linked: links.list,
            connect: devices.connect,
            disconnect: async (id) => {
              const grant = (await devices.connections()).find((each) => each.id === id);
              if (grant) await links.unlink(grant.email);
            },
            unlink: links.unlink,
          },
        };
      }
      return providerAccount.account;
    },
    status: () => ({
      pendingSignIn: pendingSignIn && pendingSignIn.expiresAt > Date.now() ? pendingSignIn : null,
      error,
      followsApp: options.login.hand !== undefined,
    }),
    signIn: async () => {
      const active = service.status().pendingSignIn;
      if (active) return active;
      const prompt = await options.login.signIn(() => {
        pendingSignIn = null;
        error = null;
        void refresh();
      });
      pendingSignIn = prompt;
      changed();
      return prompt;
    },
    signOut: async () => {
      await options.login.signOut();
      pendingSignIn = null;
      error = null;
      ++generation;
      uninstall();
      changed();
    },
    useAppAccount: async (accessToken) => {
      const hand = options.login.hand;
      if (!hand) throw new Error("This environment keeps its own Otter Account sign-in.");
      hand(accessToken);
      // Let a renewal already in flight finish, so this token is the one exchanged.
      await refreshing;
      await refresh();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    service,
    close: () => {
      closed = true;
      ++generation;
      stopDevices?.();
      clearTimeout(renewal);
      disconnect();
      current = null;
      session = null;
      listeners.clear();
      events.clear();
    },
  };
}
