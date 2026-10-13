/**
 * The browser APIs the worker's host services reach the network with. The
 * worker supplies the global ones; tests supply fakes.
 */
import * as Context from "effect/Context";

export class BrowserPlatform extends Context.Service<
  BrowserPlatform,
  {
    readonly fetch: typeof globalThis.fetch;
    readonly WebSocket: typeof globalThis.WebSocket;
  }
>()("@otterware/browser-environment/BrowserPlatform") {}
