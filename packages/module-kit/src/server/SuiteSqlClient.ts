/**
 * The suite database's client, under its own tag so it never collides with the
 * main `SqlClient.SqlClient` (statev2.sqlite) in the server's layer graph.
 * Module code written against a plain `SqlClient` gets it through
 * `layerSqlClient`, provided locally to that module only. Portable: an
 * environment opens it on `suite.sqlite` (`SuiteDatabase.ts`), the in-browser
 * environment on SQLite in WASM.
 */
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";

export class SuiteSqlClient extends Context.Service<SuiteSqlClient, SqlClient.SqlClient>()(
  "@otterware/module-kit/server/SuiteSqlClient",
) {}

/** The suite database as the plain `SqlClient`, for one module's own layers. */
export const layerSqlClient = Layer.effect(SqlClient.SqlClient, SuiteSqlClient);
