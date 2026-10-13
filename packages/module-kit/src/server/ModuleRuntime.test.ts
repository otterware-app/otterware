// @effect-diagnostics anyUnknownInErrorContext:off -- The test calls type-erased handler bridges the way the WebSocket server does.
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { AuthOrchestrationReadScope } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import * as Stream from "effect/Stream";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";

import { defineModuleContract, moduleRpcErrors } from "../contracts/contract.ts";
import { HostRpcGroup } from "../contracts/host.ts";
import { ModuleOffError } from "../contracts/moduleState.ts";
import { defineServerModule, HomeContributors } from "../engine/ServerModule.ts";
import * as HostLayer from "./HostLayer.ts";
import { AssistantProjectHost } from "./HostPorts.ts";
import { layerRpcHandlers } from "./ModuleRpc.ts";
import * as ModuleRuntime from "./ModuleRuntime.ts";
import * as SuiteDatabase from "./SuiteDatabase.ts";
import { moduleAgentInstructions } from "../agent-instructions/index.ts";

// A module with one table, one RPC and one Home contributor.
const PingContract = defineModuleContract({
  id: "ping",
  group: RpcGroup.make(
    Rpc.make("ping.count", {
      payload: Schema.Struct({}),
      success: Schema.Struct({ count: Schema.Int }),
      error: moduleRpcErrors(),
    }),
  ),
  scopes: { "ping.count": AuthOrchestrationReadScope },
});

class PingCounter extends Context.Service<PingCounter, { readonly count: Effect.Effect<number> }>()(
  "@otterware/module-kit/server/ModuleRuntime.test/PingCounter",
) {}

/** Counts how often the layer was opened, so on/off can be observed. */
const opened = { count: 0, closed: 0 };

const PingModule = defineServerModule({
  contract: PingContract,
  migrations: [
    {
      module: "ping",
      id: 1,
      name: "ping_counts",
      run: Effect.flatMap(
        SqlClient.SqlClient,
        (sql) => sql`CREATE TABLE ping_counts (id INTEGER PRIMARY KEY, n INTEGER NOT NULL)`,
      ),
    },
  ],
  layer: Layer.effect(
    PingCounter,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      opened.count += 1;
      yield* Effect.addFinalizer(() => Effect.sync(() => void (opened.closed += 1)));
      return PingCounter.of({
        count: sql<{ readonly n: number }>`SELECT COUNT(*) AS n FROM ping_counts`.pipe(
          Effect.map((rows) => rows[0]?.n ?? 0),
          Effect.orDie,
        ),
      });
    }),
  ),
  rpcHandlers: Effect.map(PingCounter, (counter) =>
    PingContract.group.of({
      "ping.count": () => Effect.map(counter.count, (count) => ({ count })),
    }),
  ),
  agentInstructions: "## Ping\nCall ping.count.",
  homeContributor: Effect.succeed({ module: "ping", needsYou: Effect.succeed([]) }),
});

class Doomed extends Context.Service<Doomed, { readonly nothing: true }>()(
  "@otterware/module-kit/server/ModuleRuntime.test/Doomed",
) {}

const BrokenContract = defineModuleContract({
  id: "broken",
  group: RpcGroup.make(
    Rpc.make("broken.ping", {
      payload: Schema.Struct({}),
      success: Schema.Struct({}),
      error: moduleRpcErrors(),
    }),
  ),
  scopes: { "broken.ping": AuthOrchestrationReadScope },
});

class DoomedError extends Data.TaggedError("DoomedError")<{ readonly message: string }> {}

const BrokenModule = defineServerModule({
  contract: BrokenContract,
  migrations: [],
  layer: Layer.effect(Doomed, Effect.fail(new DoomedError({ message: "no network, no module" }))),
  rpcHandlers: Effect.succeed(BrokenContract.group.of({ "broken.ping": () => Effect.succeed({}) })),
});

const modules = [PingModule, BrokenModule];
const isModuleOffError = Schema.is(ModuleOffError);

const layerAssistant = Layer.succeed(AssistantProjectHost, {
  ensure: Effect.succeed({ projectId: "p", workspaceRoot: "/tmp/assistant" }),
});

const layer = HostLayer.layerRuntime(modules).pipe(
  Layer.provideMerge(SuiteDatabase.layerMemory),
  Layer.provideMerge(layerAssistant),
  Layer.provide(NodeServices.layer),
);

const MergedGroup = HostRpcGroup.merge(PingContract.group, BrokenContract.group);

/** Calls an RPC the way the WebSocket server does: through the built handler context. */
const call = (tag: string, payload: unknown) =>
  Effect.gen(function* () {
    const handlers = yield* Layer.build(layerRpcHandlers(MergedGroup));
    const rpc = MergedGroup.requests.get(tag)!;
    const entry = handlers.mapUnsafe.get(rpc.key) as {
      readonly handler: (payload: unknown, options: unknown) => Effect.Effect<unknown, unknown>;
      readonly context: Context.Context<never>;
    };
    return yield* Effect.provide(entry.handler(payload, {}), entry.context);
  }).pipe(Effect.scoped);

