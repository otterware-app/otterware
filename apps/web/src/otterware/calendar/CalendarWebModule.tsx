import { CalendarWebModule as moduleDefinition } from "@otterware/composition/web";
import type { ModulePageProps } from "@otterware/module-kit/web";
import { lazy } from "react";
import { useLocation } from "@tanstack/react-router";
import { ModulePageLayout } from "../ModulePageLayout";
import { CalendarEnvironmentProvider } from "./rpc";

export const CalendarWebModule = {
  ...moduleDefinition,
  page: lazy(async () => {
    const { CalendarPage } = await import("@otterware/composition/web/calendar");
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
      const { CalendarSettings } = await import("@otterware/composition/web/calendar");
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

export function CalendarBackgroundRuntime() {
  return <CalendarEnvironmentProvider>{null}</CalendarEnvironmentProvider>;
}
