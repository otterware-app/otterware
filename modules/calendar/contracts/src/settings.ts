import { defineModuleSettings } from "@otterware/module-kit/contracts";
import * as Schema from "effect/Schema";
import {
  CalendarId,
  CalendarShortcuts,
  DEFAULT_CALENDAR_SHORTCUTS,
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
  watchOnlyCalendars: {
    scope: "account",
    schema: Schema.Array(CalendarId),
    default: [],
    label: "Watch-only calendars",
  },
  visibleCalendars: {
    scope: "account",
    schema: Schema.Array(CalendarId),
    default: [],
    label: "Visible calendars",
  },
  shortcuts: {
    scope: "account",
    schema: CalendarShortcuts,
    default: DEFAULT_CALENDAR_SHORTCUTS,
    label: "Calendar shortcuts",
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
