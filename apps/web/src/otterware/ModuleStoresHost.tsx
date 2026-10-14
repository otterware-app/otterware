/**
 * Mounts every module's client stores (`WebModule.stores`) once, above the
 * routes, while the module is on in the environment module pages use. Stores
 * run independently of page visits (sync, badges, notifications) and stop
 * when the server turns the module off.
 */
import type { WebModule, WebModuleStore } from "@otterware/module-kit/web";
import { Suspense } from "react";

import { useServerModuleAvailability } from "./moduleState";
import { moduleRegistry } from "./registry";

function ModuleStores({ module }: { readonly module: WebModule }) {
  const availability = useServerModuleAvailability(module.serverModule);
  if (availability !== "on") return null;
  return (module.stores ?? []).map((store: WebModuleStore) => {
    const Runtime = store.runtime;
    return (
      <Suspense key={store.id} fallback={null}>
        <Runtime />
      </Suspense>
    );
  });
}

export function ModuleStoresHost() {
  return moduleRegistry.modules
    .filter((module) => (module.stores?.length ?? 0) > 0)
    .map((module) => <ModuleStores key={module.id} module={module} />);
}
