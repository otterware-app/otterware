/** Home on the web: the day across the installed modules. The page lives in `HomePage.tsx`. */
import { defineWebModule } from "@otterware/module-kit/web";
import { HouseIcon } from "lucide-react";
import { lazy } from "react";

export const HomeWebModule = defineWebModule({
  id: "home",
  label: "Home",
  icon: HouseIcon,
  rail: { position: "start", order: 0 },
  page: lazy(() => import("./HomePage")),
  settings: null,
  commands: [],
  searchTerms: ["home", "today", "inbox", "needs you", "agents"],
  serverModule: "home",
  // Home has its own composer and right column, so it leaves the side chat out.
  sideChat: false,
});
