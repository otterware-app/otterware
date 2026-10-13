/**
 * "This browser": the in-browser environment as a connection kind (ADR 0008).
 * It is not a T3 environment: no projects, threads or projections, only the
 * host and module RPC groups, the browser's Otter Account and its light agent
 * loop, served by a Web Worker over a message port instead of a WebSocket.
 * Module pages talk to a paired environment when there is one and to this
 * browser otherwise (`selectModuleTarget`).
 */
import {
  type BrowserEnvironmentClient,
  layerProtocol,
  makeBrowserEnvironmentClient,
} from "@otterware/browser-environment/client";
import type { EnvironmentId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Scope from "effect/Scope";

import type { EnvironmentCatalogState } from "../state/connections.ts";

export type { BrowserEnvironmentClient } from "@otterware/browser-environment/client";

export class BrowserEnvironment extends Context.Service<
  BrowserEnvironment,
  {
    /**
     * The worker's typed RPC client; the worker starts on first use and lives
     * as long as the layer. This browser is the user's own, so its RPCs carry
     * no environment grants to check.
     */
    readonly connection: Effect.Effect<BrowserEnvironmentClient>;
  }
>()("@t3tools/client-runtime/otterware/browserEnvironment") {}

/**
 * The in-browser environment for this page. `spawn` defaults to the worker
 * the browser-environment package ships; tests pass a message port.
 */
export const layer = (spawn?: () => Worker | MessagePort) =>
  Layer.effect(
    BrowserEnvironment,
    Effect.gen(function* () {
      const scope = yield* Effect.scope;
      const connection = yield* Effect.cached(
        Effect.gen(function* () {
          const protocol = yield* Layer.build(layerProtocol(spawn));
          return yield* makeBrowserEnvironmentClient.pipe(Effect.provide(protocol));
        }).pipe(Effect.provideService(Scope.Scope, scope), Effect.orDie),
      );
      return BrowserEnvironment.of({ connection });
    }),
  );

/** Where module pages send their RPCs. */
export type ModuleTarget =
  | { readonly _tag: "environment"; readonly environmentId: EnvironmentId }
  | { readonly _tag: "browser" }
  /** The saved connections are not loaded yet; decide nothing. */
  | { readonly _tag: "pending" };

const PENDING: ModuleTarget = { _tag: "pending" };
const BROWSER: ModuleTarget = { _tag: "browser" };

/**
 * A paired environment when there is one (the one serving this page first),
 * otherwise this browser: web profiles start on "this browser" and move to a
 * real environment as soon as one is added.
 */
export function selectModuleTarget(catalog: EnvironmentCatalogState): ModuleTarget {
  if (!catalog.isReady) return PENDING;
  let first: EnvironmentId | null = null;
  for (const [environmentId, entry] of catalog.entries) {
    if (!entry.enabled) continue;
    if (entry.target._tag === "PrimaryConnectionTarget")
      return { _tag: "environment", environmentId };
    first ??= environmentId;
  }
  return first === null ? BROWSER : { _tag: "environment", environmentId: first };
}
