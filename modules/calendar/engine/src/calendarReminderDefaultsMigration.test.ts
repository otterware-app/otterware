import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";
import { makeCalendarStore } from "./CalendarStore.ts";
import migration from "./migration.ts";
import reminderDefaultsMigration from "./calendarReminderDefaultsMigration.ts";

it.effect(
  "upgrades existing calendars by fetching defaults once, then persists changes and removals",
  () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* migration;
      yield* sql`INSERT INTO calendar_accounts (account_id, provider, external_id, email, display_name, status, position, created_at, calendar_list_sync_token) VALUES ('account', 'google', 'google-user', 'a@example.test', 'A', 'ok', 0, 0, 'old-token')`;
      yield* sql`INSERT INTO calendar_calendars (calendar_id, account_id, remote_id, name, color, access_role, is_primary, visible, position, horizon_start, horizon_end) VALUES ('calendar', 'account', 'primary', 'Work', '#123456', 'owner', 1, 1, 0, 0, 0)`;
      yield* reminderDefaultsMigration;
      const store = makeCalendarStore(sql);
      expect((yield* store.getAccount("account"))?.calendarListSyncToken).toBeNull();
      const fields = {
        name: "Work",
        description: null,
        color: "#123456",
        accessRole: "owner" as const,
        primary: true,
        timeZone: "Europe/Berlin",
      };
      const defaults = '[{"method":"popup","minutes":10}]';
      yield* store.updateCalendarFromRemote("calendar", {
        ...fields,
        defaultRemindersJson: defaults,
      });
      expect((yield* store.getCalendar("calendar"))?.defaultRemindersJson).toBe(defaults);
      yield* store.updateCalendarFromRemote("calendar", fields);
      expect((yield* store.getCalendar("calendar"))?.defaultRemindersJson).toBe(defaults);
      yield* store.updateCalendarFromRemote("calendar", { ...fields, defaultRemindersJson: "[]" });
      expect((yield* store.getCalendar("calendar"))?.defaultRemindersJson).toBe("[]");
    }).pipe(
      Effect.provide(
        NodeSqliteClient.layer({ filename: ":memory:" }).pipe(Layer.provide(NodeServices.layer)),
      ),
    ),
);
