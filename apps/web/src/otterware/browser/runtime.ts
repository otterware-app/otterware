/**
 * "This browser" for the web app (ADR 0008): the in-browser environment's
 * worker, started the first time a module page uses it, and where module
 * pages should send their RPCs (`moduleTargetAtom`).
 */
import { useAtomValue } from "@effect/atom-react";
import {
  BrowserEnvironment,
  layer as layerBrowserEnvironment,
  selectModuleTarget,
  type ModuleTarget,
} from "@t3tools/client-runtime/otterware/browser-environment";
import * as Effect from "effect/Effect";
import { Atom, AtomRegistry } from "effect/reactivity";

import { environmentCatalog } from "../../connection/catalog";
import { appAtomRegistry } from "../../rpc/atomRegistry";

/** One worker per page, kept for the page's life once started. */
export const browserAtomRuntime = Atom.runtime(layerBrowserEnvironment()).pipe(Atom.keepAlive);

/** A paired environment when there is one, otherwise this browser. */
export const moduleTargetAtom = Atom.make((get): ModuleTarget =>
  selectModuleTarget(get(environmentCatalog.catalogValueAtom)),
).pipe(Atom.withLabel("otterware-module-target"));

export function useModuleTarget(): ModuleTarget {
  return useAtomValue(moduleTargetAtom);
}

/** Runs `effect` against this browser's environment, starting its worker if needed. */
export const runInBrowser = <A, E>(
  effect: Effect.Effect<A, E, BrowserEnvironment>,
  signal?: AbortSignal,
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* AtomRegistry.mount(appAtomRegistry, browserAtomRuntime);
        const context = yield* AtomRegistry.getResult(appAtomRegistry, browserAtomRuntime);
        return yield* effect.pipe(Effect.provide(context));
      }),
    ),
    signal ? { signal } : undefined,
  );

/** The worker's typed client, for one call. */
export const browserClient = Effect.gen(function* () {
  const environment = yield* BrowserEnvironment;
  return yield* environment.connection;
});
