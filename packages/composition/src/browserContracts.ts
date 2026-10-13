/**
 * The wire surface of the in-browser environment (ADR 0008): the host RPCs
 * plus the contracts of the profile's modules whose engines run in a browser.
 * Typed as the same superset as an environment's group, so module pages call
 * one client type whichever environment answers. Imports neither engines nor
 * the upstream WebSocket group, so the worker and pages stay small.
 */
import { CalendarContract } from "@otterware/calendar-contracts";
import { HomeContract } from "@otterware/home-contracts";
import { MailContract } from "@otterware/mail-contracts/rpc";
import { HostContract, type AnyModuleContract } from "@otterware/module-kit/contracts";
import type { AppProfile } from "@otterware/profiles";

import type { composeContracts } from "./contracts.ts";

/**
 * Modules whose engine runs in the browser. Drive's client talks to Otter
 * Cloud directly and needs no engine here.
 */
export const BROWSER_MODULE_CONTRACTS = {
  home: HomeContract,
  mail: MailContract,
  calendar: CalendarContract,
} as const satisfies Record<string, AnyModuleContract>;

export type BrowserModuleId = keyof typeof BROWSER_MODULE_CONTRACTS;

const isBrowserModuleId = (id: string): id is BrowserModuleId => id in BROWSER_MODULE_CONTRACTS;

/** The profile's modules the browser runs, in profile order. */
export const selectBrowserModuleIds = (profile: AppProfile): ReadonlyArray<BrowserModuleId> =>
  profile.modules.filter(isBrowserModuleId);

type Superset = ReturnType<typeof composeContracts>;

/** Host RPCs plus the browser's modules, typed as an environment's superset group. */
export const composeBrowserContracts = (profile: AppProfile) => {
  const moduleIds = selectBrowserModuleIds(profile);
  return {
    moduleIds,
    group: HostContract.group.merge(
      ...moduleIds.map((id) => BROWSER_MODULE_CONTRACTS[id].group),
    ) as Superset["group"],
  };
};
