/**
 * What the in-browser environment speaks over its message port (ADR 0008):
 * the host RPCs and the RPC groups of the profile's modules that run in the
 * browser, the same contracts an environment serves over its WebSocket. No
 * projects, threads or projections. Pages build their client from this.
 */
import { composeBrowserContracts } from "@otterware/composition/browser-contracts";
import { activeProfile } from "@otterware/profiles/active";

const composed = composeBrowserContracts(activeProfile);

/** The modules this build's browser environment runs, in profile order. */
export const BROWSER_ENVIRONMENT_MODULE_IDS = composed.moduleIds;

export const BrowserEnvironmentRpcGroup = composed.group;
