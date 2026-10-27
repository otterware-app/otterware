/**
 * `<stateDir>/suite.sqlite`: every module's tables. It sits beside the shared
 * `statev2.sqlite` instead of inside it (ADR 0012), so a server built from
 * this repository and an older Otter Code release can take turns on the same
 * data home without schema drift in the main database.
 */
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as SqlClient from "effect/sql/SqlClient";

import { SuiteSqlClient } from "./SuiteSqlClient.ts";

export { layerSqlClient, SuiteSqlClient } from "./SuiteSqlClient.ts";

export const SUITE_DATABASE_FILENAME = "suite.sqlite";

const configure = Effect.fn("SuiteDatabase.configure")(function* (sql: SqlClient.SqlClient) {
  yield* sql`PRAGMA busy_timeout = 5000;`;
  yield* sql`PRAGMA foreign_keys = ON;`;
  yield* sql`PRAGMA journal_mode = WAL;`;
  return sql;
});

const layerFromClient = <E, R>(client: Layer.Layer<SqlClient.SqlClient, E, R>) =>
  Layer.effect(SuiteSqlClient, Effect.flatMap(SqlClient.SqlClient, configure)).pipe(
    Layer.provide(client),
  );

export const layerFromPath = (dbPath: string) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      yield* fs.makeDirectory(path.dirname(dbPath), { recursive: true });
      return layerFromClient(
        NodeSqliteClient.layer({
          filename: dbPath,
          spanAttributes: {
            "db.name": path.basename(dbPath),
            "service.name": "t3code-server",
          },
        }),
      );
    }),
  );

/** Opens `<stateDir>/suite.sqlite`. */
export const layerFromStateDir = (stateDir: string) =>
  Layer.unwrap(
    Effect.map(Path.Path, (path) => layerFromPath(path.join(stateDir, SUITE_DATABASE_FILENAME))),
  );

export const layerMemory = layerFromClient(NodeSqliteClient.layer({ filename: ":memory:" }));
