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

export function calendarReminderBody(reminder: CalendarReminderNotification) {
  const minutes = Math.max(0, Math.ceil((reminder.start - reminder.deliveredAt) / 60000));
  return minutes ? `Starts in ${minutes} minutes` : "Starts now";
}
