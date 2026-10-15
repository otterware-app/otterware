/**
 * What modules show about a Code thread (`WebModule.threadAccessory`), such as
 * Drive's linked documents: over a full thread's conversation (one seam in
 * `ChatView`) and in a module page's side chat. A module's accessory renders
 * only while its server module is on for the thread's environment.
 */
import { type ModuleThreadAccessoryProps, type WebModule } from "@otterware/module-kit/web";
import { EnvironmentId } from "@t3tools/contracts";
import { Suspense } from "react";

import { cn } from "../lib/utils";
import { useModuleStates } from "./moduleState";
import { moduleRegistry } from "./registry";

function ModuleAccessory({
  module,
  ...props
}: ModuleThreadAccessoryProps & {
  readonly module: (typeof moduleRegistry.threadAccessories)[number];
}) {
  const Accessory = module.threadAccessory;
  return (
    <Suspense fallback={null}>
      <Accessory {...props} />
    </Suspense>
  );
}

// Threads live on an environment, so an accessory needs its module running
// there even when the module's page works without one (Drive's).
const isOn = (states: ReturnType<typeof useModuleStates>, module: WebModule) => {
  const serverModule = module.serverModule ?? module.id;
  return (
    states.status === "available" &&
    states.modules.some((entry) => entry.id === serverModule && entry.state === "on")
  );
};

export function ModuleThreadAccessories({
  className,
  ...props
}: ModuleThreadAccessoryProps & { readonly className?: string }) {
  const states = useModuleStates(
    moduleRegistry.threadAccessories.length === 0 ? null : EnvironmentId.make(props.environmentId),
  );
  const modules = moduleRegistry.threadAccessories.filter((module) => isOn(states, module));
  if (modules.length === 0) return null;
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {modules.map((module) => (
        <ModuleAccessory key={module.id} module={module} {...props} />
      ))}
    </div>
  );
}
