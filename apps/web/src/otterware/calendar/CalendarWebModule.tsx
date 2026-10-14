import { CalendarWebModule as moduleDefinition } from "@otterware/composition/web";
import type { ModulePageProps } from "@otterware/module-kit/web";
import { lazy } from "react";
import { useLocation } from "@tanstack/react-router";

export const CalendarWebModule = {
  ...moduleDefinition,
  stores: [
    { id: "calendar.notifications", runtime: lazy(() => import("./CalendarBackgroundRuntime")) },
  ],
  page: lazy(async () => {
    const [{ CalendarPage }, { CalendarEnvironmentProvider }] = await Promise.all([
      import("@otterware/composition/web/calendar/page"),
      import("./rpc"),
    ]);
    return {
      default: function CalendarHostPage(props: ModulePageProps) {
        const search = useLocation({ select: (location) => location.searchStr });
        return (
          <CalendarEnvironmentProvider>
            <CalendarPage {...props} search={search} />
          </CalendarEnvironmentProvider>
        );
      },
    };
  }),
  settings: moduleDefinition.settings.map((page) => ({
    ...page,
    component: lazy(async () => {
      const [{ CalendarSettings }, { CalendarEnvironmentProvider }] = await Promise.all([
        import("@otterware/composition/web/calendar/settings"),
        import("./rpc"),
      ]);
      return {
        default: function CalendarHostSettings() {
          return (
            <CalendarEnvironmentProvider>
              <CalendarSettings />
            </CalendarEnvironmentProvider>
          );
        },
      };
    }),
  })),
};
