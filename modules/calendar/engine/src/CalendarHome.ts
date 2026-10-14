import type { HomeContributor } from "@otterware/module-kit/engine";
import * as DateTime from "effect/DateTime";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import { DAY_MS, fromZoned, systemTimeZone, zonedDay } from "@otterware/calendar-contracts/time";
import { CalendarService } from "./CalendarService.ts";

export const calendarHomeContributor = Effect.gen(function* () {
  const calendar = yield* CalendarService;
  const today = Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    const directory = yield* calendar.getDirectory;
    const zone = directory.preferences.timeZone ?? systemTimeZone();
    const day = zonedDay(now, zone);
    const instances = yield* calendar.listInstances({
      start: fromZoned(day, 0, zone),
      end: fromZoned(day + 1, 0, zone),
    });
    return instances.map((event) => ({
      id: `${event.calendarId}/${event.eventId}`,
      title: event.title,
      startsAt: DateTime.formatIso(DateTime.makeUnsafe(event.start)),
      endsAt: DateTime.formatIso(DateTime.makeUnsafe(event.end)),
      allDay: event.allDay === true,
      ...(event.location ? { location: event.location } : {}),
      calendarName: directory.calendars.find((c) => c.calendarId === event.calendarId)?.name ?? "",
      target: {
        route: `/calendar?event=${encodeURIComponent(event.eventId)}&calendar=${encodeURIComponent(event.calendarId)}`,
      },
      facets: { calendarId: event.calendarId },
    }));
  }).pipe(Effect.orElseSucceed(() => []));
  const needsYou = Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    const events = yield* calendar.listInstances({ start: now, end: now + 7 * DAY_MS });
    return events
      .filter((event) => event.response === "needsAction")
      .map((event) => ({
        id: `${event.calendarId}/${event.eventId}`,
        module: "calendar",
        kind: "invitation",
        title: event.title,
        occurredAt: DateTime.formatIso(DateTime.makeUnsafe(event.start)),
        priority: 80,
        waitingOnYou: true,
        target: {
          route: `/calendar?event=${encodeURIComponent(event.eventId)}&calendar=${encodeURIComponent(event.calendarId)}`,
        },
        actions: [],
        facets: { calendarId: event.calendarId },
      }));
  }).pipe(Effect.orElseSucceed(() => []));
  return { module: "calendar", today, needsYou } satisfies HomeContributor;
});
