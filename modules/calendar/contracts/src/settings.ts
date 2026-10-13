import { defineModuleSettings } from "@otterware/module-kit/contracts";
import * as Schema from "effect/Schema";
import { CalendarId } from "./calendar.ts";

export const CalendarSettings = defineModuleSettings({
  defaultCalendarId: {
    scope: "account",
    schema: Schema.NullOr(CalendarId),
    default: null,
    label: "Default calendar",
  },
  weekStart: {
    scope: "account",
    schema: Schema.Literals([0, 1, 6]),
    default: 1,
    label: "Week starts on",
  },
  visibleCalendars: {
    scope: "account",
    schema: Schema.Array(CalendarId),
    default: [],
    label: "Visible calendars",
  },
  notificationRules: {
    scope: "account",
    schema: Schema.Array(
      Schema.Struct({
        minutesBefore: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 10080 })),
        enabled: Schema.Boolean,
      }),
    ),
    default: [],
    label: "Event reminders",
  },
  syncWindow: {
    scope: "environment",
    schema: Schema.Struct({
      pastWeeks: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 104 })),
      futureWeeks: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 156 })),
    }),
    default: { pastWeeks: 52, futureWeeks: 104 },
    label: "Sync window",
  },
});
