/** `suite.sqlite` in memory, on the same SQLite build the worker opens on OPFS. */
import { SuiteSqlClient } from "@otterware/module-kit/runtime";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Reactivity from "effect/reactivity/Reactivity";

import * as SqliteWasmClient from "../sqlite/SqliteWasmClient.ts";

export const layerSuiteMemory = Layer.effect(
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
