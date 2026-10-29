import { expect, it } from "@effect/vitest";
import { SuiteDatabase } from "@otterware/module-kit/server";
import { runSuiteMigrations } from "@otterware/module-kit/runtime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";
import { MailModule } from "../../MailModule.ts";

it.effect("upgrades queued mail in suite.sqlite once without losing local sends", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* sql`CREATE TABLE mail_schedule (
      id TEXT PRIMARY KEY, accountId TEXT NOT NULL, kind TEXT NOT NULL,
      dueAt INTEGER NOT NULL, state TEXT NOT NULL, subject TEXT NOT NULL,
      threadId TEXT, payload TEXT, error TEXT
    )`;
    yield* sql`INSERT INTO mail_schedule VALUES ('old', 'me', 'send', 42, 'pending', 'Later', NULL, '{}', NULL)`;
    expect(yield* runSuiteMigrations(MailModule.migrations)).toEqual(["mail#2"]);
    expect(yield* sql`SELECT id, payload, serverId FROM mail_schedule`).toEqual([
      { id: "old", payload: "{}", serverId: null },
    ]);
    yield* sql`UPDATE mail_schedule SET serverId = 'held' WHERE id = 'old'`;
    expect(yield* runSuiteMigrations(MailModule.migrations)).toEqual([]);
    expect(yield* sql`SELECT serverId FROM mail_schedule`).toEqual([{ serverId: "held" }]);
  }).pipe(
    Effect.provide(SuiteDatabase.layerSqlClient.pipe(Layer.provide(SuiteDatabase.layerMemory))),
  ),
);
