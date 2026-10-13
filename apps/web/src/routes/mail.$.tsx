import { createFileRoute } from "@tanstack/react-router";

import { ModuleRouteComponent } from "../otterware/moduleRoute";

/** Sub-paths of Mail (`/mail/<subpath>`); the page reads them from the location. */
export const Route = createFileRoute("/mail/$")({
  component: ModuleRouteComponent,
});
