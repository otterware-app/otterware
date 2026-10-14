import type { CalendarReminderNotification } from "./calendar.ts";

export const CALENDAR_DESKTOP_CHANNELS = {
  receiveGoogleCallback: "otterware:calendar:google-callback",
  cancelGoogleCallback: "otterware:calendar:cancel-google-callback",
  showReminder: "otterware:calendar:show-reminder",
  openReminder: "otterware:calendar:open-reminder",
} as const;
export type CalendarDesktopReminder = {
  environmentId: string;
  reminder: CalendarReminderNotification;
};
export interface CalendarDesktopBridge {
  receiveGoogleCallback: (authorizationUrl: string) => Promise<string>;
  cancelGoogleCallback: (authorizationUrl: string) => Promise<void>;
  showReminder: (input: CalendarDesktopReminder) => Promise<boolean>;
  onOpenReminder: (listener: (input: CalendarDesktopReminder) => void) => () => void;
}

/** Absolute times stay accurate when a newly connected client replays a recent reminder. */
export function calendarReminderBody(reminder: CalendarReminderNotification) {
  const formatter = new Intl.DateTimeFormat(undefined, {
    timeZone: reminder.timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(!reminder.allDay
      ? { hour: "numeric" as const, minute: "2-digit" as const, timeZoneName: "short" as const }
      : {}),
  });
  return `${reminder.allDay ? "All-day event on" : "Starts"} ${formatter.format(reminder.start)}`;
}
