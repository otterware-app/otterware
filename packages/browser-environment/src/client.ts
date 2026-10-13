/**
 * The page's side of the in-browser environment: spawns its worker and
 * speaks the environment's RPC groups to it through Effect's worker protocol
 * (structured clone over the worker's message port, no WebSocket).
 */
import * as BrowserWorker from "@effect/platform-browser/BrowserWorker";
import type * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as RpcClient from "effect/rpc/RpcClient";

import { BrowserEnvironmentRpcGroup } from "./contracts.ts";

/** One worker per page: it owns this browser profile's databases. */
export const spawnBrowserEnvironmentWorker = (): Worker =>
  new Worker(new URL("./worker.ts", import.meta.url), {
    type: "module",
    name: "otterware-browser-environment",
  });

/**
 * The client protocol over `spawn`'s worker or port. One worker serves every
 * request at once: a request holds its worker until it ends, and
 * subscriptions never end, so the per-worker limit must not be the pool's
 * default of one.
 */
export const layerProtocol = (spawn: () => Worker | MessagePort = spawnBrowserEnvironmentWorker) =>
  RpcClient.layerProtocolWorker({ size: 1, concurrency: 1_000_000 }).pipe(
    Layer.provide(BrowserWorker.layer(spawn)),
  );

export const makeBrowserEnvironmentClient = RpcClient.make(BrowserEnvironmentRpcGroup);

export type BrowserEnvironmentClient = Effect.Success<typeof makeBrowserEnvironmentClient>;
