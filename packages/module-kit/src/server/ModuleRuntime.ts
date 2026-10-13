// @effect-diagnostics anyUnknownInErrorContext:off unsafeEffectTypeAssertion:off -- Modules arrive type-erased (ServerModule); their layers and handlers run in the context they declared, which the composition typechecks.
/**
 * Runs the modules of the active profile on this environment (ADR 0010). Each
 * module's layer is a scoped resource: turning the module on builds it in a
 * fresh scope and turning it off closes that scope, without restarting the
 * server. The on/off choice persists in `suite.sqlite`; a module whose layer
 * fails to build is `failed` until the user turns it on again.
 */
import { publishModuleAgentInstructions } from "../agent-instructions/index.ts";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as PubSub from "effect/PubSub";
import * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";
import * as SqlClient from "effect/sql/SqlClient";
import * as Stream from "effect/Stream";

import {
  ModuleNotInstalledError,
  ModuleStateError,
  type ModuleStateEntry,
} from "../contracts/moduleState.ts";
import {
  type HomeContributor,
  HomeContributors,
  type ServerModule,
} from "../engine/ServerModule.ts";
import { HostHomeContributors } from "./HostPorts.ts";
import { ModuleStateStore } from "./ModuleStateStore.ts";
import { SuiteSqlClient } from "./SuiteDatabase.ts";

/** A handler as `RpcGroup.of` or `Toolkit.toLayer` would receive it; the bridges retype it. */
export type ErasedHandler = (...args: Array<any>) => any;

/** What a running module exposes to the RPC and tool bridges. */
export interface OpenModule {
  readonly rpcHandlers: Readonly<Record<string, ErasedHandler>>;
  readonly toolHandlers: Readonly<Record<string, ErasedHandler>>;
  readonly homeContributor: HomeContributor | null;
  /** The module's services plus the host context, for running its handlers. */
  readonly context: Context.Context<never>;
}

export class ModuleRuntime extends Context.Service<
  ModuleRuntime,
  {
    readonly modules: ReadonlyArray<ServerModule>;
    readonly list: Effect.Effect<ReadonlyArray<ModuleStateEntry>>;
    readonly state: (id: string) => Effect.Effect<ModuleStateEntry, ModuleNotInstalledError>;
    /** Synchronous read for the MCP server's per-request tool visibility check. */
    readonly isOnSync: (id: string) => boolean;
    readonly setEnabled: (
      id: string,
      enabled: boolean,
    ) => Effect.Effect<ModuleStateEntry, ModuleNotInstalledError | ModuleStateError>;
    /** Every state change, after it took effect. */
    readonly changes: Stream.Stream<ModuleStateEntry>;
    readonly openModule: (id: string) => Effect.Effect<Option.Option<OpenModule>>;
    /** The agent instructions of every module that is on, joined; empty when none. */
    readonly agentInstructions: Effect.Effect<string>;
  }
>()("@otterware/module-kit/server/ModuleRuntime") {}

const MAX_FAILURE_CHARS = 200;

/** A bounded description of a start failure for `ModuleStateEntry.failure`. */
const describeFailure = (cause: Cause.Cause<unknown>): string => {
  const error = Cause.squash(cause);
  const text = error instanceof Error ? error.message : String(error);
  const flat = text.replaceAll(/\s+/g, " ").trim();
  return flat.length > MAX_FAILURE_CHARS ? `${flat.slice(0, MAX_FAILURE_CHARS - 1)}…` : flat;
};

interface Slot {
  entry: ModuleStateEntry;
  open: (OpenModule & { readonly scope: Scope.Closeable }) | null;
}

/**
 * Builds the runtime for `modules`. `R` names the host services module layers
 * and handlers need; the composition derives it from the modules it lists, so
 * a module whose layer needs a service nobody provides fails the typecheck.
 */
