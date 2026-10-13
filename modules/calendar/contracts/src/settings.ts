import { defineModuleSettings } from "@otterware/module-kit/contracts";
import * as Schema from "effect/Schema";
import {
  CalendarId,
  CalendarNotificationRules,
  CalendarEnvironmentPreferences,
} from "./calendar.ts";

export const CalendarSettings = defineModuleSettings({
  defaultCalendarId: {
    scope: "account",
    schema: Schema.NullOr(CalendarId),
    default: null,
    label: "Default calendar",
  },
  weekStartsOn: {
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
    schema: CalendarNotificationRules,
    default: [],
    label: "Event reminders",
  },
  syncWindow: {
    scope: "environment",
    schema: CalendarEnvironmentPreferences.fields.syncWindow,
    default: { pastWeeks: 52, futureWeeks: 104 },
    label: "Sync window",
  },
});
