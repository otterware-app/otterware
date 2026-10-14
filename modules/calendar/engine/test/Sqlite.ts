import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as SqlClient from "effect/sql/SqlClient";
import preferenceSyncMigration from "../src/preferenceSyncMigration.ts";
import environmentMigration from "../src/environmentMigration.ts";
import calendarReminderDefaultsMigration from "../src/calendarReminderDefaultsMigration.ts";
import reminderMigration from "../src/reminderMigration.ts";
import migration from "../src/migration.ts";

export const SqlitePersistenceMemory = Layer.effectDiscard(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`PRAGMA foreign_keys = ON`;
    yield* migration;
    yield* environmentMigration;
    yield* preferenceSyncMigration;
    yield* reminderMigration;
    yield* calendarReminderDefaultsMigration;
  }),
).pipe(Layer.provideMerge(NodeSqliteClient.layer({ filename: ":memory:" })));
