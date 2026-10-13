/**
 * One engine per API agent: how a thread is created on the agent, how a turn
 * runs, and how approvals, stops and steers reach it. Engines wrap the
 * portable protocol code; the adapter maps their events onto orchestration.
 *
 * @module provider-api-agents/server/engines
 */
import { ProviderDriverKind, type OrchestrationV2ProviderCapabilities } from "@t3tools/contracts";

import { userMessage } from "../protocol/chatCompletions.ts";
import {
  answerHermesApproval,
  createHermesSession,
  fetchHermesModels,
  normalizeHermesRoot,
  runHermesTurn,
  steerHermesRun,
  stopHermesRun,
} from "../protocol/hermes.ts";
import {
  fetchOpenClawModels,
  openClawLoopTarget,
  openClawSessionKey,
} from "../protocol/openClaw.ts";
import { fetchOpenRouterCatalog, openRouterLoopTarget } from "../protocol/openRouter.ts";
import { makeApprovalGate, runToolLoop, settleOpenToolCalls } from "../protocol/toolLoop.ts";
import type {
  AgentAttachment,
  AgentEvent,
  AgentModel,
  AgentTool,
  ApprovalChoice,
  ChatMessage,
  Fetch,
  ToolHost,
  TurnOutcome,
} from "../protocol/types.ts";
import type { HermesSettings, OpenClawSettings, OpenRouterSettings } from "../settings.ts";

export const OPENROUTER_DRIVER = ProviderDriverKind.make("openrouter");
export const HERMES_DRIVER = ProviderDriverKind.make("hermes");
export const OPENCLAW_DRIVER = ProviderDriverKind.make("openclaw");

export interface EngineTurnInput {
  readonly nativeThreadId: string;
  readonly model: string;
  /**
   * The conversation so far, for engines that keep it themselves
   * (`keepsHistory`). The engine appends this turn to it; the host saves it.
   */
  readonly history: ChatMessage[];
  readonly text: string;
  readonly attachments: ReadonlyArray<AgentAttachment>;
  /** T3's runtime instructions, for agents T3 drives itself. */
  readonly instructions: string;
  /** Ask before tools that change something (Supervised). */
  readonly askBeforeChanges: boolean;
  readonly tools: ReadonlyArray<AgentTool>;
  readonly toolHost: ToolHost | undefined;
  readonly emit: (event: AgentEvent) => void;
  readonly signal: AbortSignal;
}

export interface ApiAgentEngine {
  readonly driver: ProviderDriverKind;
  readonly displayName: string;
  readonly capabilities: OrchestrationV2ProviderCapabilities;
  /** Whether the engine runs the thread's T3 tools itself (the tool loop). */
  readonly usesThreadTools: boolean;
  /** The agent keeps no history, so the host stores each thread's conversation. */
  readonly keepsHistory: boolean;
  /** Added to T3's runtime instructions for engines that use them. */
  readonly extraInstructions?: string;
  /** A model change keeps the native thread (`true`) or needs a fresh one with a handoff. */
  readonly modelSwitchInThread: boolean;
  /** Empty when the instance still needs its URL or credential. */
  readonly missingConfiguration: string | undefined;
  readonly listModels: (signal: AbortSignal) => Promise<ReadonlyArray<AgentModel>>;
  /** The agent-side id of a new thread; `id` is a fresh UUID engines may use. */
  readonly createNativeThread: (
    input: { readonly title: string | undefined; readonly id: string },
    signal: AbortSignal,
  ) => Promise<string>;
  readonly runTurn: (input: EngineTurnInput) => Promise<TurnOutcome>;
  readonly answer: (
    nativeThreadId: string,
    approvalId: string,
    choice: ApprovalChoice,
  ) => Promise<void>;
  /** Stops a run on the agent's side, beyond closing its stream. */
  readonly stop: (nativeThreadId: string) => Promise<void>;
  readonly steer?: (nativeThreadId: string, text: string) => Promise<boolean>;
}

