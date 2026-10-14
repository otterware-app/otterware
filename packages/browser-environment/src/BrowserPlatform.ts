/**
 * The browser APIs the worker's host services use: the network, and the key
 * that seals credentials at rest. The worker supplies the browser's own;
 * tests supply fakes.
 */
import * as Context from "effect/Context";

export class BrowserPlatform extends Context.Service<
  BrowserPlatform,
  {
    readonly fetch: typeof globalThis.fetch;
    readonly WebSocket: typeof globalThis.WebSocket;
    /** A non-extractable AES-GCM key, the same on every call for this browser profile. */
    readonly secretKey: () => Promise<CryptoKey>;
  }
>()("@otterware/browser-environment/BrowserPlatform") {}
