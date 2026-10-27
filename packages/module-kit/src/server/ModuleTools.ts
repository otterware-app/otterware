// @effect-diagnostics anyUnknownInErrorContext:off unsafeEffectTypeAssertion:off -- Tool handlers arrive type-erased; the bridge provides their dependencies (the caller, module services) per call.
/**
 * `McpServer` cannot remove tools: `EnabledWhen` gates listing and calls by live
 * module state; `ModuleToolDispatch.ts` rechecks state and access per call.
 * State changes notify providers to refresh mid-turn when supported, otherwise
 * on their next turn (ADR 0010).
 */
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
// oxlint-disable-next-line t3code/no-raw-mcp-registration -- Module tools are gated by the bridge below (module state and access tier) instead of McpToolAccess, which lives in apps/server.
import { McpSchema, McpServer, type Tool, Toolkit } from "effect/ai";

import type { ModuleToolCallerScope } from "../engine/ServerModule.ts";
import { ModuleRuntime } from "./ModuleRuntime.ts";
import { moduleToolHandlers } from "./ModuleToolDispatch.ts";

export interface RegisterModuleToolsInput<R> {
  /** Who is calling, read from the MCP request; the host maps its invocation context. */
  readonly resolveCaller: Effect.Effect<ModuleToolCallerScope, never, R>;
}

/**
 * Registers every module's tools and keeps clients' tool lists in step with
 * module state. Runs inside the MCP server's layer graph, where `McpServer`
 * is the one instance the HTTP transport serves.
 */
export const registerModuleTools = Effect.fn("ModuleTools.register")(function* <R>(
  input: RegisterModuleToolsInput<R>,
) {
  const runtime = yield* ModuleRuntime;
  const server = yield* McpServer.McpServer;
  for (const module of runtime.modules) {
    if (module.tools === undefined) continue;
    const moduleId = module.contract.id;
    const tools = Object.values(module.tools.toolkit.tools as Record<string, Tool.Any>);
    const visible = tools.map((tool) =>
      tool.annotate(McpSchema.EnabledWhen, () => runtime.isOnSync(moduleId)),
    );
    const toolkit = Toolkit.make(...visible);
    const handlers = moduleToolHandlers(runtime, moduleId, tools, input.resolveCaller);
    // oxlint-disable-next-line t3code/no-raw-mcp-registration -- The bridge above gates each call by module state and access tier.
    const registration = McpServer.registerToolkit(toolkit).pipe(
      Effect.provide(toolkit.toLayer(handlers)),
    );
    yield* registration as Effect.Effect<void, never, McpServer.McpServer>;
  }
  yield* Stream.runForEach(runtime.changes, () =>
    server.notifications["notifications/tools/list_changed"]({}),
  ).pipe(Effect.forkScoped);
});
