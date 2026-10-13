/**
 * What the in-browser environment speaks over its message port (ADR 0008):
 * the host RPCs and the RPC groups of the profile's modules that run in the
 * browser, the same contracts an environment serves over its WebSocket, plus
 * the browser's own Account group and its light agent loop (ADR 0009). No projects, threads or projections.
 * Pages build their client from this.
 */
import { composeBrowserContracts } from "@otterware/composition/browser-contracts";
import { activeProfile } from "@otterware/profiles/active";

import { BrowserAccountRpcGroup } from "./account/contracts.ts";
import { BrowserAgentRpcGroup } from "./agent/contracts.ts";

export * from "./account/contracts.ts";
export * from "./agent/contracts.ts";

const composed = composeBrowserContracts(activeProfile);

/** The modules this build's browser environment runs, in profile order. */
export const BROWSER_ENVIRONMENT_MODULE_IDS = composed.moduleIds;

/** Host and module RPCs: the part an environment serves too. */
export const BrowserModulesRpcGroup = composed.group;

export const BrowserEnvironmentRpcGroup = BrowserModulesRpcGroup.merge(
  BrowserAccountRpcGroup,
  BrowserAgentRpcGroup,
);
