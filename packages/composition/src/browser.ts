/**
 * The in-browser environment's modules (ADR 0008): the engines that run in
 * the browser's worker, for the active profile. Like `server.ts`, this is
 * the only place the browser imports module engines; the worker wires the
 * host services they need.
 */
import { CalendarModule } from "@otterware/calendar-engine";
import { HomeModule } from "@otterware/home-engine";
import type { ServerModule, ServerModuleRequirements } from "@otterware/module-kit/engine";
import type { AppProfile } from "@otterware/profiles";

import { type BrowserModuleId, selectBrowserModuleIds } from "./browserContracts.ts";

/** Every engine the browser runs. A module that runs in the browser adds one line. */
export const BROWSER_MODULES = {
  home: HomeModule,
  calendar: CalendarModule,
} as const satisfies Record<BrowserModuleId, ServerModule>;

/** What the browser host must provide beneath the module runtime. */
export type BrowserModulesRequirements = ServerModuleRequirements<
  (typeof BROWSER_MODULES)[BrowserModuleId]
>;

export const selectBrowserModules = (profile: AppProfile): ReadonlyArray<ServerModule> =>
  selectBrowserModuleIds(profile).map((id) => BROWSER_MODULES[id]);

export { composeBrowserContracts, type BrowserModuleId } from "./browserContracts.ts";
