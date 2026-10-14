import type { WebModule } from "@otterware/module-kit/web";
import { Suspense } from "react";

import { useServerModuleAvailability } from "./moduleState";
import { moduleRegistry } from "./registry";

function ModuleBackgroundRuntime({ module }: { readonly module: WebModule }) {
  const availability = useServerModuleAvailability(module.serverModule);
  const Runtime = module.backgroundRuntime;
  if (availability !== "on" || Runtime === undefined) return null;
  return (
    <Suspense fallback={null}>
      <Runtime />
    </Suspense>
  );
}

/** Profile modules run even before their page is visited, and stop when the server turns off. */
export function ModuleBackgroundRuntimes() {
  return moduleRegistry.modules
    .filter((module) => module.backgroundRuntime !== undefined)
    .map((module) => <ModuleBackgroundRuntime key={module.id} module={module} />);
}
