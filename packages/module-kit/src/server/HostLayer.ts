/**
 * The host side of module-kit, composed for one data home: `suite.sqlite`,
 * the migrations of every module (on or off), the persisted on/off choices,
 * and the runtime that opens and closes module layers. The composition
 * package calls this with the active profile's modules; the server provides
 * the host ports (`HostPorts.ts`) and its own services underneath.
 */
import * as Layer from "effect/Layer";

import type { ServerModule } from "../engine/ServerModule.ts";
import * as ModuleRuntime from "./ModuleRuntime.ts";
import * as ModuleStateStore from "./ModuleStateStore.ts";
import * as SuiteDatabase from "./SuiteDatabase.ts";
import { runSuiteMigrations } from "./SuiteMigrations.ts";

/** Everything that must run against suite.sqlite before a module starts. */
export const layerMigrations = (modules: ReadonlyArray<ServerModule>) =>
  Layer.effectDiscard(
    runSuiteMigrations([
      ...ModuleStateStore.HOST_MIGRATIONS,
      ...modules.flatMap((module) => module.migrations),
    ]),
  ).pipe(Layer.provide(SuiteDatabase.layerSqlClient));

/**
 * The runtime over an already-open `SuiteSqlClient` (a real file or
 * `SuiteDatabase.layerMemory` in tests). `R` is what the modules' layers need
 * from the host.
 */
export const layerRuntime = <R = never>(modules: ReadonlyArray<ServerModule>) =>
  ModuleRuntime.layer<R>(modules).pipe(
    Layer.provide(ModuleStateStore.layer.pipe(Layer.provide(SuiteDatabase.layerSqlClient))),
    Layer.provide(layerMigrations(modules)),
  );

/** Opens `<stateDir>/suite.sqlite` and runs the modules on it. */
export const layer = <R = never>(input: {
  readonly stateDir: string;
  readonly modules: ReadonlyArray<ServerModule>;
}) =>
  layerRuntime<R>(input.modules).pipe(
    Layer.provideMerge(SuiteDatabase.layerFromStateDir(input.stateDir)),
  );
