/**
 * The web registry of this build's modules (docs/internals/modules.md): the
 * active profile's modules that have pages here, in rail order. The shell
 * (`AppSidebarLayout`, `SpaceRail`, `CommandPalette`, Settings) reads this one
 * registry through its seams; modules never edit those files.
 */
import { type WebModule } from "@otterware/module-kit/web";
import type { ModuleId } from "@otterware/profiles";
import { activeProfile } from "@otterware/profiles/active";

import { MailWebModule } from "./mail/MailWebModule";
import { HomeWebModule } from "./home/HomeWebModule";
import { CalendarWebModule } from "./calendar/CalendarWebModule";
import { DriveWebModule } from "./drive/DriveWebModule";

/** Every module page this repository knows. A new module adds one line. */
const WEB_MODULES = {
  home: HomeWebModule,
  calendar: CalendarWebModule,
  mail: MailWebModule,
  drive: DriveWebModule,
} as const satisfies Partial<Record<ModuleId, WebModule>>;

export type KnownWebModuleId = keyof typeof WEB_MODULES;

const isKnownWebModuleId = (id: string): id is KnownWebModuleId => Object.hasOwn(WEB_MODULES, id);

import { composeWebModules } from "@otterware/composition/web";

export const moduleRegistry = composeWebModules(
  activeProfile.modules.filter(isKnownWebModuleId).map((id) => WEB_MODULES[id]),
);