const capabilities = (input: {
  readonly enforcement: "native" | "client-boundary";
  readonly steering: boolean;
  readonly commandApprovals: boolean;
  readonly mcpTools: boolean;
  readonly modelSwitchInSession: boolean;
}): OrchestrationV2ProviderCapabilities => ({
  runtimePolicy: { enforcement: input.enforcement },
  sessions: {
    supportsMultipleProviderThreadsPerSession: false,
    supportsModelSwitchInSession: input.modelSwitchInSession,
    supportsProviderSwitchingViaHandoff: true,
    supportsRuntimeModeSwitchInSession: true,
    pendingRequestsSurviveRestart: false,
  },
  threads: {
    canCreateEmptyThread: true,
    canReadThreadSnapshot: false,
    canRollbackThread: false,
    canForkThread: false,
    canForkFromTurn: false,
    canForkFromSubagentThread: false,
    exposesNativeThreadId: true,
  },
  turns: {
    exposesNativeTurnId: false,
    emitsTurnStarted: true,
    emitsTurnCompleted: true,
    supportsInterrupt: true,
    supportsActiveSteering: input.steering,
    supportsSteeringByInterruptRestart: false,
    supportsQueuedMessages: true,
    terminalStatusQuality: "strong",
  },
  streaming: {
    streamsAssistantText: true,
    streamsReasoning: true,
    streamsToolOutput: false,
    streamsPlanText: false,
    emitsMessageCompleted: true,
  },
  tools: {
    exposesToolItemIds: input.mcpTools,
    emitsToolStarted: true,
    emitsToolCompleted: true,
    emitsToolOutput: true,
    supportsMcpTools: input.mcpTools,
    supportsDynamicToolCallbacks: false,
  },
  approvals: {
    supportsCommandApproval: input.commandApprovals,
    supportsFileReadApproval: false,
    supportsFileChangeApproval: false,
    supportsApplyPatchApproval: false,
    approvalsHaveNativeRequestIds: true,
    approvalCallbacksAreLiveOnly: true,
    approvalsCanOriginateFromSubagents: false,
  },
  planning: {
    emitsPlanUpdated: false,
    emitsTodoList: false,
    emitsProposedPlan: false,
    supportsStructuredQuestions: false,
    planDeltasHaveItemIds: false,
  },
  subagents: {
    supportsSubagents: false,
    exposesSubagentThreadIds: false,
    emitsSubagentLifecycle: false,
    canWaitForSubagents: false,
    canCloseSubagents: false,
    canForkSubagentThread: false,
  },
  context: {
    acceptsSystemContext: false,
    acceptsDeveloperContext: false,
    acceptsSyntheticUserContext: true,
    canGenerateSummaries: false,
    canConsumeHandoffSummaries: true,
    supportsDeltaHandoff: true,
    supportsFullThreadHandoff: true,
    maxRecommendedHandoffChars: null,
  },
  checkpointing: {
    appCanCheckpointFilesystem: false,
    supportsNestedCheckpointScopes: false,
    providerCanRollbackConversation: false,
    providerRollbackReturnsSnapshot: false,
    providerCanReadConversationSnapshot: false,
  },
  identity: {
    nativeThreadIds: "strong",
    nativeTurnIds: "none",
    nativeItemIds: "weak",
    nativeRequestIds: "strong",
  },
});

/**
 * The loop engines (OpenRouter, OpenClaw) share an approval gate per
 * instance; approval ids are unique per tool call.
 */
function makeLoopApprovals() {
  const gate = makeApprovalGate();
  const sessionAllowed = new Map<string, Set<string>>();
  return {
    gate,
    allowedFor(nativeThreadId: string) {
      let allowed = sessionAllowed.get(nativeThreadId);
      if (!allowed) sessionAllowed.set(nativeThreadId, (allowed = new Set()));
      return allowed;
    },
  };
}

export function makeOpenRouterEngine(
  settings: OpenRouterSettings,
  deps: { readonly fetch: Fetch },
): ApiAgentEngine {
  const approvals = makeLoopApprovals();
  return {
    driver: OPENROUTER_DRIVER,
    displayName: "OpenRouter",
    capabilities: capabilities({
      enforcement: "native",
      steering: false,
      commandApprovals: false,
      mcpTools: true,
      modelSwitchInSession: true,
    }),
    usesThreadTools: true,
    keepsHistory: true,
    extraInstructions:
      "You have no shell or filesystem here. You act only through the tools provided, if any.",
    modelSwitchInThread: true,
    missingConfiguration: settings.apiKey ? undefined : "Add your OpenRouter API key.",
    listModels: (signal) => fetchOpenRouterCatalog(deps.fetch, settings.apiKey, signal),
    createNativeThread: async ({ id }) => id,
    async runTurn(input) {
      const messages = input.history;
      try {
        messages.push(
          userMessage(input.text, input.attachments, {
            agentName: "OpenRouter",
            acceptsImages: true,
          }),
        );
      } catch (error) {
        return failedOutcome(error);
      }
      const outcome = await runToolLoop({
        ...openRouterLoopTarget(settings.apiKey, input.model),
        fetch: deps.fetch,
        system: input.instructions,
        messages,
        tools: input.tools,
        toolHost: input.toolHost,
        askBeforeChanges: input.askBeforeChanges,
        approvals: approvals.gate,
        sessionAllowed: approvals.allowedFor(input.nativeThreadId),
        emit: input.emit,
        signal: input.signal,
      });
      settleOpenToolCalls(messages);
      return outcome;
    },
    answer: async (_nativeThreadId, approvalId, choice) => {
      approvals.gate.answer(approvalId, choice);
    },
    stop: async () => {},
  };
}

