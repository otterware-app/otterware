import {
  makeCalendarModule,
  accountSessionLayer,
  AccountGoogleAuth,
} from "@otterware/calendar-engine";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as GoogleAuthLive from "./GoogleAuthLive.ts";
import * as CalendarSecretStore from "./CalendarSecretStore.ts";
import { CalendarAccountCredentialHost } from "./CalendarAccountCredential.ts";

export const calendarNodeModule = (stateDir: string) => {
  const local = GoogleAuthLive.layer.pipe(Layer.provide(CalendarSecretStore.layer(stateDir)));
  const credential = Effect.gen(function* () {
    const host = yield* Effect.serviceOption(CalendarAccountCredentialHost);
    return Option.isSome(host) ? yield* host.value.read : Option.none();
  });
  const cloud = accountSessionLayer(credential);
  return makeCalendarModule(
    AccountGoogleAuth.layer.pipe(Layer.provide(local), Layer.provideMerge(cloud)),
  );
};
export { CalendarAccountCredentialHost };