export const make = <R>(modules: ReadonlyArray<ServerModule>) =>
  Effect.gen(function* () {
    const store = yield* ModuleStateStore;
    const suiteSql = yield* SuiteSqlClient;
    const hostContributors = yield* Effect.serviceOption(HostHomeContributors);
    const hostContext = yield* Effect.context<R>();
    const runtimeScope = yield* Effect.scope;
    const transitions = yield* Semaphore.make(1);
    const changes = yield* PubSub.unbounded<ModuleStateEntry>();
    const slots = new Map<string, Slot>(
      modules.map((module) => [
        module.contract.id,
        { entry: { id: module.contract.id, state: "off" }, open: null },
      ]),
    );

    const moduleById = (id: string) => modules.find((module) => module.contract.id === id);

    const contributors: HomeContributors["Service"] = {
      current: Effect.sync(() => [
        ...Option.getOrElse(hostContributors, () => []),
        ...[...slots.values()].flatMap((slot) =>
          slot.open?.homeContributor ? [slot.open.homeContributor] : [],
        ),
      ]),
    };

    const agentInstructions = Effect.sync(() =>
      modules
        .filter((module) => slots.get(module.contract.id)?.entry.state === "on")
        .map((module) => module.agentInstructions?.trim() ?? "")
        .filter((text) => text.length > 0)
        .join("\n\n"),
    );

    // The base context every module builds in: the host's services, the suite
    // database as the plain SqlClient, and the live contributor list for Home.
    const baseContext = Context.add(
      Context.add(hostContext as Context.Context<never>, SqlClient.SqlClient, suiteSql),
      HomeContributors,
      contributors,
    );

    const announce = (entry: ModuleStateEntry) =>
      Effect.gen(function* () {
        slots.get(entry.id)!.entry = entry;
        publishModuleAgentInstructions(yield* agentInstructions);
        yield* PubSub.publish(changes, entry);
      });

    const start = (module: ServerModule) =>
      Effect.gen(function* () {
        const id = module.contract.id;
        const scope = yield* Scope.fork(runtimeScope);
        const build = Effect.gen(function* () {
          const services =
            module.layer === undefined
              ? Context.empty()
              : yield* Layer.buildWithScope(module.layer, scope);
          const context = Context.merge(baseContext, services);
          // The module declared what its handlers need; `context` carries it.
          const provided = <A, E, X>(effect: Effect.Effect<A, E, X>) =>
            Effect.provide(effect, context) as Effect.Effect<A, E>;
          const rpcHandlers =
            module.rpcHandlers === undefined ? {} : yield* provided(module.rpcHandlers);
          const toolHandlers =
            module.tools === undefined
              ? {}
              : Effect.isEffect(module.tools.handlers)
                ? yield* provided(module.tools.handlers)
                : module.tools.handlers;
          const homeContributor =
            module.homeContributor === undefined ? null : yield* provided(module.homeContributor);
          return {
            rpcHandlers: rpcHandlers as OpenModule["rpcHandlers"],
            toolHandlers: toolHandlers as OpenModule["toolHandlers"],
            homeContributor,
            context,
            scope,
          };
        }).pipe(Effect.provide(baseContext)) as unknown as Effect.Effect<
          OpenModule & { readonly scope: Scope.Closeable },
          unknown
        >;
        const exit = yield* Effect.exit(build);
        if (Exit.isFailure(exit)) {
          yield* Scope.close(scope, exit);
          yield* Effect.logError("Module failed to start", { module: id, cause: exit.cause });
          const entry: ModuleStateEntry = {
            id,
            state: "failed",
            failure: describeFailure(exit.cause),
          };
          yield* announce(entry);
          return entry;
        }
        slots.get(id)!.open = exit.value;
        const entry: ModuleStateEntry = { id, state: "on" };
        yield* announce(entry);
        yield* Effect.logInfo("Module started", { module: id });
        return entry;
      }).pipe(Effect.withSpan("ModuleRuntime.start"));

    const stop = (module: ServerModule) =>
      Effect.gen(function* () {
        const id = module.contract.id;
        const slot = slots.get(id)!;
        if (slot.open !== null) {
          const { scope } = slot.open;
          slot.open = null;
          yield* Scope.close(scope, Exit.succeed(undefined));
        }
        const entry: ModuleStateEntry = { id, state: "off" };
        yield* announce(entry);
        yield* Effect.logInfo("Module stopped", { module: id });
        return entry;
      }).pipe(Effect.withSpan("ModuleRuntime.stop"));

    const state = (id: string) =>
      Effect.suspend(() => {
        const slot = slots.get(id);
        return slot === undefined
          ? Effect.fail(new ModuleNotInstalledError({ module: id }))
          : Effect.succeed(slot.entry);
      });

    const setEnabled: ModuleRuntime["Service"]["setEnabled"] = (id, enabled) =>
      transitions.withPermits(1)(
        Effect.gen(function* () {
          const module = moduleById(id);
          if (module === undefined) return yield* new ModuleNotInstalledError({ module: id });
          const current = slots.get(id)!;
          yield* store
            .setEnabled(id, enabled)
            .pipe(
              Effect.mapError(
                (cause) => new ModuleStateError({ module: id, operation: "persist", cause }),
              ),
            );
          if (enabled && current.entry.state !== "on") return yield* start(module);
          if (!enabled && current.entry.state !== "off") return yield* stop(module);
          return current.entry;
        }),
      );

    // Startup: every module the user has not turned off, in profile order.
    const disabled = yield* store.disabled.pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning("Could not read module states; starting every module", { cause }).pipe(
          Effect.as(new Set<string>()),
        ),
      ),
    );
    yield* transitions.withPermits(1)(
      Effect.forEach(modules, (module) =>
        disabled.has(module.contract.id) ? Effect.void : Effect.asVoid(start(module)),
      ),
    );

    return Context.make(ModuleRuntime, {
      modules,
      list: Effect.sync(() => [...slots.values()].map((slot) => slot.entry)),
      state,
      isOnSync: (id) => slots.get(id)?.entry.state === "on",
      setEnabled,
      changes: Stream.fromPubSub(changes),
      openModule: (id) => Effect.sync(() => Option.fromNullishOr(slots.get(id)?.open)),
      agentInstructions,
    }).pipe(Context.add(HomeContributors, contributors));
  });

/** Starts the modules the user left on; closes every module with the server. */
export const layer = <R = never>(
  modules: ReadonlyArray<ServerModule>,
): Layer.Layer<ModuleRuntime | HomeContributors, never, R | SuiteSqlClient | ModuleStateStore> =>
  Layer.effectContext(make<R>(modules));