export function makeOpenClawEngine(
  settings: OpenClawSettings,
  deps: { readonly fetch: Fetch },
): ApiAgentEngine {
  const approvals = makeLoopApprovals();
  return {
    driver: OPENCLAW_DRIVER,
    displayName: "OpenClaw",
    capabilities: capabilities({
      enforcement: "client-boundary",
      steering: false,
      commandApprovals: false,
      mcpTools: true,
      // A model is an OpenClaw agent; its session belongs to that agent.
      modelSwitchInSession: false,
    }),
    usesThreadTools: true,
    keepsHistory: false,
    modelSwitchInThread: false,
    missingConfiguration: settings.baseUrl ? undefined : "Add the gateway URL and token.",
    listModels: (signal) =>
      fetchOpenClawModels(deps.fetch, settings.baseUrl, settings.token, signal),
    createNativeThread: async ({ id }) => openClawSessionKey(id),
    async runTurn(input) {
      let first: ChatMessage;
      try {
        first = userMessage(input.text, input.attachments, {
          agentName: "OpenClaw",
          acceptsImages: true,
        });
      } catch (error) {
        return failedOutcome(error);
      }
      return runToolLoop({
        ...openClawLoopTarget({
          baseUrl: settings.baseUrl,
          token: settings.token,
          sessionKey: input.nativeThreadId,
          model: input.model,
        }),
        fetch: deps.fetch,
        system: input.instructions,
        messages: [first],
        unsentFrom: 0,
        tools: input.tools,
        toolHost: input.toolHost,
        askBeforeChanges: input.askBeforeChanges,
        approvals: approvals.gate,
        sessionAllowed: approvals.allowedFor(input.nativeThreadId),
        emit: input.emit,
        signal: input.signal,
      });
    },
    answer: async (_nativeThreadId, approvalId, choice) => {
      approvals.gate.answer(approvalId, choice);
    },
    stop: async () => {},
  };
}

export function makeHermesEngine(
  settings: HermesSettings,
  deps: { readonly fetch: Fetch },
): ApiAgentEngine {
  const root = normalizeHermesRoot(settings.baseUrl);
  /** The run each thread's current turn streams, for approvals, stop and steer. */
  const runs = new Map<string, string>();
  return {
    driver: HERMES_DRIVER,
    displayName: "Hermes",
    capabilities: capabilities({
      enforcement: "client-boundary",
      steering: true,
      commandApprovals: true,
      mcpTools: false,
      modelSwitchInSession: true,
    }),
    usesThreadTools: false,
    keepsHistory: false,
    modelSwitchInThread: true,
    missingConfiguration:
      settings.baseUrl && settings.apiKey ? undefined : "Add the API server URL and key.",
    listModels: (signal) => fetchHermesModels(deps.fetch, root, settings.apiKey, signal),
    createNativeThread: ({ title }, signal) =>
      createHermesSession(deps.fetch, root, settings.apiKey, title, signal),
    async runTurn(input) {
      let message: ChatMessage;
      try {
        message = userMessage(input.text, input.attachments, {
          agentName: "Hermes",
          acceptsImages: true,
        });
      } catch (error) {
        return failedOutcome(error);
      }
      try {
        return await runHermesTurn({
          fetch: deps.fetch,
          root,
          apiKey: settings.apiKey,
          sessionId: input.nativeThreadId,
          message: message.role === "user" ? message.content : input.text,
          model: input.model,
          emit: (event) => {
            if (event.type === "run.started") runs.set(input.nativeThreadId, event.runId);
            input.emit(event);
          },
          signal: input.signal,
        });
      } finally {
        runs.delete(input.nativeThreadId);
      }
    },
    async answer(nativeThreadId, approvalId, choice) {
      const runId = runs.get(nativeThreadId);
      if (!runId) throw new Error("This Hermes run has ended.");
      await answerHermesApproval(deps.fetch, root, settings.apiKey, runId, approvalId, choice);
    },
    async stop(nativeThreadId) {
      const runId = runs.get(nativeThreadId);
      if (runId) await stopHermesRun(deps.fetch, root, settings.apiKey, runId).catch(() => {});
    },
    async steer(nativeThreadId, text) {
      const runId = runs.get(nativeThreadId);
      if (!runId) return false;
      return steerHermesRun(deps.fetch, root, settings.apiKey, runId, text);
    },
  };
}

function failedOutcome(error: unknown): TurnOutcome {
  return {
    status: "failed",
    message: error instanceof Error ? error.message : String(error),
    failureClass: "provider_error",
  };
}
