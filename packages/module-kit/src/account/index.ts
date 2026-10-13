// @effect-diagnostics globalTimers:off globalDate:off -- Portable Cloud SDK lifetime; hosts acquire and close this adapter in their Effect scope.
import {
  OtterCloudClient,
  type ChannelEvent,
  type CloudChannel,
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
  readonly client: OtterCloudClient;
}
export class OtterAccountSession extends Context.Service<
  OtterAccountSession,
  {
    readonly current: () => ConnectedAccount | null;
    readonly attach: (accessToken: string) => Promise<string>;
    readonly detach: () => Promise<void>;
    readonly subscribe: (listener: () => void) => () => void;
  }
>()("@otterware/module-kit/account/OtterAccountSession") {}

const SuiteSession = Schema.Struct({
  token: Schema.String,
  expiresAt: Schema.Number,
  user: Schema.Struct({ id: Schema.String }),
});
type SuiteSession = typeof SuiteSession.Type;
const decodeSession = Schema.decodeUnknownSync(SuiteSession);

/** One scoped host account, shared by all enabled modules in an environment. */
export async function makeOtterAccountSession(options: {
  readonly accountsUrl: string;
  readonly cloudOrigin: string;
  readonly audience: string;
  readonly fetch?: typeof fetch;
  readonly WebSocket?: typeof WebSocket;
  readonly storage?: { read(): Promise<unknown>; write(value: SuiteSession | null): Promise<void> };
}) {
  const fetcher = options.fetch ?? globalThis.fetch;
  const listeners = new Set<() => void>();
  const events = new Set<(event: ChannelEvent) => void>();
  let current: ConnectedAccount | null = null;
  let session: SuiteSession | null = null;
  let channel: CloudChannel | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  let closed = false;
  let pendingStorage = Promise.resolve();
  const persist = (value: SuiteSession | null) => {
    const next = pendingStorage.catch(() => {}).then(() => options.storage?.write(value));
    pendingStorage = next;
    return next;
  };
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
        if (!session || session.user.id !== accountId || session.expiresAt <= Date.now())
          throw new Error("Sign in to your Otter Account again.");
        return session.token;
      },
    });
    current = {
      accountId,
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
  if (options.storage) {
    const saved = await options.storage.read();
    if (saved !== null) {
      const decoded = Schema.decodeUnknownOption(SuiteSession)(saved);
      if (decoded._tag === "Some" && decoded.value.expiresAt > Date.now()) install(decoded.value);
    }
  }
  const service: OtterAccountSession["Service"] = {
    current: () => current,
    attach: async (accessToken) => {
      const version = ++generation;
      const response = await fetcher(`${options.accountsUrl.replace(/\/$/, "")}/suite/session`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` },
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error("Could not connect your Otter Account. Sign in again.");
      const next = decodeSession(await response.json());
      if (next.expiresAt <= Date.now()) throw new Error("Your Otter session has expired.");
      if (closed || generation !== version) throw new Error("Account connection was cancelled.");
      await persist(next);
      if (closed || generation !== version) throw new Error("Account connection was cancelled.");
      install(next);
      return next.user.id;
    },
    detach: async () => {
      ++generation;
      const previous = current;
      current = null;
      session = null;
      disconnect();
      previous?.client.clearSession();
      changed();
      await persist(null);
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
      disconnect();
      current = null;
      session = null;
      listeners.clear();
      events.clear();
    },
  };
}
