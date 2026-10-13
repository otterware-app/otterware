import { expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as TestClock from "effect/testing/TestClock";
import { CalendarService } from "./CalendarService.ts";
import * as CalendarServiceLive from "./CalendarServiceLive.ts";
import * as GoogleAuthUnavailable from "./GoogleAuthUnavailable.ts";
import { calendarToolHandlers } from "./CalendarTools.ts";
import { SqlitePersistenceMemory } from "../test/Sqlite.ts";

const layer = CalendarServiceLive.layerWith({ demoLatency: false, autoSync: false }).pipe(
  Layer.provide(GoogleAuthUnavailable.layer),
  Layer.provide(SqlitePersistenceMemory),
  Layer.provide(NodeServices.layer),
);
it.effect("tools create wall-time events and return them in the viewer's zone", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(Date.UTC(2026, 9, 1, 10));
    const calendar = yield* CalendarService;
    yield* calendar.updatePreferences({ timeZone: "Europe/Berlin" });
    yield* calendar.addDemo({ size: "standard" });
    yield* calendar.sync({});
    const tools = yield* calendarToolHandlers;
    const directory = yield* calendar.getDirectory;
    const target = directory.calendars.find((c) => c.accessRole === "owner")!;
    const created = yield* tools.calendar_create_event({
      calendarId: target.calendarId,
      title: "Ported tool",
      start: "2026-10-05T13:00",
      end: "2026-10-05T14:00",
    });
    expect(created.event?.start).toBe("2026-10-05T13:00:00+02:00");
    const listed = yield* tools.calendar_list_events({
      start: "2026-10-05",
      end: "2026-10-06",
      query: "Ported tool",
    });
    expect(listed.events.map((event) => event.title)).toEqual(["Ported tool"]);
  }).pipe(Effect.provide(layer)),
);
