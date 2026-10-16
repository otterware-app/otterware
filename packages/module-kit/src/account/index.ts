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

/** A module's view of the host account. Provider refresh grants never leave Cloud. */
export interface ProviderAccount {
  readonly accountId: string;
  connections: OtterCloudClient["connections"];
  providerToken: OtterCloudClient["providerToken"];
  push: OtterCloudClient["push"];
  pull: OtterCloudClient["pull"];
  subscribe: (listener: (event: ChannelEvent) => void) => () => void;
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
  /** Returns the consent URL; the connection appears once the user approves it. */
  readonly connect: (provider: typeof Provider.Type) => Promise<{ readonly url: string }>;
  readonly disconnect: (connectionId: string) => Promise<void>;
  readonly subscribe: (listener: () => void) => () => void;
}
/** What Mail and Calendar use: account data from Cloud, provider grants from this device. */
export interface DeviceProviderAccount extends ConnectedAccount {
  readonly connect: DeviceProviders["connect"];
  readonly disconnect: DeviceProviders["disconnect"];
}
/** Where the user approves this environment's own sign-in, from any browser. */
export interface SignInPrompt {
  readonly verificationUrl: string;
  readonly userCode: string;
  readonly expiresAt: number;
}
/** The environment's own Otter Account login, owned and renewed by the host. */
export interface EnvironmentLogin {
  /** A current access token for the environment's login, or null while signed out. */
  readonly accessToken: () => Promise<string | null>;
  /** Starts a device sign-in; the host stores the login and calls `signedIn` once approved. */
  readonly signIn: (signedIn: () => void) => Promise<SignInPrompt>;
  /** Revokes the environment's login at Accounts and forgets it. */
  readonly signOut: () => Promise<void>;
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
    };
    readonly signIn: () => Promise<SignInPrompt>;
    readonly signOut: () => Promise<void>;
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
          throw new Error("Sign in to your Otter Account on this environment again.");
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
  };
  const exchange = async (version: number) => {
    const accessToken = await options.login.accessToken().catch(() => {
      error = "This environment's Otter Account sign-in ended. Sign it in again.";
      return null;
    });
    if (closed || version !== generation) return;
    if (!accessToken) {
      uninstall();
      return;
    }
    const response = await fetcher(`${options.accountsUrl.replace(/\/$/, "")}/suite/session`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
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
  const stopDevices = devices?.subscribe(() => {
    for (const listener of [...events]) listener({ type: "connections.changed" });
    changed();
  });
  let providerAccount: { base: ConnectedAccount; account: DeviceProviderAccount } | null = null;
  const service: OtterAccountSession["Service"] = {
    current: () => current,
    providerAccount: () => {
      if (!devices || !current) return null;
      if (providerAccount?.base !== current)
        providerAccount = {
          base: current,
          account: {
            ...current,
            connections: async () => [...(await devices.connections())],
            providerToken: devices.providerToken,
            connect: devices.connect,
            disconnect: devices.disconnect,
          },
        };
      return providerAccount.account;
    },
    status: () => ({
      pendingSignIn: pendingSignIn && pendingSignIn.expiresAt > Date.now() ? pendingSignIn : null,
      error,
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
