/**
 * The server side of this build: the active profile's modules and the layers
 * the host wires in at its seams (`apps/server/src/otterware/`). This is the
 * only place that imports module engines.
 */
import { CalendarModule } from "@otterware/calendar-engine";
import { calendarNodeModule } from "@otterware/calendar-node";
import { MailModule } from "@otterware/mail-engine/module";
import { mailNodeModule } from "@otterware/mail-node";
import { HomeModule } from "@otterware/home-engine";
import type { ServerModule, ServerModuleRequirements } from "@otterware/module-kit/engine";
import { HostLayer, layerRpcHandlers as moduleKitRpcHandlers } from "@otterware/module-kit/server";
import type { AppProfile } from "@otterware/profiles";
import { activeProfile } from "@otterware/profiles/active";

import { type KnownModuleId, OtterwareRpcGroup, selectModuleIds } from "./contracts.ts";

/** Every module engine this repository knows. A new module adds one line. */
export const SERVER_MODULES = {
  home: HomeModule,
  mail: MailModule,
  calendar: CalendarModule,
} as const satisfies Record<KnownModuleId, ServerModule>;

/** What the host must provide beneath the module runtime, for every known module. */
export type ServerModulesRequirements = ServerModuleRequirements<
  (typeof SERVER_MODULES)[KnownModuleId]
>;

export const selectServerModules = (profile: AppProfile): ReadonlyArray<ServerModule> =>
  selectModuleIds(profile).map((id) => SERVER_MODULES[id]);

export const activeServerModules = selectServerModules(activeProfile);

/** `suite.sqlite`, migrations and the module runtime for this data home. */
export const layer = (stateDir: string) =>
  HostLayer.layer<ServerModulesRequirements>({
    stateDir,
    modules: activeServerModules.map((module) =>
      module.contract.id === "calendar"
        ? calendarNodeModule(stateDir)
        : module.contract.id === "mail"
          ? mailNodeModule({ stateDir, profile: activeProfile.id })
          : module,
    ),
  });

/** Handlers for the host and module RPCs merged into `WsRpcGroup`. */
export const layerRpcHandlers = () => moduleKitRpcHandlers(OtterwareRpcGroup);

export { registerModuleTools } from "@otterware/module-kit/server";
export { ACTIVE_MODULE_IDS, OtterwareRpcGroup } from "./contracts.ts";