it.layer(layer)("ModuleRuntime", (it) => {
  it.effect("starts every module the user left on and reports the one that failed", () =>
    Effect.gen(function* () {
      const runtime = yield* ModuleRuntime.ModuleRuntime;
      const list = yield* runtime.list;
      assert.deepStrictEqual(
        list.map((entry) => [entry.id, entry.state]),
        [
          ["ping", "on"],
          ["broken", "failed"],
        ],
      );
      assert.include(list[1]!.failure, "no network, no module");
      assert.isTrue(runtime.isOnSync("ping"));
      assert.isFalse(runtime.isOnSync("broken"));
      assert.strictEqual(opened.count, 1);
      assert.include(moduleAgentInstructions(), "Call ping.count");
      const contributors = yield* HomeContributors;
      assert.deepStrictEqual(
        (yield* contributors.current).map((c) => c.module),
        ["ping"],
      );
    }),
  );

  it.effect("answers module RPCs while on and ModuleOffError while off", () =>
    Effect.gen(function* () {
      const runtime = yield* ModuleRuntime.ModuleRuntime;
      assert.deepStrictEqual(yield* call("ping.count", {}), { count: 0 });

      const broken = yield* Effect.flip(call("broken.ping", {}));
      assert.isTrue(isModuleOffError(broken));
      assert.strictEqual((broken as ModuleOffError).state, "failed");

      // Subscribed before the toggles; joined after them, so no sleep is needed.
      const changes = yield* Stream.runCollect(Stream.take(runtime.changes, 2)).pipe(
        Effect.map((entries) => [...entries].map((entry) => `${entry.id}:${entry.state}`)),
        Effect.forkScoped,
      );
      yield* Effect.yieldNow;

      const off = yield* runtime.setEnabled("ping", false);
      assert.strictEqual(off.state, "off");
      assert.strictEqual(opened.closed, 1);
      assert.strictEqual(moduleAgentInstructions(), "");
      const refused = yield* Effect.flip(call("ping.count", {}));
      assert.isTrue(isModuleOffError(refused));
      assert.include((refused as ModuleOffError).message, "turned off");
      const contributors = yield* HomeContributors;
      assert.deepStrictEqual(yield* contributors.current, []);

      const on = yield* runtime.setEnabled("ping", true);
      assert.strictEqual(on.state, "on");
      assert.strictEqual(opened.count, 2);
      assert.deepStrictEqual(yield* call("ping.count", {}), { count: 0 });
      assert.deepStrictEqual(yield* Fiber.join(changes), ["ping:off", "ping:on"]);

      // The host RPCs see the same states.
      const listed = (yield* call("modules.list", {})) as {
        readonly modules: ReadonlyArray<{ id: string; state: string }>;
      };
      assert.deepStrictEqual(
        listed.modules.map((entry) => entry.state),
        ["on", "failed"],
      );
      const unknown = yield* Effect.flip(call("modules.setEnabled", { id: "nope", enabled: true }));
      assert.strictEqual((unknown as { _tag: string })._tag, "ModuleNotInstalledError");
      assert.deepStrictEqual(yield* call("assistant.ensureProject", {}), {
        projectId: "p",
        workspaceRoot: "/tmp/assistant",
      });
    }),
  );

  it.effect("persists the off choice for the next start", () =>
    Effect.gen(function* () {
      const runtime = yield* ModuleRuntime.ModuleRuntime;
      yield* runtime.setEnabled("ping", false);
      // A second runtime over the same database reads the choice back.
      const sql = yield* SuiteDatabase.SuiteSqlClient;
      const second = yield* Layer.build(
        HostLayer.layerRuntime([PingModule]).pipe(
          Layer.provide(Layer.succeed(SuiteDatabase.SuiteSqlClient, sql)),
        ),
      );
      const list = yield* Context.get(second, ModuleRuntime.ModuleRuntime).list;
      assert.deepStrictEqual(list, [{ id: "ping", state: "off" }]);
      assert.isTrue(
        Option.isNone(yield* Context.get(second, ModuleRuntime.ModuleRuntime).openModule("ping")),
      );
      yield* runtime.setEnabled("ping", true);
    }).pipe(Effect.scoped),
  );
});

it.effect("a module needs no layer, handlers or contributor to be listed", () =>
  Effect.gen(function* () {
    const Bare = defineServerModule({ contract: BrokenContract, migrations: [] });
    const context = yield* Layer.build(
      HostLayer.layerRuntime([Bare]).pipe(Layer.provide(SuiteDatabase.layerMemory)),
    );
    const runtime = Context.get(context, ModuleRuntime.ModuleRuntime);
    assert.deepStrictEqual(yield* runtime.list, [{ id: "broken", state: "on" }]);
    assert.isTrue(Option.isSome(yield* runtime.openModule("broken")));
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
