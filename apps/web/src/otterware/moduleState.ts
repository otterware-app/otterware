/**
 * Module state on an environment (`modules.list`, `modules.setEnabled`): the
 * Settings › Modules toggles and the "is this module on here?" check every
 * module page makes. Without a paired environment, this browser's. A remote environment may be a plain Otter Code server
 * that knows neither method; pages show a calm state then.
 */
import { HOST_METHODS, type ModuleStateEntry } from "@otterware/module-kit/contracts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";

import * as Effect from "effect/Effect";

import { connectionAtomRuntime } from "../connection/runtime";
import { useEnvironmentQuery } from "../state/query";
import { isThisBrowser, useModuleEnvironmentId } from "./browser/moduleEndpoint";
import { browserAtomRuntime, browserClient } from "./browser/runtime";

const modulesListQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:otterware:modules-list",
  tag: HOST_METHODS.modulesList,
  staleTimeMs: 5_000,
  refreshIntervalMs: 5_000,
  idleTtlMs: 5 * 60_000,
});

/** This browser's modules, for the same views. */
const browserModulesList = browserAtomRuntime.atom(
  Effect.flatMap(browserClient, (client) => client[HOST_METHODS.modulesList]({})),
);

export const setModuleEnabled = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:otterware:modules-set-enabled",
  tag: HOST_METHODS.modulesSetEnabled,
});

export type ModuleStatesView =
  | { readonly status: "loading" }
  /** The environment runs no module runtime (a plain Otter Code server, or unreachable). */
  | { readonly status: "unavailable" }
  | {
      readonly status: "available";
      readonly modules: ReadonlyArray<ModuleStateEntry>;
      readonly refresh: () => void;
    };

export function useModuleStates(environmentId: EnvironmentId | null): ModuleStatesView {
  const query = useEnvironmentQuery(
    environmentId === null
      ? null
      : isThisBrowser(environmentId)
        ? browserModulesList
        : modulesListQuery({ environmentId, input: {} }),
  );
  if (query.data !== null) {
    return { status: "available", modules: query.data.modules, refresh: query.refresh };
  }
  if (environmentId === null || query.error === null) return { status: "loading" };
  return { status: "unavailable" };
}

/**
 * Whether the environment module pages use (a paired one, else this browser)
 * runs a server module right now. `on` for
 * client-only pages (`serverModule: null`); `not-installed` when the server's
 * profile lacks it; `no-modules` on a plain Otter Code server.
 */
export type ServerModuleAvailability =
  | "loading"
  | "on"
  | "off"
  | "failed"
  | "not-installed"
  | "no-modules";

export function useServerModuleAvailability(moduleId: string | null): ServerModuleAvailability {
  const environmentId = useModuleEnvironmentId();
  const states = useModuleStates(moduleId === null ? null : environmentId);
  if (moduleId === null) return "on";
  if (states.status === "loading") return "loading";
  if (states.status === "unavailable") return "no-modules";
  const entry = states.modules.find((module) => module.id === moduleId);
  return entry === undefined ? "not-installed" : entry.state;
}
