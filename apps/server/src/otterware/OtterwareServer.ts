/**
 * Where the module runtime joins the upstream server. The upstream files each
 * change by a line or two (see `scripts/otterware/upstream-seams.txt`):
 *
 * - `layer` joins the runtime dependencies in `server.ts`, after
 *   `guardStateDir` took the data home's writer lock.
 * - `layerRpcHandlers` joins each WebSocket connection's handlers in `ws.ts`.
 * - `layerMcpToolkits` joins the MCP toolkits in `mcp/McpHttpServer.ts`.
 *
 * Without `ModuleRuntime` in context (tests that build those graphs alone)
 * the two hooks contribute nothing.
 */
import { OtterwareWsRpcGroup } from "@otterware/composition/contracts";
import * as CalendarAccountCredential from "./CalendarAccountCredential.ts";
import * as Composition from "@otterware/composition/server";
import type { ModuleToolCallerScope } from "@otterware/module-kit/engine";
import { ModuleRuntime, StateDirGuard } from "@otterware/module-kit/server";
import * as NetService from "@t3tools/shared/Net";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as Rpc from "effect/rpc/Rpc";
import type * as RpcGroup from "effect/rpc/RpcGroup";
import type * as Scope from "effect/Scope";
import type { McpServer } from "effect/ai";

import * as ServerConfig from "../config.ts";
import * as McpInvocationContext from "../mcp/McpInvocationContext.ts";
import { RpcInstrumentation } from "../observability/RpcInstrumentation.ts";
import { isProcessAlive, readPersistedServerRuntimeState } from "../serverRuntimeState.ts";
import * as AssistantProject from "./AssistantProject.ts";
import * as CodeHomeContributor from "./CodeHomeContributor.ts";

/**
 * Refuses to start while another live server owns the data home, then holds
 * its writer lock until the server's scope closes (ADR 0012).
 */
export const guardStateDir = Effect.fn("OtterwareServer.guardStateDir")(function* (
  config: Pick<ServerConfig.ServerConfig["Service"], "stateDir" | "serverRuntimeStatePath">,
) {
  const net = yield* NetService.NetService;
  const fileSystem = yield* Effect.context<FileSystem.FileSystem>();
  yield* StateDirGuard.ensureSoleWriter({
    stateDir: config.stateDir,
    readRecordedServer: readPersistedServerRuntimeState(config.serverRuntimeStatePath).pipe(
      Effect.map(Option.map(({ pid, port, origin }) => ({ pid, port, origin }))),
      Effect.orElseSucceed(() => Option.none()),
      Effect.provide(fileSystem),
    ),
    isProcessAlive,
    hasListenerOnHost: net.hasListenerOnHost,
    ownPid: process.pid,
  });
  yield* StateDirGuard.acquireWriterLock({ stateDir: config.stateDir });
});

/** The WebSocket group the server serves: upstream's plus the host and module RPCs. */
export const ServerRpcGroup = OtterwareWsRpcGroup.middleware(RpcInstrumentation);

type OtterwareRpcs = RpcGroup.Rpcs<typeof Composition.OtterwareRpcGroup>;

/** The host and module RPC handlers, built once per server with the runtime in context. */
class HostRpcHandlers extends Context.Service<
  HostRpcHandlers,
  Context.Context<Rpc.ToHandler<OtterwareRpcs>>
>()("t3/otterware/OtterwareServer/HostRpcHandlers") {}

const layerHostRpcHandlers = Layer.effect(
  HostRpcHandlers,
  Layer.build(Composition.layerRpcHandlers()),
);

/** Opens `suite.sqlite`, runs migrations, and starts the modules the user left on. */
export const layer = layerHostRpcHandlers.pipe(
  Layer.provideMerge(
    Layer.unwrap(
      Effect.map(ServerConfig.ServerConfig, (config) => Composition.layer(config.stateDir)),
    ),
  ),
  Layer.provide(CalendarAccountCredential.layer),
  Layer.provide(CodeHomeContributor.layerHostContributors),
  Layer.provideMerge(AssistantProject.layer),
);

const readRuntime = Effect.serviceOption(ModuleRuntime.ModuleRuntime);

/** Every host and module RPC's handler, for `RpcServer.make(ServerRpcGroup)` in `ws.ts`. */
export const layerRpcHandlers: Layer.Layer<Rpc.ToHandler<OtterwareRpcs>> = Layer.unwrap(
  Effect.map(
    Effect.serviceOption(HostRpcHandlers),
    Option.match({
      onNone: () => Layer.empty,
      onSome: (handlers) => Layer.succeedContext(handlers),
    }),
  ),
) as Layer.Layer<Rpc.ToHandler<OtterwareRpcs>>;

/** Who is calling a module tool, from the MCP request's invocation context. */
const resolveCaller: Effect.Effect<
  ModuleToolCallerScope,
  never,
  McpInvocationContext.McpInvocationContext
> = Effect.map(McpInvocationContext.McpInvocationContext, (scope) => ({
  environmentId: scope.environmentId,
  threadId: scope.thread?.threadId ?? null,
  // A thread caller acts for its user; an outside client has the access it was approved for.
  access: scope.client?.access ?? "full-access",
}));

/**
 * Every module's tools, registered beside the upstream toolkits; `McpServer`
 * comes from the transport layer `McpHttpServer` provides under the merge.
 */
export const layerMcpToolkits: Layer.Layer<never, never, McpServer.McpServer> = Layer.unwrap(
  Effect.map(
    readRuntime,
    Option.match({
      onNone: () => Layer.empty,
      onSome: (runtime) =>
        Layer.effectDiscard(
          // The authenticated transport provides the invocation context per request, never at registration.
          Composition.registerModuleTools({ resolveCaller }).pipe(
            Effect.provideService(ModuleRuntime.ModuleRuntime, runtime),
          ) as Effect.Effect<void, never, McpServer.McpServer | Scope.Scope>,
        ),
    }),
  ),
);
