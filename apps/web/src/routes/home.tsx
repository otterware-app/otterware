import { createFileRoute } from "@tanstack/react-router";

import { ModuleRouteComponent, requireModuleRouteAuth } from "../otterware/moduleRoute";

export const Route = createFileRoute("/home")({
  beforeLoad: requireModuleRouteAuth,
  component: ModuleRouteComponent,
});
