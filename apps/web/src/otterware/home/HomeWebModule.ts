import { createHomeWebModule } from "@otterware/composition/web";
import { lazy } from "react";

import { useHomeHeaderActions, useHomeSidebarSections } from "./homeShell";

export const HomeWebModule = createHomeWebModule({
  page: lazy(() => import("./HomePage")),
  useSidebar: useHomeSidebarSections,
  useHeaderActions: useHomeHeaderActions,
});
