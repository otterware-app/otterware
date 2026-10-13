import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE calendar_reminder_deliveries (key TEXT PRIMARY KEY, calendar_id TEXT NOT NULL REFERENCES calendar_calendars(calendar_id) ON DELETE CASCADE, delivered_at INTEGER NOT NULL, notification_json TEXT NOT NULL)`;
  yield* sql`CREATE INDEX calendar_reminder_delivery_time ON calendar_reminder_deliveries(delivered_at)`;
});
