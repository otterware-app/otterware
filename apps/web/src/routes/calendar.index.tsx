import { createFileRoute } from "@tanstack/react-router";

import { ModuleRouteComponent } from "../otterware/moduleRoute";

export const Route = createFileRoute("/calendar/")({
  component: ModuleRouteComponent,
});
