import { createFileRoute } from "@tanstack/react-router";

import { ModuleRouteComponent, requireModuleRouteAuth } from "../otterware/moduleRoute";

export const Route = createFileRoute("/calendar")({
  beforeLoad: requireModuleRouteAuth,
  component: ModuleRouteComponent,
});
