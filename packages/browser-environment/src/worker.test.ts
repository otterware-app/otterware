// @effect-diagnostics nodeBuiltinImport:off -- The page and its worker meet over a MessageChannel, Node's stand-in for a worker's port.
import * as NodeWorkerThreads from "node:worker_threads";

import * as BrowserWorkerRunner from "@effect/platform-browser/BrowserWorkerRunner";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { selectBrowserModules } from "@otterware/composition/browser";
import { ModuleOffError } from "@otterware/module-kit/contracts";
import { SuiteSqlClient } from "@otterware/module-kit/runtime";
import { PROFILES } from "@otterware/profiles";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Reactivity from "effect/reactivity/Reactivity";
import * as RpcServer from "effect/rpc/RpcServer";

import { layerProtocol, makeBrowserEnvironmentClient } from "./client.ts";
import { BROWSER_ENVIRONMENT_MODULE_IDS, BrowserEnvironmentRpcGroup } from "./contracts.ts";
import { layerHost } from "./host.ts";
import * as SqliteWasmClient from "./sqlite/SqliteWasmClient.ts";

/** `suite.sqlite` in memory, on the same SQLite build the worker opens on OPFS. */
const layerSuiteMemory = Layer.effect(
  SuiteSqlClient,
  Effect.gen(function* () {
    const sqlite3 = yield* Effect.promise(() => sqlite3InitModule());
    const db = yield* Effect.acquireRelease(
      Effect.sync(() => new sqlite3.oo1.DB(":memory:")),
      (db) => Effect.sync(() => db.close()),
    );
    return yield* SqliteWasmClient.make(db);
  }),
).pipe(Layer.provide(Reactivity.layer));

/**
 * The worker's server on one end of a channel and the page's client on the
 * other: everything crosses the port as the worker protocol's messages.
 */
const layerConnected = Layer.unwrap(
  Effect.sync(() => {
    const channel = new NodeWorkerThreads.MessageChannel();
    const server = RpcServer.layer(BrowserEnvironmentRpcGroup).pipe(
      Layer.provide(
        layerHost()(BrowserEnvironmentRpcGroup, selectBrowserModules(PROFILES.otterware)),
      ),
      Layer.provide(RpcServer.layerProtocolWorkerRunner),
      Layer.provide(BrowserWorkerRunner.layerMessagePort(channel.port1 as unknown as MessagePort)),
      Layer.provide(layerSuiteMemory),
      Layer.provide(Layer.mergeAll(NodeServices.layer, FetchHttpClient.layer)),
    );
    return Layer.merge(
      server,
      layerProtocol(() => channel.port2 as unknown as MessagePort),
    );
  }),
);

const isModuleOffError = Schema.is(ModuleOffError);

it.layer(layerConnected, { timeout: 30_000 })("in-browser environment worker protocol", (it) => {
  it.effect("serves the host and module RPCs of the profile's browser modules", () =>
    Effect.gen(function* () {
      const client = yield* makeBrowserEnvironmentClient;
      assert.deepStrictEqual(BROWSER_ENVIRONMENT_MODULE_IDS, ["home", "calendar"]);

      const { modules } = yield* client["modules.list"]({});
      assert.deepStrictEqual(
        modules.map((entry) => [entry.id, entry.state]),
        [
          ["home", "on"],
          ["calendar", "on"],
        ],
      );

      // A streaming RPC: the engine ran its migrations on SQLite in WASM.
      const directory = yield* client["calendar.subscribeDirectory"]({}).pipe(
        Stream.take(1),
        Stream.runHead,
      );
      assert.deepStrictEqual(
        Option.map(directory, (value) => value.accounts),
        Option.some([]),
      );

      const overview = yield* client["home.overview"]({});
      assert.deepStrictEqual(overview.items, []);

      const failure = yield* Effect.flip(client["assistant.ensureProject"]({}));
      assert.strictEqual(failure._tag, "AssistantProjectError");
    }),
  );

  it.effect("turns a module off and on across the port", () =>
    Effect.gen(function* () {
      const client = yield* makeBrowserEnvironmentClient;
      const off = yield* client["modules.setEnabled"]({ id: "calendar", enabled: false });
      assert.strictEqual(off.state, "off");

      const refused = yield* Effect.flip(client["calendar.search"]({ query: "standup", limit: 5 }));
      assert.isTrue(isModuleOffError(refused));

      const on = yield* client["modules.setEnabled"]({ id: "calendar", enabled: true });
      assert.strictEqual(on.state, "on");
      const directory = yield* client["calendar.subscribeDirectory"]({}).pipe(
        Stream.take(1),
        Stream.runHead,
      );
      assert.isTrue(Option.isSome(directory));
    }),
  );
});
