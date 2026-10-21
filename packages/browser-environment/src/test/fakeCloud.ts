// @effect-diagnostics globalTimers:off globalDate:off -- A fake of the browser's fetch and WebSocket, outside any Effect runtime.
/**
 * Otter Accounts and Otter Cloud as the worker sees them over `fetch` and
 * `WebSocket`, for tests: records requests and lets a test push channel
 * events or drop the socket.
 */
import { BrowserPlatform } from "../BrowserPlatform.ts";

export const ACCOUNTS_URL = "https://accounts.otterware.app/v1/auth";
export const CLOUD_ORIGIN = "https://cloud.otterware.app";

export interface FakeCloud {
  readonly requests: Array<{ readonly url: string; readonly headers: Headers; body: string }>;
  readonly sockets: Array<FakeSocket>;
  /** Resolves with the `index`th channel socket once it is open. */
  readonly socket: (index: number) => Promise<FakeSocket>;
  /** Users by OAuth access token; anything else is refused with 401. */
  readonly users: Map<string, string>;
  /** Answers `/v1/cloud/*` requests beyond the token and channel ticket. */
  cloud: (path: string, init: RequestInit) => Response;
  /** Answers requests to any other origin (an agent's own server). */
  external: (url: string, init: RequestInit) => Response;
  readonly platform: BrowserPlatform["Service"];
}

export class FakeSocket extends EventTarget {
  static readonly OPEN = 1;
  readyState = 0;
  readonly sent: Array<string> = [];
  readonly url: string;
  constructor(url: string | URL) {
    super();
    this.url = String(url);
    queueMicrotask(() => {
      this.readyState = 1;
      this.dispatchEvent(new Event("open"));
    });
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.dispatchEvent(new Event("close"));
  }
  /** A frame from Otter Cloud. */
  push(event: unknown) {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(event) }));
  }
}

export const makeFakeCloud = (): FakeCloud => {
  let secretKey: Promise<CryptoKey> | undefined;
  const waiting = new Map<number, (socket: FakeSocket) => void>();
  const opened = (socket: FakeSocket) => {
    const index = fake.sockets.indexOf(socket);
    waiting.get(index)?.(socket);
    waiting.delete(index);
  };
  const fake: FakeCloud = {
    requests: [],
    sockets: [],
    socket: (index) =>
      new Promise((resolve) => {
        const existing = fake.sockets[index];
        if (existing !== undefined && existing.readyState === 1) resolve(existing);
        else waiting.set(index, resolve);
      }),
    users: new Map([["oauth-ada", "user-ada"]]),
    cloud: () => Response.json({ error: "not found" }, { status: 404 }),
    external: () => Response.json({ error: "not found" }, { status: 404 }),
    platform: {
      fetch: async (input, init = {}) => {
        const url = String(input);
        const headers = new Headers(init.headers);
        fake.requests.push({ url, headers, body: typeof init.body === "string" ? init.body : "" });
        if (url === `${ACCOUNTS_URL}/suite/session`) {
          // Like Accounts, refuse anything but a JSON post.
          if (headers.get("content-type") !== "application/json" || !init.body)
            return new Response(null, { status: 415 });
          const token = headers.get("authorization")?.slice("Bearer ".length) ?? "";
          const user = fake.users.get(token);
          if (user === undefined) return Response.json({ error: "unauthorized" }, { status: 401 });
          return Response.json({
            token: `session-${user}`,
            expiresAt: Date.now() + 86_400_000,
            user: { id: user },
          });
        }
        if (!url.startsWith(`${CLOUD_ORIGIN}/`)) return fake.external(url, init);
        const path = url.slice(CLOUD_ORIGIN.length);
        if (path === "/v1/cloud/token") {
          const { audience } = JSON.parse(String(init.body)) as { audience: string };
          return Response.json({
            accessToken: `cloud-${audience}`,
            expiresAt: Date.now() + 900_000,
            audience,
          });
        }
        if (path === "/v1/cloud/channel-ticket")
          return Response.json({ ticket: "ticket", expiresAt: Date.now() + 60_000 });
        return fake.cloud(path, init);
      },
      WebSocket: class extends FakeSocket {
        constructor(url: string | URL) {
          super(url);
          fake.sockets.push(this);
          this.addEventListener("open", () => opened(this), { once: true });
        }
      } as unknown as typeof WebSocket,
      secretKey: () =>
        (secretKey ??= crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
          "encrypt",
          "decrypt",
        ])),
    },
  };
  return fake;
};

/** A server-sent event stream of JSON frames, as Cloud and chat completions send them. */
export const sse = (frames: ReadonlyArray<unknown>, done = false) =>
  new Response(
    `${frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("")}${done ? "data: [DONE]\n\n" : ""}`,
    { headers: { "content-type": "text/event-stream" } },
  );
