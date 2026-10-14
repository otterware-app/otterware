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
import * as SubscriptionRef from "effect/SubscriptionRef";

import type { EnvironmentCatalogState } from "../state/connections.ts";

export type { BrowserEnvironmentClient } from "@otterware/browser-environment/client";

/**
 * `idle` until a page uses this browser; `elsewhere` while another tab of
 * this browser profile runs it (one tab owns its databases at a time; this
 * tab takes over when that one closes); then `starting` and `running`.
 */
export type BrowserEnvironmentStatus = "idle" | "elsewhere" | "starting" | "running";

export class BrowserEnvironment extends Context.Service<
  BrowserEnvironment,
  {
    /**
     * The worker's typed RPC client; the worker starts on first use, once
     * this tab holds the environment, and lives as long as the layer. This
     * browser is the user's own, so its RPCs carry no environment grants.
     */
    readonly connection: Effect.Effect<BrowserEnvironmentClient>;
    readonly status: SubscriptionRef.SubscriptionRef<BrowserEnvironmentStatus>;
  }
>()("@t3tools/client-runtime/otterware/browserEnvironment") {}

/**
 * Holds this browser profile's environment for the tab: resolves once held,
 * calling `waiting` first if another tab holds it. The returned function
 * releases it.
 */
export type EnvironmentLock = (waiting: () => void) => Promise<() => void>;

const LOCK_NAME = "otterware-browser-environment";

/** Web Locks, which every current browser has; without them, no coordination. */
const webLock: EnvironmentLock = (waiting) =>
  new Promise((resolve) => {
    const locks = (globalThis.navigator as Navigator | undefined)?.locks;
    if (locks === undefined) return resolve(() => {});
    let release!: () => void;
    const held = new Promise<void>((done) => (release = done));
    const hold = () => {
      resolve(release);
      return held;
    };
    void locks.request(LOCK_NAME, { ifAvailable: true }, (lock) => {
      if (lock !== null) return hold();
      waiting();
      // Queued: granted when the other tab closes or lets go.
      void locks.request(LOCK_NAME, hold);
      return undefined;
    });
  });

/**
 * The in-browser environment for this page. `spawn` defaults to the worker
 * the browser-environment package ships; tests pass a message port and a
 * lock of their own.
 */
export const layer = (spawn?: () => Worker | MessagePort, lock: EnvironmentLock = webLock) =>
  Layer.effect(
    BrowserEnvironment,
    Effect.gen(function* () {
      const scope = yield* Effect.scope;
      const status = yield* SubscriptionRef.make<BrowserEnvironmentStatus>("idle");
      const connection = yield* Effect.cached(
        Effect.gen(function* () {
          const release = yield* Effect.promise(() =>
            lock(() => Effect.runSync(SubscriptionRef.set(status, "elsewhere"))),
          );
          yield* Scope.addFinalizer(scope, Effect.sync(release));
          yield* SubscriptionRef.set(status, "starting");
          const protocol = yield* Layer.build(layerProtocol(spawn));
          const client = yield* makeBrowserEnvironmentClient.pipe(Effect.provide(protocol));
          yield* SubscriptionRef.set(status, "running");
          return client;
        }).pipe(Effect.provideService(Scope.Scope, scope), Effect.orDie),
      );
      return BrowserEnvironment.of({ connection, status });
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
