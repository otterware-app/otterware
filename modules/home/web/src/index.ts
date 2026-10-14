import { defineWebModule, type WebModule } from "@otterware/module-kit/web";
import { HouseIcon } from "lucide-react";

/**
 * Home's registration. The host supplies the page and the sidebar and header
 * hooks until its shared UI kit and client state can move out of apps/web
 * (docs/internals/modules.md). Home has no spaces: it sits above the switcher.
 */
export const createHomeWebModule = (
  shell: Pick<WebModule, "page" | "useSidebar" | "useHeaderActions">,
) =>
  defineWebModule({
    id: "home",
    label: "Home",
    icon: HouseIcon,
    ...shell,
    settings: [],
    commands: [],
    searchTerms: ["home", "today", "inbox", "needs you", "agents", "projects"],
    serverModule: "home",
    sideChat: false,
  });
