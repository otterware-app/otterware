import {
  CalendarError,
  CalendarEventReminders,
  CalendarReminderNotification,
  type CalendarPreferences,
} from "@otterware/calendar-contracts";
import { DAY_MS, MINUTE_MS, fromZoned } from "@otterware/calendar-contracts/time";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as PubSub from "effect/PubSub";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/sql/SqlClient";

export type ReminderCandidate = Omit<
  CalendarReminderNotification,
  "key" | "deliveredAt" | "minutesBefore"
> & {
  readonly reminders?: CalendarEventReminders;
  readonly defaultReminders?: CalendarEventReminders["overrides"];
};
const encode = Schema.encodeEffect(Schema.fromJsonString(CalendarReminderNotification));
const decode = Schema.decodeUnknownEffect(Schema.fromJsonString(CalendarReminderNotification));
const GRACE = 5 * MINUTE_MS;
const error = () =>
  new CalendarError({ code: "failed", detail: "Could not deliver Calendar reminders." });

/** A scoped clock worker with durable deduplication. Event and preference changes reschedule it. */
export const makeCalendarReminders = Effect.fn("CalendarReminders.make")(function* (options: {
  preferences: () => CalendarPreferences;
  candidates: (now: number) => Effect.Effect<ReadonlyArray<ReminderCandidate>, CalendarError>;
  changes: Stream.Stream<unknown>;
  autoStart?: boolean;
}) {
  const sql = yield* SqlClient.SqlClient;
  const deliveries = yield* PubSub.sliding<CalendarReminderNotification>(64);
  const wakeups = yield* Queue.sliding<void>(1);
  const lock = yield* Semaphore.make(1);
  yield* Effect.addFinalizer(() =>
    Effect.all([PubSub.shutdown(deliveries), Queue.shutdown(wakeups)], { discard: true }),
  );
  const check = lock
    .withPermits(1)(
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        const preferences = options.preferences();
        let next = now + 60 * MINUTE_MS;
        for (const candidate of yield* options.candidates(now)) {
          const start = candidate.allDay
            ? fromZoned(Math.floor(candidate.start / DAY_MS), 0, candidate.timeZone)
            : candidate.start;
          const minutes =
            candidate.reminders?.useDefault === false
              ? (candidate.reminders.overrides ?? [])
                  .filter((rule) => rule.method === "popup")
                  .map((rule) => rule.minutes)
              : candidate.defaultReminders !== undefined
                ? candidate.defaultReminders
                    .filter((rule) => rule.method === "popup")
                    .map((rule) => rule.minutes)
                : preferences.notificationRules
                    .filter((rule) => rule.enabled)
                    .map((rule) => rule.minutesBefore);
          for (const minutesBefore of new Set(minutes)) {
            const due = start - minutesBefore * MINUTE_MS;
            if (due > now) {
              next = Math.min(next, due);
              continue;
            }
            if (due < now - GRACE || start < now) continue;
            const key = `${candidate.calendarId}/${candidate.eventId}/${start}/${minutesBefore}`;
            const notification = { ...candidate, key, start, minutesBefore, deliveredAt: now };
            const json = yield* encode(notification);
            const inserted = yield* sql<{
              key: string;
            }>`INSERT INTO calendar_reminder_deliveries (key, calendar_id, delivered_at, notification_json) VALUES (${key}, ${candidate.calendarId}, ${now}, ${json}) ON CONFLICT(key) DO NOTHING RETURNING key`;
            if (inserted.length) yield* PubSub.publish(deliveries, notification);
          }
        }
        yield* sql`DELETE FROM calendar_reminder_deliveries WHERE delivered_at < ${now - 30 * DAY_MS}`;
        return Math.max(100, next - now);
      }),
    )
    .pipe(Effect.mapError(error));
  const stream = Stream.unwrap(
    Effect.gen(function* () {
      const subscription = yield* PubSub.subscribe(deliveries);
      const now = yield* Clock.currentTimeMillis;
      const recent = yield* sql<{
        notification_json: string;
      }>`SELECT notification_json FROM calendar_reminder_deliveries WHERE delivered_at >= ${now - GRACE} ORDER BY delivered_at LIMIT 64`;
      const notifications = yield* Effect.forEach(recent, (row) => decode(row.notification_json));
      return Stream.concat(
        Stream.fromIterable(notifications),
        Stream.fromSubscription(subscription),
      );
    }).pipe(Effect.mapError(error)),
  );
  if (options.autoStart !== false) {
    yield* Stream.runForEach(options.changes, () => Queue.offer(wakeups, undefined)).pipe(
      Effect.forkScoped,
    );
    yield* Effect.gen(function* () {
      while (true) {
        const delay = yield* check.pipe(Effect.orElseSucceed(() => MINUTE_MS));
        yield* Effect.timeoutOrElse(Queue.take(wakeups), {
          duration: delay,
          orElse: () => Effect.void,
        });
      }
    }).pipe(Effect.forkScoped);
  }
  return { stream, check };
});
