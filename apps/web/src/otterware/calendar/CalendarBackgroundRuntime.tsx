import { CalendarNotifications } from "@otterware/composition/web/calendar/notifications";
import { CalendarEnvironmentProvider } from "./rpc";

/** Owns the reminder feed independently of page and settings visits. */
export function CalendarBackgroundRuntime() {
  return (
    <CalendarEnvironmentProvider>
      <CalendarNotifications>{null}</CalendarNotifications>
    </CalendarEnvironmentProvider>
  );
}

export default CalendarBackgroundRuntime;
