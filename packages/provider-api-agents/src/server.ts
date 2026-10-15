/**
 * The environment's entry: the three API agent drivers the server registers.
 * Node-only wiring (file storage, process fetch) lives here; everything a
 * browser loop can reuse is under `./protocol`.
 *
 * @module provider-api-agents/server
 */
export {
  HermesDriver,
  OpenClawDriver,
  OpenRouterDriver,
  type ApiAgentDriverEnv,
} from "./server/driver.ts";

import { HermesDriver, OpenClawDriver, OpenRouterDriver } from "./server/driver.ts";

/** The API agent drivers, in presentation order. */
export const API_AGENT_DRIVERS = [OpenRouterDriver, HermesDriver, OpenClawDriver] as const;
