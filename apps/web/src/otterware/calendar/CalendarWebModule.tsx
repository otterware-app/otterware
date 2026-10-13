import { CalendarWebModule as moduleDefinition } from "@otterware/composition/web";
import type { ModulePageProps } from "@otterware/module-kit/web";
import { lazy } from "react";
import { useLocation } from "@tanstack/react-router";
import { ModulePageLayout } from "../ModulePageLayout";

export const CalendarWebModule = {
  ...moduleDefinition,
  backgroundRuntime: lazy(() => import("./CalendarBackgroundRuntime")),
  page: lazy(async () => {
    const [{ CalendarPage }, { CalendarEnvironmentProvider }] = await Promise.all([
      import("@otterware/composition/web/calendar/page"),
      import("./rpc"),
    ]);
    return {
      default: function CalendarHostPage(props: ModulePageProps) {
        const search = useLocation({ select: (location) => location.searchStr });
        return (
          <ModulePageLayout moduleId="calendar">
            <CalendarEnvironmentProvider>
              <CalendarPage {...props} search={search} />
            </CalendarEnvironmentProvider>
          </ModulePageLayout>
        );
      },
    };
  }),
  settings: {
    ...moduleDefinition.settings,
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
  },
};
