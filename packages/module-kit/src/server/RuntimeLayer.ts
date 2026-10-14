/**
 * The portable host side of module-kit: the migrations of every module (on
 * or off), the persisted on/off choices, and the runtime that opens and
 * closes module layers, over an already-open `SuiteSqlClient`. An environment
 * opens that client on `suite.sqlite` (`HostLayer.ts`); the in-browser
 * environment on SQLite in WASM (ADR 0008).
 */
import * as AgentInstructions from "../agent-instructions/index.ts";
import * as Layer from "effect/Layer";

import type { ServerModule } from "../engine/ServerModule.ts";
import * as ModuleRuntime from "./ModuleRuntime.ts";
import * as ModuleStateStore from "./ModuleStateStore.ts";
import { layerSqlClient } from "./SuiteSqlClient.ts";
import { runSuiteMigrations } from "./SuiteMigrations.ts";

/** Everything that must run against suite.sqlite before a module starts. */
export const layerMigrations = (modules: ReadonlyArray<ServerModule>) =>
  Layer.effectDiscard(
    runSuiteMigrations([
      ...ModuleStateStore.HOST_MIGRATIONS,
      ...modules.flatMap((module) => module.migrations),
    ]),
  ).pipe(Layer.provide(layerSqlClient));

/**
 * The runtime over an already-open `SuiteSqlClient` (a real file, SQLite in
 * WASM, or `SuiteDatabase.layerMemory` in tests). `R` is what the modules'
 * layers need from the host.
 */
export const layerRuntime = <R = never>(modules: ReadonlyArray<ServerModule>) =>
  ModuleRuntime.layer<R>(modules).pipe(
    Layer.provideMerge(AgentInstructions.layer),
    Layer.provide(ModuleStateStore.layer.pipe(Layer.provide(layerSqlClient))),
    Layer.provide(layerMigrations(modules)),
  );
