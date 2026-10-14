import * as Schema from "effect/Schema";
import * as Contracts from "./contracts.ts";
export * from "./contracts.ts";
const decodeAccessToken = Schema.decodeUnknownSync(Contracts.AccessToken);
const decodeChannelEvent = Schema.decodeUnknownSync(Contracts.ChannelEvent);
const decodeChannelTicket = Schema.decodeUnknownSync(Contracts.ChannelTicket);
const decodeConnectResult = Schema.decodeUnknownSync(Contracts.ConnectResult);
const decodeConnections = Schema.decodeUnknownSync(Contracts.Connections);
const decodeProviderToken = Schema.decodeUnknownSync(Contracts.ProviderToken);
const decodeSyncPage = Schema.decodeUnknownSync(Contracts.SyncPage);
const decodeSyncPush = Schema.decodeUnknownSync(Contracts.SyncPush);

const decodeAgentConnection = Schema.decodeUnknownSync(Contracts.AgentConnection);
const decodeAgentSessions = Schema.decodeUnknownSync(Contracts.AgentSessions);
const decodeAgentMessages = Schema.decodeUnknownSync(Contracts.AgentMessages);
const decodeAgentEvent = Schema.decodeUnknownSync(Contracts.AgentEvent);

export class CloudError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "CloudError";
  }
}
export type CloudClientOptions = {
  origin: string;
  /** Stable environment/device audience; returned credentials cannot be reused for another audience. */
  audience: string;
  /** Existing Otter offline session, kept by the host's secret store. Never a Google refresh token. */
  sessionToken: () => Promise<string>;
  fetch?: typeof globalThis.fetch;
  WebSocket?: typeof globalThis.WebSocket;
};

