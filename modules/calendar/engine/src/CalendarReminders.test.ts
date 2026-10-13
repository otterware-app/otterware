import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import {
  CalendarId,
  DEFAULT_CALENDAR_PREFERENCES,
  type CalendarReminderNotification,
} from "@otterware/calendar-contracts";
import { DAY_MS, MINUTE_MS, dayNumber, fromZoned } from "@otterware/calendar-contracts/time";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/sql/SqlClient";
import * as TestClock from "effect/testing/TestClock";
import { SqlitePersistenceMemory } from "../test/Sqlite.ts";
import { makeCalendarReminders, type ReminderCandidate } from "./CalendarReminders.ts";
const database = SqlitePersistenceMemory.pipe(Layer.provideMerge(NodeServices.layer));
const seed = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`INSERT INTO calendar_accounts (account_id, provider, external_id, email, display_name, status, position, created_at) VALUES ('account', 'demo', 'demo', 'a@example.test', 'A', 'ok', 0, 0)`;
  yield* sql`INSERT INTO calendar_calendars (calendar_id, account_id, remote_id, name, color, access_role, is_primary, visible, position, horizon_start, horizon_end) VALUES ('calendar', 'account', 'primary', 'Work', '#123456', 'owner', 1, 1, 0, 0, 0)`;
  return sql;
});
const base = {
  calendarId: CalendarId.make("calendar"),
  eventId: "event",
  title: "Meeting",
  allDay: false,
  timeZone: "Europe/Berlin",
};
it.effect("uses popup overrides, deduplicates after restart, and reschedules moved events", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const sql = yield* seed;
      const now = DAY_MS;
      yield* TestClock.setTime(now);
      const candidates = yield* Ref.make<ReadonlyArray<ReminderCandidate>>([
        {
          ...base,
          start: now + 10 * MINUTE_MS,
          reminders: {
            useDefault: false,
            overrides: [
              { method: "popup", minutes: 5 },
              { method: "email", minutes: 10 },
            ],
          },
        },
      ]);
      const options = {
        preferences: () => ({
          ...DEFAULT_CALENDAR_PREFERENCES,
          notificationRules: [{ minutesBefore: 10, enabled: true }],
        }),
        candidates: () => Ref.get(candidates),
        changes: Stream.empty,
        autoStart: false,
      };
      const worker = yield* makeCalendarReminders(options);
      const received = yield* Queue.unbounded<CalendarReminderNotification>();
      yield* worker.stream.pipe(
        Stream.runForEach((value) => Queue.offer(received, value)),
        Effect.forkScoped,
      );
      expect(yield* worker.check).toBe(5 * MINUTE_MS);
      yield* TestClock.adjust(5 * MINUTE_MS);
      yield* worker.check;
      expect((yield* Queue.take(received)).minutesBefore).toBe(5);
      const restarted = yield* makeCalendarReminders(options);
      yield* restarted.check;
      expect(yield* sql`SELECT * FROM calendar_reminder_deliveries`).toHaveLength(1);
      yield* Ref.set(candidates, [{ ...base, start: now + 20 * MINUTE_MS }]);
      expect(yield* restarted.check).toBe(5 * MINUTE_MS);
      yield* TestClock.adjust(5 * MINUTE_MS);
      yield* restarted.check;
      expect(yield* sql`SELECT * FROM calendar_reminder_deliveries`).toHaveLength(2);
    }),
  ).pipe(Effect.provide(database)),
);

it.effect(
  "uses the local date for all-day reminders and skips disabled or obsolete deliveries",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const sql = yield* seed;
        const day = dayNumber(2026, 3, 29);
        const start = fromZoned(day, 0, "Europe/Berlin");
        yield* TestClock.setTime(start - 10 * MINUTE_MS);
        const candidates = yield* Ref.make<ReadonlyArray<ReminderCandidate>>([
          { ...base, start: day * DAY_MS, allDay: true },
        ]);
        const worker = yield* makeCalendarReminders({
          preferences: () => ({
            ...DEFAULT_CALENDAR_PREFERENCES,
            notificationRules: [
              { minutesBefore: 10, enabled: true },
              { minutesBefore: 20, enabled: false },
            ],
          }),
          candidates: () => Ref.get(candidates),
          changes: Stream.empty,
          autoStart: false,
        });
        yield* worker.check;
        const rows = yield* sql<{
          notification_json: string;
        }>`SELECT * FROM calendar_reminder_deliveries`;
        expect(rows).toHaveLength(1);
        expect(JSON.parse(rows[0]!.notification_json).start).toBe(start);
        yield* Ref.set(candidates, [
          { ...base, eventId: "obsolete", start: start - 20 * MINUTE_MS },
        ]);
        yield* worker.check;
        expect(yield* sql`SELECT * FROM calendar_reminder_deliveries`).toHaveLength(1);
      }),
    ).pipe(Effect.provide(database)),
);

it.effect("automatically wakes for changes and stops its timer with the module scope", () =>
  Effect.gen(function* () {
    const sql = yield* seed;
    const now = DAY_MS;
    yield* TestClock.setTime(now);
    const candidates = yield* Ref.make<ReadonlyArray<ReminderCandidate>>([
      { ...base, start: now + 20 * MINUTE_MS },
    ]);
    const reads = yield* Ref.make(0);
    yield* Effect.scoped(
      Effect.gen(function* () {
        const checked = yield* Queue.unbounded<void>();
        const changes = yield* PubSub.unbounded<void>();
        const worker = yield* makeCalendarReminders({
          preferences: () => ({
            ...DEFAULT_CALENDAR_PREFERENCES,
            notificationRules: [{ minutesBefore: 10, enabled: true }],
          }),
          candidates: () =>
            Ref.get(candidates).pipe(
              Effect.tap(() => Ref.update(reads, (value) => value + 1)),
              Effect.tap(() => Queue.offer(checked, undefined)),
            ),
          changes: Stream.fromPubSub(changes),
        });
        const notifications = yield* Queue.unbounded<CalendarReminderNotification>();
        yield* worker.stream.pipe(
          Stream.runForEach((value) => Queue.offer(notifications, value)),
          Effect.forkScoped,
        );
        yield* Queue.take(checked);
        yield* TestClock.adjust(5 * MINUTE_MS);
        yield* Ref.set(candidates, [{ ...base, start: now + 25 * MINUTE_MS }]);
        yield* PubSub.publish(changes, undefined);
        yield* Queue.take(checked);
        yield* TestClock.adjust(5 * MINUTE_MS);
        expect(yield* sql`SELECT * FROM calendar_reminder_deliveries`).toHaveLength(0);
        yield* TestClock.adjust(5 * MINUTE_MS);
        expect((yield* Queue.take(notifications)).start).toBe(now + 25 * MINUTE_MS);
      }),
    );
    const stoppedAt = yield* Ref.get(reads);
    yield* TestClock.adjust(60 * MINUTE_MS);
    expect(yield* Ref.get(reads)).toBe(stoppedAt);
  }).pipe(Effect.provide(database)),
);
