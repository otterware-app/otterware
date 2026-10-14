export { default as CalendarPage } from "./CalendarPage.tsx";
export { default as CalendarSettings } from "./CalendarSettings.tsx";
export { CalendarClientProvider, type CalendarWebClient } from "./host.tsx";
export {
  calendarNotificationsStream,
  calendarConnectStream,
  createCalendarAtoms,
} from "@otterware/composition/calendar-rpc";

export { CalendarNotifications } from "./CalendarNotifications.tsx";
export {
  applyCalendarWeekEvent,
  EMPTY_CALENDAR_INSTANCES,
} from "@otterware/composition/calendar-rpc";