/** Portable HTTP and WebSocket client; persistence belongs to the module's local SQLite store. */
export class OtterCloudClient {
  private readonly fetcher: typeof globalThis.fetch;
  private readonly origin: string;
  private readonly channels = new Set<CloudChannel>();
  private readonly tokens = new Map<string, Promise<typeof Contracts.AccessToken.Type>>();
  private readonly options: CloudClientOptions;
  constructor(options: CloudClientOptions) {
    this.options = options;
    const url = new URL(options.origin);
    if (
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.username ||
      url.password ||
      (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname))
    )
      throw new Error("Invalid Cloud origin.");
    this.origin = url.origin;
    this.fetcher = options.fetch ?? globalThis.fetch;
  }
  private async checked(response: Response) {
    if (!response.ok)
      throw new CloudError(response.status, `Cloud request failed (${response.status}).`);
    return response;
  }
  async accessToken(audience = this.options.audience): Promise<string> {
    let pending = this.tokens.get(audience);
    if (pending) {
      const cached = await pending;
      if (cached.expiresAt > Date.now() + 30_000) return cached.accessToken;
    }
    pending = (async () => {
      const response = await this.checked(
        await this.fetcher(`${this.origin}/v1/cloud/token`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${await this.options.sessionToken()}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ audience }),
          credentials: "omit",
          signal: AbortSignal.timeout(15_000),
        }),
      );
      const result = decodeAccessToken(await response.json());
      if (result.audience !== audience) throw new Error("Cloud returned the wrong audience.");
      return result;
    })();
    this.tokens.set(audience, pending);
    try {
      return (await pending).accessToken;
    } catch (error) {
      this.tokens.delete(audience);
      throw error;
    }
  }
  clearSession() {
    this.tokens.clear();
    for (const channel of this.channels) channel.close();
    this.channels.clear();
  }
  async request(path: string, init: RequestInit = {}): Promise<Response> {
    if (!path.startsWith("/v1/cloud/") && !path.startsWith("/api/v1/"))
      throw new Error("Invalid Cloud API path.");
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${await this.accessToken()}`);
    headers.set("x-otter-audience", this.options.audience);
    if (init.body) headers.set("content-type", "application/json");
    const response = await this.fetcher(`${this.origin}${path}`, {
      ...init,
      headers,
      credentials: "include",
      signal: init.signal ?? AbortSignal.timeout(30_000),
    });
    if (response.status === 401) this.tokens.delete(this.options.audience);
    return this.checked(response);
  }
  async connections() {
    return decodeConnections(await (await this.request("/v1/cloud/connections")).json())
      .connections;
  }
  async connect(provider: Contracts.Provider, scopes: readonly string[], returnTo: string) {
    return decodeConnectResult(
      await (
        await this.request("/v1/cloud/connections", {
          method: "POST",
          body: JSON.stringify({ provider, scopes, returnTo }),
        })
      ).json(),
    );
  }
  async disconnect(connectionId: string) {
    await this.request(`/v1/cloud/connections/${encodeURIComponent(connectionId)}`, {
      method: "DELETE",
    });
  }
  async providerToken(connectionId: string) {
    const result = decodeProviderToken(
      await (
        await this.request(`/v1/cloud/connections/${encodeURIComponent(connectionId)}/token`, {
          method: "POST",
        })
      ).json(),
    );
    if (result.audience !== this.options.audience || result.connectionId !== connectionId)
      throw new Error("Cloud returned a token for another connection or audience.");
    return result;
  }
  async push(records: readonly Contracts.SyncRecord[]) {
    return decodeSyncPush(
      await (
        await this.request("/v1/cloud/sync", { method: "POST", body: JSON.stringify({ records }) })
      ).json(),
    );
  }
  async pull(cursor = 0) {
    return decodeSyncPage(await (await this.request(`/v1/cloud/sync?cursor=${cursor}`)).json());
  }
  async agentConnection() {
    return decodeAgentConnection(await (await this.request("/v1/cloud/agent/connection")).json());
  }
  async connectAgent(apiKey: string) {
    return decodeAgentConnection(
      await (
        await this.request("/v1/cloud/agent/connection", {
          method: "PUT",
          body: JSON.stringify({ apiKey }),
        })
      ).json(),
    );
  }
  async disconnectAgent() {
    return decodeAgentConnection(
      await (await this.request("/v1/cloud/agent/connection", { method: "DELETE" })).json(),
    );
  }
  async agentSessions() {
    return decodeAgentSessions(await (await this.request("/v1/cloud/agent/sessions")).json());
  }
  async agentMessages(sessionId: string) {
    return decodeAgentMessages(
      await (
        await this.request(`/v1/cloud/agent/sessions/${encodeURIComponent(sessionId)}`)
      ).json(),
    );
  }
  async deleteAgentSession(sessionId: string) {
    await this.request(`/v1/cloud/agent/sessions/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
    });
  }
  async answerAgentTool(requestId: string, id: string, output: Contracts.AgentToolOutput) {
    await this.request("/v1/cloud/agent/tool-result", {
      method: "POST",
      body: JSON.stringify({ requestId, id, output }),
    });
  }
  async cancelAgentTurn(requestId: string) {
    await this.request("/v1/cloud/agent/cancel", {
      method: "POST",
      body: JSON.stringify({ requestId }),
    });
  }
  async *agentTurn(
    turn: Contracts.AgentTurn,
    signal: AbortSignal,
  ): AsyncGenerator<Contracts.AgentEvent> {
    const response = await this.request("/v1/cloud/agent/turn", {
      method: "POST",
      body: JSON.stringify(turn),
      signal,
    });
    if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream"))
      throw new Error("Cloud agent did not return an event stream.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        if (buffer.length > 8 * 1024 * 1024)
          throw new Error("Cloud agent event exceeds the size limit.");
        let end: number;
        while ((end = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (!frame.startsWith("data: ")) continue;
          const event = decodeAgentEvent(JSON.parse(frame.slice(6)));
          if (event.requestId !== turn.requestId)
            throw new Error("Cloud agent event belongs to another turn.");
          yield event;
        }
        if (done) break;
      }
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }
  async openChannel(onEvent: (event: Contracts.ChannelEvent) => void) {
    const { ticket } = decodeChannelTicket(
      await (await this.request("/v1/cloud/channel-ticket", { method: "POST" })).json(),
    );
    const url = new URL("/v1/cloud/channel", this.origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("ticket", ticket);
    const socket = new (this.options.WebSocket ?? globalThis.WebSocket)(url);
    const channel = new CloudChannel(socket, onEvent, this.options.audience);
    this.channels.add(channel);
    socket.addEventListener("close", () => this.channels.delete(channel), { once: true });
    return channel;
  }
}

/** The caller reconnects after close and resumes sync using its persisted revision cursor. */
export class CloudChannel {
  private readonly pending = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  readonly ready: Promise<void>;
  readonly socket: WebSocket;
  private readonly audience: string;
  constructor(
    socket: WebSocket,
    onEvent: (event: Contracts.ChannelEvent) => void,
    audience: string,
  ) {
    this.audience = audience;
    this.socket = socket;
    this.ready = new Promise((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("Cloud channel failed.")), {
        once: true,
      });
      socket.addEventListener("close", () => reject(new Error("Cloud channel closed.")), {
        once: true,
      });
    });
    socket.addEventListener("message", (event) => {
      if (event.data === "pong") return;
      let message;
      try {
        message = decodeChannelEvent(JSON.parse(String(event.data)));
      } catch {
        socket.close(1002, "Invalid Cloud frame");
        return;
      }
      if ((message.type === "result" || message.type === "error") && message.id) {
        const request = this.pending.get(message.id);
        if (request) {
          clearTimeout(request.timer);
          this.pending.delete(message.id);
          if (message.type === "result") request.resolve(message.data);
          else request.reject(new CloudError(message.status, message.error));
        }
      } else onEvent(message);
    });
    socket.addEventListener("close", () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error("Cloud channel closed; retry after reconnecting."));
      }
      this.pending.clear();
    });
  }
  private async request(input: object) {
    await this.ready;
    const id = crypto.randomUUID();
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Cloud channel request timed out."));
      }, 30_000);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.socket.send(JSON.stringify({ ...input, id }));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  async providerToken(connectionId: string) {
    return decodeProviderToken(await this.request({ type: "provider.token", connectionId }));
  }
  async push(records: readonly Contracts.SyncRecord[]) {
    return decodeSyncPush(await this.request({ type: "sync.push", records }));
  }
  async pull(cursor = 0) {
    return decodeSyncPage(await this.request({ type: "sync.pull", cursor }));
  }
  close() {
    this.socket.close(1000);
  }
}
