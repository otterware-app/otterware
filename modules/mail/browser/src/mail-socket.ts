/**
 * Platform.connect for Mail in the browser. A browser can't open TCP
 * connections, so each one is a WebSocket to Otter Cloud's tunnel
 * (`/v1/cloud/mail/tunnel`, protocol in mail-contracts' relay.ts), opened with
 * a one-time ticket because a WebSocket carries no headers. TLS happens here
 * in the worker (tls.ts, loaded on the first connection), so the tunnel only
 * carries ciphertext.
 */
import type { ByteStream } from "@otterware/mail-engine";
import { TUNNEL_CLOSE } from "@otterware/mail-contracts/relay";

const CONNECT_TIMEOUT_MS = 20_000;
/** Bytes from the server not yet read: past this the connection goes (a WebSocket can't be paused). */
const MAX_UNREAD = 64 * 1024 * 1024;

export interface TunnelAccess {
  readonly cloudOrigin: string;
  /** A one-time ticket for the next WebSocket, from the environment's Cloud session. */
  readonly ticket: () => Promise<string>;
}

export async function connectMailSocket(
  access: TunnelAccess,
  host: string,
  port: number,
  opts: { tls: boolean },
): Promise<ByteStream> {
  const url = new URL("/v1/cloud/mail/tunnel", access.cloudOrigin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.search = new URLSearchParams({
    host,
    port: String(port),
    ticket: await access.ticket(),
  }).toString();
  const ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";

  // The server's bytes, as they arrive (a WebSocket can't be paused).
  const chunks: Uint8Array[] = [];
  let unread = 0;
  let opened = false;
  let closed = false;
  let failure: Error | null = null;
  let wake: (() => void) | null = null;

  const closeError = (code: number, reason: string): Error | null => {
    if (code === TUNNEL_CLOSE.connectFailed) {
      return new Error(`Couldn't connect to ${host} on port ${port}. ${reason}`);
    }
    if (code === TUNNEL_CLOSE.rateLimited) {
      return new Error("Too many connections through Otter Cloud, retrying shortly.");
    }
    // The tunnel's limits: like a dropped connection, the next one goes on.
    if (
      code === TUNNEL_CLOSE.lost ||
      code === TUNNEL_CLOSE.limit ||
      code === TUNNEL_CLOSE.backlog
    ) {
      return new Error(`Lost the connection to ${host}.`);
    }
    if (code === TUNNEL_CLOSE.idle) return new Error(`The connection to ${host} idled out.`);
    return opened ? null : new Error(`Couldn't reach ${host} through Otter Cloud.`);
  };

  // The tunnel sends "open" once the TCP connection is up, then raw bytes.
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${host} didn't answer on port ${port}.`));
      ws.close();
    }, CONNECT_TIMEOUT_MS);
    ws.addEventListener("message", ({ data }) => {
      if (data instanceof ArrayBuffer) {
        if (failure) return;
        unread += data.byteLength;
        if (unread > MAX_UNREAD) {
          failure = new Error(`${host} sent more than we could keep up with.`);
          chunks.length = 0;
          ws.close();
        } else {
          chunks.push(new Uint8Array(data));
        }
        wake?.();
      } else if (data === "open") {
        opened = true;
        clearTimeout(timer);
        resolve();
      }
    });
    ws.addEventListener("close", ({ code, reason }) => {
      clearTimeout(timer);
      closed = true;
      failure ??= closeError(code, reason);
      if (failure) reject(failure);
      wake?.();
    });
  });

  const readPlain = async (): Promise<Uint8Array | null> => {
    while (chunks.length === 0) {
      if (failure) throw failure;
      if (closed) return null;
      await new Promise<void>((resolve) => (wake = resolve));
      wake = null;
    }
    const chunk = chunks.shift()!;
    unread -= chunk.length;
    return chunk;
  };
  const writePlain = (data: Uint8Array) => {
    if (ws.readyState !== WebSocket.OPEN) {
      throw failure ?? new Error(`${host} closed the connection.`);
    }
    ws.send(data as Uint8Array<ArrayBuffer>);
  };

  let read = readPlain;
  let write = async (data: Uint8Array) => writePlain(data);
  const secure = async () => {
    // Anything the server sent after its go-ahead would be unencrypted bytes
    // an attacker could have slipped in: refuse it.
    if (chunks.length > 0) throw new Error(`${host} sent data before STARTTLS completed.`);
    // A handshake that stalls ends with the tunnel.
    const timer = setTimeout(() => ws.close(), CONNECT_TIMEOUT_MS);
    try {
      const { negotiateTls } = await import("./tls.ts");
      const tls = await negotiateTls(host, readPlain, writePlain);
      read = async () => (await tls.read()) ?? null;
      write = tls.write;
    } finally {
      clearTimeout(timer);
    }
  };

  if (opts.tls) {
    try {
      await secure();
    } catch (err) {
      ws.close();
      throw err;
    }
  }
  return {
    read: () => read(),
    write: (data) => write(data),
    startTls: secure,
    close: () => ws.close(),
  };
}
