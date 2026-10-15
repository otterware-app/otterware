import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`ALTER TABLE calendar_calendars ADD COLUMN default_reminders_json TEXT`;
  // Existing incremental tokens omit unchanged entries; fetch their newly requested defaults once.
  yield* sql`UPDATE calendar_accounts SET calendar_list_sync_token = NULL WHERE provider = 'google'`;
});
