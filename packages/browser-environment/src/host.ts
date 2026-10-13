/**
 * The in-browser environment's host, independent of where it runs: the
 * module runtime over `suite.sqlite` and the RPC handlers for its group.
 * The worker (`worker.ts`) provides SQLite on OPFS and the browser's
 * platform services; tests provide memory and Node's.
 */
import type { ServerModule } from "@otterware/module-kit/engine";
import { AssistantProjectError } from "@otterware/module-kit/contracts";
import {
  AssistantProjectHost,
  layerRpcHandlers,
  layerRuntime,
} from "@otterware/module-kit/runtime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Rpc from "effect/rpc/Rpc";
import type * as RpcGroup from "effect/rpc/RpcGroup";

/**
 * Assistant threads belong to an environment's assistant project (ADR 0004);
 * the browser has none. Its agent chat is the light loop (ADR 0009).
 */
export const layerNoAssistantProject = Layer.succeed(AssistantProjectHost, {
  ensure: Effect.fail(
    new AssistantProjectError({
      workspaceRoot: "",
      cause: "Assistant threads need an environment; this browser runs none.",
    }),
  ),
});

/**
 * Handlers for `group` (host RPCs and module bridges) over the module runtime.
 * `Requirements` names what the modules need from the browser, as the
 * composition derives it, so a missing platform service fails the typecheck.
 */
export const layerHost =
  <Requirements = never>() =>
  <R extends Rpc.Any>(group: RpcGroup.RpcGroup<R>, modules: ReadonlyArray<ServerModule>) =>
    layerRpcHandlers(group).pipe(
      Layer.provide(layerNoAssistantProject),
      Layer.provideMerge(layerRuntime<Requirements>(modules)),
    );
