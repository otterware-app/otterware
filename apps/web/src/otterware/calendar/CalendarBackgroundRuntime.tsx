import { useCalendarKeybindingMigration } from "./useCalendarKeybindingMigration";
import { useEffect } from "react";
import { CalendarNotifications } from "./ui/CalendarNotifications";
import { useCalendarClient } from "./ui/host";
import { setCalendarCache, cacheCalendarRange, useCalendarStore } from "./ui/calendarStore";
import { CalendarEnvironmentProvider } from "./rpc";

const emptyWeeks: readonly string[] = [];
function CalendarDataRuntime() {
  const client = useCalendarClient();
  const environment = client.environmentId;
  const weeks = useCalendarStore((state) =>
    environment ? (state.caches[environment]?.weeks ?? emptyWeeks) : emptyWeeks,
  );
  const { directory, canWrite, error } = client.useDirectory();
  const events = client.useWeeks(weeks);
  useCalendarKeybindingMigration(directory?.preferences.shortcuts);
  useEffect(() => {
    useCalendarStore.setState({
      transport: client,
      environment,
      canWrite,
      error: error ?? events.error,
      loading: events.loading,
    });
    if (environment && directory) setCalendarCache(environment, { directory });
  }, [client, environment, directory, canWrite, error, events.error, events.loading]);
  useEffect(() => {
    if (environment && !events.loading && !events.error)
      cacheCalendarRange(environment, weeks, events.instances);
  }, [environment, weeks, events.instances, events.loading, events.error]);
  return <CalendarNotifications>{null}</CalendarNotifications>;
}
export default function CalendarBackgroundRuntime() {
  return (
    <CalendarEnvironmentProvider runtime>
      <CalendarDataRuntime />
    </CalendarEnvironmentProvider>
  );
}
