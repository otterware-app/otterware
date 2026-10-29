import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";
import { MAIL_SCHEDULE_SCHEMA } from "./storage.ts";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql.unsafe(MAIL_SCHEDULE_SCHEMA);
  const columns = yield* sql<{ name: string }>`SELECT name FROM pragma_table_info('mail_schedule')`;
  if (!columns.some((column) => column.name === "serverId")) {
    yield* sql`ALTER TABLE mail_schedule ADD COLUMN serverId TEXT`;
  }
});
