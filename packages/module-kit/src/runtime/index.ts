/**
 * The portable host side of module-kit (ADR 0008): what both an environment
 * and the in-browser environment run modules with. No Node imports; the
 * environment-only pieces (the `suite.sqlite` file, the data home lock, the
 * MCP server) stay in `./server`.
 */
export { AssistantProjectHost, HostHomeContributors } from "../server/HostPorts.ts";
export { layerRpcHandlers } from "../server/ModuleRpc.ts";
export * as ModuleRuntime from "../server/ModuleRuntime.ts";
export * as ModuleStateStore from "../server/ModuleStateStore.ts";
export {
  makeModuleToolDispatcher,
  refusal as moduleToolRefusal,
  type ModuleToolDescriptor,
  type ModuleToolDispatcher,
  type ModuleToolOutcome,
} from "../server/ModuleToolDispatch.ts";
export { layerMigrations, layerRuntime } from "../server/RuntimeLayer.ts";
export { layerSqlClient, SuiteSqlClient } from "../server/SuiteSqlClient.ts";
export { runSuiteMigrations, SuiteMigrationRegistryError } from "../server/SuiteMigrations.ts";
