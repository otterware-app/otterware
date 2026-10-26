// @effect-diagnostics anyUnknownInErrorContext:off unsafeEffectTypeAssertion:off -- Tool handlers arrive type-erased; the bridge provides their dependencies (the caller, module services) per call.
/**
 * The gate every module tool call passes, whoever asks: the environment's MCP
 * server (`ModuleTools.ts`) and the in-browser environment's agent loop
 * (ADR 0009) both dispatch through these bridges, so module state and access
 * tiers mean the same everywhere. Portable: no MCP transport, no Node.
 */
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as AiError from "effect/ai/AiError";
import * as Tool from "effect/ai/Tool";
import * as Toolkit from "effect/ai/Toolkit";

import { ModuleToolRefusedError, toolTier } from "../contracts/tools.ts";
import { ModuleToolCaller, type ModuleToolCallerScope } from "../engine/ServerModule.ts";
import { type ErasedHandler, ModuleRuntime } from "./ModuleRuntime.ts";

/** Why a caller with `access` may not run `tool`, or null when it may. */
export const refusal = (access: ModuleToolCallerScope["access"], tool: Tool.Any) => {
  const tier = toolTier(tool);
  if (tier === "read-only") return null;
  if (access === "read-only") return "read-only-caller" as const;
  if (tier === "full" && access !== "full-access") return "full-access-required" as const;
  return null;
};

const bridge =
  <R>(
    runtime: ModuleRuntime["Service"],
    moduleId: string,
    tool: Tool.Any,
    resolveCaller: Effect.Effect<ModuleToolCallerScope, never, R>,
  ): ErasedHandler =>
  (params, toolContext) =>
    Effect.gen(function* () {
      const open = yield* runtime.openModule(moduleId);
      if (Option.isNone(open)) {
        return yield* new ModuleToolRefusedError({
          module: moduleId,
          tool: tool.name,
          reason: "module-off",
        });
      }
      const caller = yield* resolveCaller;
      const reason = refusal(caller.access, tool);
      if (reason !== null) {
        return yield* new ModuleToolRefusedError({ module: moduleId, tool: tool.name, reason });
      }
      const handler = open.value.toolHandlers[tool.name];
      if (handler === undefined) return yield* Effect.die(`No handler for ${tool.name}`);
      return yield* Effect.provide(
        handler(params, toolContext) as Effect.Effect<unknown, unknown, never>,
        Context.add(open.value.context, ModuleToolCaller, caller),
      );
    });

/** One gated handler per tool of `moduleId`, keyed by tool name, for `toolkit.toLayer`. */
export const moduleToolHandlers = <R>(
  runtime: ModuleRuntime["Service"],
  moduleId: string,
  tools: ReadonlyArray<Tool.Any>,
  resolveCaller: Effect.Effect<ModuleToolCallerScope, never, R>,
): Readonly<Record<string, ErasedHandler>> =>
  Object.fromEntries(
    tools.map((tool) => [tool.name, bridge(runtime, moduleId, tool, resolveCaller)]),
  );

const currentCaller = Effect.service(ModuleToolCaller);

/** A module tool as an agent loop lists it. */
export interface ModuleToolDescriptor {
  readonly module: string;
  readonly tool: Tool.Any;
}

/** One finished tool call, as the agent reads it. */
export interface ModuleToolOutcome {
  /** The encoded result as JSON, or why the call failed. */
  readonly text: string;
  readonly isError: boolean;
}

const INTERNAL_FAILURE = "The tool failed with an internal error.";

const encodeJson = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));

/** An encoded tool result as the JSON text the agent reads. */
const jsonText = (value: unknown) =>
  value === undefined
    ? Effect.succeed("")
    : encodeJson(value).pipe(Effect.orElseSucceed(() => String(value)));

/** A tool's declared failures, compiled once per tool. */
const failureCodec = (tool: Tool.Any) => ({
  isDeclared: Schema.is(tool.failureSchema),
  encode: Schema.encodeUnknownEffect(tool.failureSchema),
});

/**
 * What an agent reads when a call fails, as the MCP server words it: the
 * message of a declared failure (a refusal says why), the reason parameters
 * did not decode, or a scrubbed internal error.
 */
