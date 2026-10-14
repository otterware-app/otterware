import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE calendar_preference_sync_meta (id INTEGER PRIMARY KEY CHECK (id = 1), account_id TEXT)`;
  yield* sql`CREATE TABLE calendar_preference_sync_cursor (account_id TEXT PRIMARY KEY, cursor INTEGER NOT NULL)`;
  yield* sql`CREATE TABLE calendar_preference_sync_cache (account_id TEXT NOT NULL, setting TEXT NOT NULL, value_json TEXT NOT NULL, modified_at INTEGER NOT NULL, mutation_id TEXT NOT NULL, PRIMARY KEY (account_id, setting))`;
  yield* sql`CREATE TABLE calendar_preference_sync_outbox (account_id TEXT NOT NULL, setting TEXT NOT NULL, value_json TEXT NOT NULL, modified_at INTEGER NOT NULL, mutation_id TEXT NOT NULL, PRIMARY KEY (account_id, setting))`;
});
