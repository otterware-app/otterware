import { accountHandlers } from "./AccountRpc.ts";
// @effect-diagnostics anyUnknownInErrorContext:off unsafeEffectTypeAssertion:off -- Bridges forward type-erased module handlers; the merged group and the contracts it was built from share one type.
/**
 * The host's RPC handlers: the `modules.*` and `assistant.*` methods, and one
 * bridge per module method that dispatches into the running module or answers
 * `ModuleOffError`. The merged group stays static (the WebSocket server is
 * built once per connection); only the dispatch target changes.
 */
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as Rpc from "effect/rpc/Rpc";
import type * as RpcGroup from "effect/rpc/RpcGroup";
import * as RpcSchema from "effect/rpc/RpcSchema";
import * as Stream from "effect/Stream";

import { HOST_METHODS, HostRpcGroup } from "../contracts/host.ts";
import { ModuleOffError } from "../contracts/moduleState.ts";
import { AssistantProjectHost } from "./HostPorts.ts";
import { type ErasedHandler, ModuleRuntime } from "./ModuleRuntime.ts";

const hostHandlers = Effect.gen(function* () {
  const runtime = yield* ModuleRuntime;
  const assistant = yield* AssistantProjectHost;
  return HostRpcGroup.of({
    ...(yield* accountHandlers),
    [HOST_METHODS.modulesList]: () => Effect.map(runtime.list, (modules) => ({ modules })),
    [HOST_METHODS.modulesSetEnabled]: ({ id, enabled }) => runtime.setEnabled(id, enabled),
    [HOST_METHODS.assistantEnsureProject]: () => assistant.ensure,
  });
});

/** The bridge for one module method; `stream` RPCs get a stream that fails the same way. */
const bridge =
  (
    runtime: ModuleRuntime["Service"],
    moduleId: string,
    tag: string,
    stream: boolean,
  ): ErasedHandler =>
  (payload, options) => {
    const dispatch = Effect.gen(function* () {
      const open = yield* runtime.openModule(moduleId);
      if (Option.isNone(open)) {
        const entry = yield* runtime.state(moduleId).pipe(Effect.orDie);
        return yield* new ModuleOffError({ module: moduleId, state: entry.state });
      }
      const handler = open.value.rpcHandlers[tag];
      if (handler === undefined) return yield* Effect.die(`No handler for ${tag}`);
      return { result: handler(payload, options) as unknown, context: open.value.context };
    });
    if (stream) {
      return Stream.unwrap(
        Effect.map(dispatch, ({ result, context }) =>
          Stream.provideContext(result as Stream.Stream<unknown, unknown, never>, context),
        ),
      );
    }
    return Effect.flatMap(dispatch, ({ result, context }) =>
      Effect.provide(result as Effect.Effect<unknown, unknown, never>, context),
    );
  };

/**
 * Handlers for `group`, the merge of `HostRpcGroup` and every module contract
 * in the composition: the host's own, plus a bridge per module method.
 */
export const layerRpcHandlers = <R extends Rpc.Any>(
  group: RpcGroup.RpcGroup<R>,
): Layer.Layer<Rpc.ToHandler<R>, never, ModuleRuntime | AssistantProjectHost> =>
  group.toLayer(
    Effect.gen(function* () {
      const runtime = yield* ModuleRuntime;
      const handlers: Record<string, ErasedHandler> = { ...(yield* hostHandlers) };
      for (const module of runtime.modules) {
        for (const [tag, rpc] of module.contract.group.requests) {
          handlers[tag] = bridge(
            runtime,
            module.contract.id,
            tag,
            RpcSchema.isStreamSchema((rpc as Rpc.AnyWithProps).successSchema),
          );
        }
      }
      // The record covers exactly the groups `group` was merged from.
      return handlers as RpcGroup.HandlersFrom<R>;
    }),
  ) as Layer.Layer<Rpc.ToHandler<R>, never, ModuleRuntime | AssistantProjectHost>;
