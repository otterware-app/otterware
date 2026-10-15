/**
 * The host side of module-kit, composed for one data home: `suite.sqlite`,
 * the migrations of every module (on or off), the persisted on/off choices,
 * and the runtime that opens and closes module layers. The composition
 * package calls this with the active profile's modules; the server provides
 * the host ports (`HostPorts.ts`) and its own services underneath.
 */
import * as Layer from "effect/Layer";

import type { ServerModule } from "../engine/ServerModule.ts";
import { layerRuntime } from "./RuntimeLayer.ts";
import * as SuiteDatabase from "./SuiteDatabase.ts";

export { layerMigrations, layerRuntime } from "./RuntimeLayer.ts";

/** Opens `<stateDir>/suite.sqlite` and runs the modules on it. */
export const layer = <R = never>(input: {
  readonly stateDir: string;
  readonly modules: ReadonlyArray<ServerModule>;
}) =>
  layerRuntime<R>(input.modules).pipe(
    Layer.provideMerge(SuiteDatabase.layerFromStateDir(input.stateDir)),
  );
