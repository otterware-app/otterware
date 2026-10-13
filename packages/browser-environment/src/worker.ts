/**
 * The in-browser environment (ADR 0008): a dedicated Web Worker that runs
 * the profile's module engines over SQLite in WASM on OPFS and serves their
 * RPC groups to the page that spawned it (`client.ts`).
 */
import * as BrowserCrypto from "@effect/platform-browser/BrowserCrypto";
import * as BrowserRuntime from "@effect/platform-browser/BrowserRuntime";
import * as BrowserWorkerRunner from "@effect/platform-browser/BrowserWorkerRunner";
import {
  type BrowserModulesRequirements,
  selectBrowserModules,
} from "@otterware/composition/browser";
import { SuiteSqlClient } from "@otterware/module-kit/runtime";
import { activeProfile } from "@otterware/profiles/active";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Reactivity from "effect/reactivity/Reactivity";
import * as RpcServer from "effect/rpc/RpcServer";

import { BrowserEnvironmentRpcGroup } from "./contracts.ts";
import { layerHost } from "./host.ts";
import { openOpfsDatabases } from "./sqlite/opfs.ts";
import * as SqliteWasmClient from "./sqlite/SqliteWasmClient.ts";

/** `suite.sqlite` in this browser profile's OPFS pool. */
const layerSuiteDatabase = Layer.effect(
  SuiteSqlClient,
  Effect.gen(function* () {
    const databases = yield* openOpfsDatabases();
    const db = yield* databases.open("suite.sqlite");
    const sql = yield* SqliteWasmClient.make(db);
    yield* sql`PRAGMA foreign_keys = ON;`;
    return sql;
  }),
).pipe(Layer.provide(Reactivity.layer));

const layerMain = RpcServer.layer(BrowserEnvironmentRpcGroup).pipe(
  Layer.provide(
    layerHost<BrowserModulesRequirements>()(
      BrowserEnvironmentRpcGroup,
      selectBrowserModules(activeProfile),
    ),
  ),
  Layer.provide(RpcServer.layerProtocolWorkerRunner),
  Layer.provide(BrowserWorkerRunner.layer),
  Layer.provide(layerSuiteDatabase),
  Layer.provide(Layer.mergeAll(BrowserCrypto.layer, FetchHttpClient.layer)),
);

BrowserRuntime.runMain(Layer.launch(layerMain));
