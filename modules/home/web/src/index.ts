import { defineWebModule, type WebModule } from "@otterware/module-kit/web";
import { HouseIcon } from "lucide-react";

/** The host supplies the lazy page until its shared UI kit can move out of apps/web. */
export const createHomeWebModule = (page: WebModule["page"]) =>
  defineWebModule({
    id: "home",
    label: "Home",
    icon: HouseIcon,
    rail: { position: "start", order: 0 },
    page,
    settings: null,
    commands: [],
    searchTerms: ["home", "today", "inbox", "needs you", "agents"],
    serverModule: "home",
    sideChat: false,
  });
