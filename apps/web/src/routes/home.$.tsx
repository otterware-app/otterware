import { createFileRoute } from "@tanstack/react-router";

import { ModuleRouteComponent } from "../otterware/moduleRoute";

/** Sub-paths of Home (`/home/<subpath>`); the page reads them from the location. */
export const Route = createFileRoute("/home/$")({
  component: ModuleRouteComponent,
});
