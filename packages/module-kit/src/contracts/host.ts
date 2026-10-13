import {
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  AuthSettingsWriteScope,
  EnvironmentAuthorizationError,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";

import { ModuleNotInstalledError, ModuleStateEntry, ModuleStateError } from "./moduleState.ts";

/** Host RPCs every profile serves: module state, and the assistant project (ADR 0004). */
export const HOST_METHODS = {
  modulesList: "modules.list",
  modulesSetEnabled: "modules.setEnabled",
  assistantEnsureProject: "assistant.ensureProject",
} as const;

export const ModulesListResult = Schema.Struct({
  modules: Schema.Array(ModuleStateEntry),
});
export type ModulesListResult = typeof ModulesListResult.Type;

const ModulesListRpc = Rpc.make(HOST_METHODS.modulesList, {
  payload: Schema.Struct({}),
  success: ModulesListResult,
  error: EnvironmentAuthorizationError,
});

const ModulesSetEnabledRpc = Rpc.make(HOST_METHODS.modulesSetEnabled, {
  payload: Schema.Struct({ id: Schema.String, enabled: Schema.Boolean }),
  success: ModuleStateEntry,
  error: Schema.Union([ModuleNotInstalledError, ModuleStateError, EnvironmentAuthorizationError]),
});

/** The host-owned project non-coding assistant threads (side chats, Home) belong to. */
export const AssistantProject = Schema.Struct({
  projectId: Schema.String,
  workspaceRoot: Schema.String,
});
export type AssistantProject = typeof AssistantProject.Type;

export class AssistantProjectError extends Schema.TaggedError<AssistantProjectError>()(
  "AssistantProjectError",
  { workspaceRoot: Schema.String, cause: Schema.Defect() },
) {
  override get message(): string {
    return "Could not prepare the assistant project.";
  }
}

const AssistantEnsureProjectRpc = Rpc.make(HOST_METHODS.assistantEnsureProject, {
  payload: Schema.Struct({}),
  success: AssistantProject,
  error: Schema.Union([AssistantProjectError, EnvironmentAuthorizationError]),
});

export const HostRpcGroup = RpcGroup.make(
  ModulesListRpc,
  ModulesSetEnabledRpc,
  AssistantEnsureProjectRpc,
);

export const HOST_RPC_REQUIRED_SCOPES = {
  [HOST_METHODS.modulesList]: AuthOrchestrationReadScope,
  [HOST_METHODS.modulesSetEnabled]: AuthSettingsWriteScope,
  [HOST_METHODS.assistantEnsureProject]: AuthOrchestrationOperateScope,
} as const;

export const HostContract = { group: HostRpcGroup, scopes: HOST_RPC_REQUIRED_SCOPES };