const describeFailure = Effect.fn("ModuleToolDispatch.describeFailure")(function* (
  tool: Tool.Any,
  codec: ReturnType<typeof failureCodec>,
  cause: Cause.Cause<unknown>,
) {
  const failure = Cause.findErrorOption(cause);
  if (Option.isSome(failure) && !Cause.hasDies(cause)) {
    const error = failure.value;
    if (AiError.isAiError(error) && error.reason._tag === "ToolParameterValidationError")
      return `Invalid arguments for ${tool.name}: ${error.reason.description}`;
    if (codec.isDeclared(error)) {
      if (error instanceof Error && error.message !== "") return error.message;
      const encoded = yield* Effect.option(codec.encode(error));
      if (Option.isSome(encoded)) return yield* jsonText(encoded.value);
    }
  }
  yield* Effect.logError("Module tool failed", { tool: tool.name, cause });
  return INTERNAL_FAILURE;
});

/**
 * Every module tool, callable by name with encoded parameters and an explicit
 * caller, for agent loops that are not an MCP server. Calls pass the same gate
 * as MCP calls (module state, then tier against `caller.access`).
 */
export const makeModuleToolDispatcher = Effect.gen(function* () {
  const runtime = yield* ModuleRuntime;
  const entries = new Map<
    string,
    {
      readonly module: string;
      readonly tool: Tool.Any;
      readonly toolkit: Toolkit.Any;
      readonly failure: ReturnType<typeof failureCodec>;
    }
  >();
  const kits: Array<{ readonly toolkit: Toolkit.Any; readonly handlers: object }> = [];
  for (const module of runtime.modules) {
    if (module.tools === undefined) continue;
    const moduleId = module.contract.id;
    const tools = Object.values(module.tools.toolkit.tools as Record<string, Tool.Any>);
    const toolkit = Toolkit.make(...tools);
    const handlers = moduleToolHandlers(runtime, moduleId, tools, currentCaller);
    kits.push({ toolkit, handlers });
    for (const tool of tools)
      entries.set(tool.name, { module: moduleId, tool, toolkit, failure: failureCodec(tool) });
  }
  const built = new Map<Toolkit.Any, Toolkit.WithHandler<Record<string, Tool.Any>>>();
  for (const { toolkit, handlers } of kits) {
    const withHandler = yield* (toolkit as Toolkit.Toolkit<Record<string, Tool.Any>>).pipe(
      Effect.provide(
        (toolkit as Toolkit.Toolkit<Record<string, Tool.Any>>).toLayer(handlers as never),
      ),
    );
    built.set(toolkit, withHandler as Toolkit.WithHandler<Record<string, Tool.Any>>);
  }

  const tools: ReadonlyArray<ModuleToolDescriptor> = [...entries.values()].map(
    ({ module, tool }) => ({ module, tool }),
  );

  /** Tools whose module is on and whose tier `access` may run. */
  const available = (access: ModuleToolCallerScope["access"]) =>
    tools.filter(({ module, tool }) => runtime.isOnSync(module) && refusal(access, tool) === null);

  const call = (name: string, params: unknown, caller: ModuleToolCallerScope) => {
    const entry = entries.get(name);
    if (entry === undefined)
      return Effect.succeed<ModuleToolOutcome>({ text: `Unknown tool: ${name}`, isError: true });
    const kit = built.get(entry.toolkit)!;
    return kit
      .handle(name, params as never, undefined, { onExcessProperty: "ignore", errors: "all" })
      .pipe(
        Stream.unwrap,
        Stream.runLast,
        Effect.flatMap(Effect.fromOption),
        Effect.map((result): ModuleToolOutcome => ({
          text: result.encodedResult === undefined ? "" : JSON.stringify(result.encodedResult),
          isError: result.isFailure,
        })),
        Effect.catchCause((cause) =>
          Effect.map(
            describeFailure(entry.tool, entry.failure, cause),
            (text): ModuleToolOutcome => ({
              text,
              isError: true,
            }),
          ),
        ),
        Effect.provideService(ModuleToolCaller, caller),
      ) as Effect.Effect<ModuleToolOutcome>;
  };

  return { tools, available, call };
});

export type ModuleToolDispatcher = Effect.Success<typeof makeModuleToolDispatcher>;
