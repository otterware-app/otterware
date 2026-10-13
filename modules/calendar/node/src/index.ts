import { makeCalendarModule } from "@otterware/calendar-engine";
import * as Layer from "effect/Layer";
import * as GoogleAuthLive from "./GoogleAuthLive.ts";
import * as CalendarSecretStore from "./CalendarSecretStore.ts";

export const calendarNodeModule = (stateDir: string) =>
  makeCalendarModule(GoogleAuthLive.layer.pipe(Layer.provide(CalendarSecretStore.layer(stateDir))));
