import { CalendarWebModule as moduleDefinition } from "@otterware/composition/web";
import type { ModulePageProps } from "@otterware/module-kit/web";
import { lazy } from "react";
import { ModulePageLayout } from "../ModulePageLayout";

export const CalendarWebModule = {
  ...moduleDefinition,
  page: lazy(async () => {
    const [{ CalendarPage }, { CalendarEnvironmentProvider }] = await Promise.all([
      import("@otterware/composition/web/calendar"),
      import("./rpc"),
    ]);
    return {
      default: (props: ModulePageProps) => (
        <ModulePageLayout moduleId="calendar">
          <CalendarEnvironmentProvider>
            <CalendarPage {...props} />
          </CalendarEnvironmentProvider>
        </ModulePageLayout>
      ),
    };
  }),
  settings: {
    ...moduleDefinition.settings,
    component: lazy(async () => {
      const [{ CalendarSettings }, { CalendarEnvironmentProvider }] = await Promise.all([
        import("@otterware/composition/web/calendar"),
        import("./rpc"),
      ]);
      return {
        default: () => (
          <CalendarEnvironmentProvider>
            <CalendarSettings />
          </CalendarEnvironmentProvider>
        ),
      };
    }),
  },
};
