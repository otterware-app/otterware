/**
 * The in-browser environment's modules (ADR 0008): the engines that run in
 * the browser's worker, for the active profile. Like `server.ts`, this is
 * the only place the browser imports module engines; the worker provides the
 * host ports declared here.
 */
import {
  AccountGoogleAuth,
  accountSessionLayer,
  type CalendarAccountCredential,
  GoogleAuthUnavailable,
  makeCalendarModule,
} from "@otterware/calendar-engine";
import { HomeModule } from "@otterware/home-engine";
import type { ServerModule, ServerModuleRequirements } from "@otterware/module-kit/engine";
import type { AppProfile } from "@otterware/profiles";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type * as Option from "effect/Option";
import * as Layer from "effect/Layer";

import { type BrowserModuleId, selectBrowserModuleIds } from "./browserContracts.ts";

/**
 * The browser's Otter Account, as engines that exchange it themselves need it
 * (ADR 0018): none while signed out. `purpose` names the engine, so each gets
 * its own Cloud audience on this browser.
 */
export class BrowserAccountCredential extends Context.Service<
  BrowserAccountCredential,
  {
    readonly read: (purpose: string) => Effect.Effect<Option.Option<CalendarAccountCredential>>;
  }
>()("@otterware/composition/browser/BrowserAccountCredential") {}

const credential = (purpose: string) =>
  Effect.gen(function* () {
    const account = yield* BrowserAccountCredential;
    return yield* account.read(purpose);
  });

/** Calendar on account-held Google connections; the browser has no local sign-in. */
const BrowserCalendarModule = makeCalendarModule(
  AccountGoogleAuth.layer.pipe(
    Layer.provide(GoogleAuthUnavailable.layer),
    Layer.provideMerge(accountSessionLayer(credential("calendar"))),
  ),
);

/** Every engine the browser runs. A module that runs in the browser adds one line. */
export const BROWSER_MODULES = {
  home: HomeModule,
  calendar: BrowserCalendarModule,
} as const satisfies Record<BrowserModuleId, ServerModule>;

/** What the browser host must provide beneath the module runtime. */
export type BrowserModulesRequirements = ServerModuleRequirements<
  (typeof BROWSER_MODULES)[BrowserModuleId]
>;

export const selectBrowserModules = (profile: AppProfile): ReadonlyArray<ServerModule> =>
  selectBrowserModuleIds(profile).map((id) => BROWSER_MODULES[id]);

export { composeBrowserContracts, type BrowserModuleId } from "./browserContracts.ts";
