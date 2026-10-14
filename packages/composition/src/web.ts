export { createHomeWebModule } from "@otterware/home-web";
import { createModuleRegistry, type WebModule } from "@otterware/module-kit/web";
import { activeProfile } from "@otterware/profiles/active";
import type { AppProfile } from "@otterware/profiles";
export { createCalendarWebModule } from "@otterware/calendar-web/registration";
export { createDriveWebModule } from "@otterware/drive-web/registration";
export { createDriveThreadLinkAtoms } from "@otterware/drive-web/rpc";

/** UI registrations live in the web host until its UI kit is extracted (ADR 0013). */
export const composeWebModules = (
  modules: ReadonlyArray<WebModule>,
  profile: AppProfile = activeProfile,
) =>
  createModuleRegistry(modules.filter((module) => profile.modules.some((id) => id === module.id)));
