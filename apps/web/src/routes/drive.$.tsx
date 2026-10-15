import { createFileRoute } from "@tanstack/react-router";

import { ModuleRouteComponent } from "../otterware/moduleRoute";

export const Route = createFileRoute("/drive/$")({
  component: ModuleRouteComponent,
});
