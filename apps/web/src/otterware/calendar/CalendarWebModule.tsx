import {
  CalendarWebModule as moduleDefinition,
  CalendarPage,
  CalendarSettings,
} from "@otterware/composition/web";
import type { ModulePageProps } from "@otterware/module-kit/web";
import { lazy } from "react";
import { CalendarEnvironmentProvider } from "./rpc";

export const CalendarWebModule = {
  ...moduleDefinition,
  page: lazy(async () => ({
    default: (props: ModulePageProps) => (
      <CalendarEnvironmentProvider>
        <CalendarPage {...props} />
      </CalendarEnvironmentProvider>
    ),
  })),
  settings: {
    ...moduleDefinition.settings,
    component: lazy(async () => ({
      default: () => (
        <CalendarEnvironmentProvider>
          <CalendarSettings />
        </CalendarEnvironmentProvider>
      ),
    })),
  },
};
