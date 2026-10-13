// @effect-diagnostics anyUnknownInErrorContext:off -- A ServerModule erases its layer and handler types so one registry can hold every module; the composition recovers the precise types through ServerModuleRequirements.
/**
 * What a module hands the server. A module's engine exports one
 * `ServerModule` built with `defineServerModule`; the composition package
 * lists it for the profiles that include the module. Everything here is
 * portable (ADR 0008): the host provides `SqlClient` (suite.sqlite), the
 * module's own services come from `layer`.
 */
import type { AuthMcpClientAccess, EnvironmentId, ThreadId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Layer from "effect/Layer";
import type * as Rpc from "effect/rpc/Rpc";
import type * as RpcGroup from "effect/rpc/RpcGroup";
import type * as SqlClient from "effect/sql/SqlClient";
import type { SqlError } from "effect/sql/SqlError";
import type * as Tool from "effect/ai/Tool";
import type * as Toolkit from "effect/ai/Toolkit";

import type {
  HomeActionError,
  HomeAgentActivity,
  HomeItem,
  TodayEvent,
} from "../contracts/home.ts";
import type { AnyModuleContract, ModuleContract } from "../contracts/contract.ts";
import type { ModuleSettingsDefinition } from "../contracts/settings.ts";

/**
 * One migration of `suite.sqlite`. Ids are per module and never renumbered
 * once shipped; the runner applies pending ones in (module, id) order before
 * any module starts, whether the module is on or off.
 */
export interface SuiteMigration {
  readonly module: string;
  /** Positive, unique within the module. */
  readonly id: number;
  readonly name: string;
  readonly run: Effect.Effect<void, SqlError, SqlClient.SqlClient>;
}

/**
 * Feeds Home. Home calls it on every overview (clients poll while Home is
 * open), so reads must be cheap: serve from the module's own tables or a
 * short cache, never a network call.
 */
export interface HomeContributor {
  readonly module: string;
  /** Items that currently need the user, newest or most urgent first. Handles its own failures. */
  readonly needsYou: Effect.Effect<ReadonlyArray<HomeItem>>;
  /** Today's events for Home's calendar strip. Handles its own failures. */
  readonly today?: Effect.Effect<ReadonlyArray<TodayEvent>>;
  readonly performAction?: (
    itemId: string,
    actionId: string,
  ) => Effect.Effect<void, HomeActionError>;
  /** The agent runtime's contributor only. Handles its own failures. */
  readonly activity?: Effect.Effect<HomeAgentActivity>;
}

/** Every contributor Home can read right now: the host's plus those of modules that are on. */
export class HomeContributors extends Context.Service<
  HomeContributors,
  { readonly current: Effect.Effect<ReadonlyArray<HomeContributor>> }
>()("@otterware/module-kit/engine/ServerModule/HomeContributors") {}

/**
 * Who called a module tool, provided to every tool handler by the host. A
 * thread caller is an agent running inside a T3 thread; a client caller is an
 * outside MCP client with the access it was approved for.
 */
export interface ModuleToolCallerScope {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId | null;
  /** `read-only` callers reach only read-only tools; `full` ones every tier. */
  readonly access: AuthMcpClientAccess;
}

export class ModuleToolCaller extends Context.Service<ModuleToolCaller, ModuleToolCallerScope>()(
  "@otterware/module-kit/engine/ServerModule/ModuleToolCaller",
) {}

/** A handler record with its parameter types erased; authors type theirs with `satisfies`. */
export type ErasedHandlers = Readonly<Record<string, (...args: Array<any>) => any>>;

export interface ModuleTools<Tools extends Record<string, Tool.Any>, E, R> {
  readonly toolkit: Toolkit.Toolkit<Tools>;
  /** Built when the module starts, in its services' context. */
  readonly handlers: ErasedHandlers | Effect.Effect<ErasedHandlers, E, R>;
}

export interface ServerModule {
  readonly contract: AnyModuleContract;
  /** Applied to `suite.sqlite` before any module starts. */
  readonly migrations: ReadonlyArray<SuiteMigration>;
  /**
   * The module's services. Opened in a scope when the module turns on and
   * closed when it turns off (ADR 0010), so background work must live in this
   * scope. `SqlClient` here is `suite.sqlite`.
   */
  readonly layer?: Layer.Layer<any, unknown, any>;
  /**
   * Handlers for the contract's group, built in the module's context when it
   * starts; `contract.group.of({...})` types them. The host answers
   * `ModuleOffError` while the module is off.
   */
  readonly rpcHandlers?: Effect.Effect<ErasedHandlers, unknown, any>;
  /** Agent tools, offered through the environment's MCP server while the module is on. */
  readonly tools?: ModuleTools<any, unknown, any>;
  /** Appended to every provider's runtime instructions while the module is on. */
  readonly agentInstructions?: string;
  /** Built in the module's context when it starts. */
  readonly homeContributor?: Effect.Effect<HomeContributor, never, any>;
  readonly settings?: ModuleSettingsDefinition;
}

/** Keeps a module's precise types so the composition can check what its layers need. */
export const defineServerModule = <const M extends ServerModule>(module: M): M => module;

/** Handlers typed for one contract's group, for `rpcHandlers`. */
export type ModuleRpcHandlers<C extends ModuleContract<string, Rpc.Any>> =
  C extends ModuleContract<string, infer R> ? RpcGroup.HandlersFrom<R> : never;

type FieldOf<M, K extends PropertyKey> = M extends unknown
  ? K extends keyof M
    ? Exclude<M[K], undefined>
    : never
  : never;

/** The services a module's layer provides. */
export type ServerModuleServices<M extends ServerModule> = Layer.Success<FieldOf<M, "layer">>;

/**
 * What the host must provide for a module: its layer's and handlers' needs,
 * minus what the module's own layer and module-kit supply.
 */
export type ServerModuleRequirements<M extends ServerModule> = Exclude<
  | Layer.Services<FieldOf<M, "layer">>
  | Effect.Services<FieldOf<M, "rpcHandlers">>
  | Effect.Services<FieldOf<M, "homeContributor">>
  | (FieldOf<M, "tools"> extends ModuleTools<any, any, infer R> ? R : never),
  ServerModuleServices<M> | ModuleToolCaller | HomeContributors | SqlClient.SqlClient
>;
