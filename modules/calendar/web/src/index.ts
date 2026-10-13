export { CalendarWebModule } from "./CalendarWebModule.ts";
export { default as CalendarPage } from "./CalendarPage.tsx";
export { default as CalendarSettings } from "./CalendarSettings.tsx";
export { CalendarClientProvider, type CalendarWebClient } from "./host.tsx";
export {
  calendarNotificationsStream,
  calendarConnectStream,
  createCalendarAtoms,
} from "./rpc/index.ts";

export { CalendarNotifications } from "./CalendarNotifications.tsx";
