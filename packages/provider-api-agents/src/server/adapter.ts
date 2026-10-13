/**
 * The orchestration adapter every API agent shares. A session owns one
 * provider thread; each turn runs its engine in the background and its events
 * become T3 messages, tool rows and approval requests. There is no process to
 * manage: a session is only state around HTTP calls.
 *
 * @module provider-api-agents/server/adapter
 */
import {
  type ModelSelection,
  type OrchestrationV2ExecutionNode,
  type OrchestrationV2ProviderFailureClass,
  type OrchestrationV2ProviderSession,
  type OrchestrationV2ProviderThread,
  type OrchestrationV2ProviderTurn,
  type OrchestrationV2RuntimeRequest,
  type OrchestrationV2TurnItem,
  type OrchestrationV2TurnItemStatus,
  type ProviderApprovalDecision,
  type ProviderApprovalOption,
  type ProviderInstanceId,
  type RuntimeRequestId,
  type ServerProviderModel,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";

import { isProviderNativeImageAttachment } from "@t3tools/provider-core/server/attachmentPrompt";
import { makeProviderFailure } from "@t3tools/provider-core/server/failure";
import { randomUuidV4 } from "@t3tools/provider-core/server/randomUuid";
import * as IdAllocator from "@t3tools/provider-core/server/IdAllocator";
import * as McpProviderSessions from "@t3tools/provider-core/server/McpProviderSessions";
import { t3OrchestrationSystemPrompt } from "@t3tools/provider-core/server/orchestrationInstructions";
import * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import * as ProviderHost from "@t3tools/provider-core/server/ProviderHost";
import { buildRuntimeInstructions } from "@t3tools/provider-core/server/runtimeInstructions";

import { makeMcpToolHost } from "../protocol/mcpClient.ts";
import type {
  AgentAttachment,
  AgentEvent,
  AgentTool,
  ApprovalChoice,
  ChatMessage,
  Fetch,
  FailureClass,
  ToolHost,
  TurnOutcome,
} from "../protocol/types.ts";
import type { ApiAgentEngine } from "./engines.ts";

/** Where the thread's T3 tools live, and the tool name T3's timeline recognizes. */
const T3_MCP_SERVER = "t3-code";
const INTERRUPT_TIMEOUT_MS = 15_000;

export interface ApiAgentAdapterOptions {
  readonly instanceId: ProviderInstanceId;
  readonly engine: ApiAgentEngine;
  readonly fetch: Fetch;
  readonly modelCatalog: Effect.Effect<ReadonlyArray<ServerProviderModel>>;
}

interface TextSegment {
  readonly key: string;
  readonly kind: "assistant" | "reasoning";
  text: string;
  readonly startedAt: DateTime.Utc;
  dirty: boolean;
}

interface ToolRow {
  readonly key: string;
  readonly name: string;
  readonly input: unknown;
  readonly startedAt: DateTime.Utc;
}

interface PendingRequest {
  readonly nativeId: string;
  readonly choices: ReadonlyArray<ApprovalChoice>;
  /** T3's answer, recorded before the agent hears it: the agent can settle first. */
  decision?: ProviderApprovalDecision;
  request: OrchestrationV2RuntimeRequest;
  node: OrchestrationV2ExecutionNode;
  item: OrchestrationV2TurnItem;
}

interface ActiveTurn {
  readonly input: ProviderAdapter.ProviderAdapterV2TurnInput;
  readonly nativeThreadId: string;
  readonly controller: AbortController;
  readonly done: Deferred.Deferred<void>;
  providerTurn: OrchestrationV2ProviderTurn;
  readonly ordinals: Map<string, number>;
  nextOrdinal: number;
  segmentCount: number;
  assistant: TextSegment | undefined;
  reasoning: TextSegment | undefined;
  readonly tools: Map<string, ToolRow>;
  readonly requests: Map<string, PendingRequest>;
  interruptRequested: boolean;
}

type InboxEntry =
  | { readonly type: "event"; readonly turn: ActiveTurn; readonly event: AgentEvent }
  | { readonly type: "done"; readonly turn: ActiveTurn; readonly outcome: TurnOutcome };

const APPROVAL_DECISIONS: Record<ApprovalChoice, ProviderApprovalDecision> = {
  once: "accept",
  session: "acceptForSession",
  always: "acceptAlways",
  deny: "decline",
};
const APPROVAL_LABELS: Record<ApprovalChoice, string> = {
  once: "Allow once",
  session: "Allow for this thread",
  always: "Always allow",
  deny: "Decline",
};

const decodeJson = Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown));
const encodeJson = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));

const failureClass = (value: FailureClass): OrchestrationV2ProviderFailureClass =>
  value === "auth" ? "permission_error" : value;

export const makeApiAgentAdapter = Effect.fn("makeApiAgentAdapter")(function* (
  options: ApiAgentAdapterOptions,
) {
  const { engine, instanceId } = options;
  const driver = engine.driver;
  const idAllocator = yield* IdAllocator.IdAllocatorV2;
  const providerHost = yield* ProviderHost.ProviderHost;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const historyDir = path.join(providerHost.paths.stateDir, "api-agents", driver, instanceId);
  const historyFile = (nativeThreadId: string) =>
    path.join(historyDir, `${nativeThreadId.replace(/[^A-Za-z0-9_-]/g, "_")}.json`);
  /** The conversation of an agent that keeps none; a missing or unreadable file starts fresh. */
  const loadHistory = (nativeThreadId: string) =>
    fileSystem.readFileString(historyFile(nativeThreadId)).pipe(
      Effect.flatMap(decodeJson),
      Effect.map((parsed): ChatMessage[] =>
        Array.isArray(parsed) ? (parsed as ChatMessage[]) : [],
      ),
      Effect.orElseSucceed((): ChatMessage[] => []),
    );
  const saveHistory = (nativeThreadId: string, messages: ReadonlyArray<ChatMessage>) =>
    Effect.gen(function* () {
      yield* fileSystem.makeDirectory(historyDir, { recursive: true });
      const target = historyFile(nativeThreadId);
      const temporary = `${target}.${yield* randomUuidV4}.tmp`;
      yield* fileSystem.writeFileString(temporary, yield* encodeJson(messages));
      yield* fileSystem.rename(temporary, target);
    }).pipe(
      Effect.catch((cause) => Effect.logWarning("Could not save the agent conversation", cause)),
    );
  const mcpSessions = yield* McpProviderSessions.McpProviderSessions;

  const protocolError = (detail: string, cause?: unknown) =>
    new ProviderAdapter.ProviderAdapterProtocolError({
      driver,
      detail,
      ...(cause === undefined ? {} : { cause }),
    });
  const nativeRef = (nativeId: string, strength: "strong" | "weak" = "strong") => ({
    driver,
    nativeId,
    strength,
  });

  return ProviderAdapter.ProviderAdapterV2.of({
    instanceId,
    driver,
    getCapabilities: () => Effect.succeed(engine.capabilities),
    planSelectionTransition: (input) =>
      Effect.succeed(
        input.current.model !== input.target.model && !engine.modelSwitchInThread
          ? { type: "create_with_handoff" as const }
          : { type: "apply_on_next_turn" as const },
      ),
    openSession: Effect.fn("ApiAgentAdapter.openSession")(function* (
      input: ProviderAdapter.ProviderAdapterV2OpenSessionInput,
    ) {
      if (engine.missingConfiguration)
        return yield* new ProviderAdapter.ProviderAdapterOpenSessionError({
          driver,
          providerSessionId: input.providerSessionId,
          cause: engine.missingConfiguration,
        });
      if (input.runtimePolicy.interactionMode === "plan")
        return yield* protocolError(`${engine.displayName} has no Plan mode`);
      const scope = yield* Effect.scope;
      const now = yield* DateTime.now;
      let session: OrchestrationV2ProviderSession = {
        id: input.providerSessionId,
        driver,
        providerInstanceId: instanceId,
        status: "ready",
        cwd: input.runtimePolicy.cwd ?? providerHost.paths.cwd,
        model: input.modelSelection.model,
        capabilities: engine.capabilities,
        createdAt: now,
        updatedAt: now,
        lastError: null,
      };
      const events = yield* Queue.unbounded<
        ProviderAdapter.ProviderAdapterV2Event,
        ProviderAdapter.ProviderAdapterV2Error
      >();
      const inbox = yield* Queue.unbounded<InboxEntry>();
      const permit = yield* Semaphore.make(1);
      let thread: OrchestrationV2ProviderThread | undefined;
      let active: ActiveTurn | undefined;
      let runtimeMode = input.runtimePolicy.runtimeMode;
      /** Handoff context to put before the next user message. */
      let pendingContext: string | undefined;
      const pending = new Map<RuntimeRequestId, PendingRequest>();

      const emit = (event: ProviderAdapter.ProviderAdapterV2Event) =>
        Queue.offer(events, event).pipe(Effect.asVoid);
      const updateSession = Effect.fnUntraced(function* (
        status: OrchestrationV2ProviderSession["status"],
        lastError: string | null = null,
      ) {
        session = { ...session, status, lastError, updatedAt: yield* DateTime.now };
        yield* emit({ type: "provider_session.updated", driver, providerSession: session });
      });
      const updateThread = Effect.fnUntraced(function* (
        patch: Partial<OrchestrationV2ProviderThread>,
      ) {
        if (!thread) return;
        thread = { ...thread, ...patch, updatedAt: yield* DateTime.now };
        yield* emit({ type: "provider_thread.updated", driver, providerThread: thread });
      });

      const baseItem = (
        turn: ActiveTurn,
        key: string,
        startedAt: DateTime.Utc,
        time: DateTime.Utc,
      ) => {
        if (!turn.ordinals.has(key)) turn.ordinals.set(key, turn.nextOrdinal++);
        const nativeItemId = `${instanceId}:${turn.input.providerThread.id}:${turn.input.attemptId}:${key}`;
        return {
          id: idAllocator.derive.turnItemFromProviderItem({ driver, nativeItemId }),
          nodeId: idAllocator.derive.nodeFromProviderItem({ driver, nativeItemId }),
          threadId: turn.input.threadId,
          runId: turn.input.runId,
          providerThreadId: turn.input.providerThread.id,
          providerTurnId: turn.providerTurn.id,
          nativeItemRef: nativeRef(key, "weak"),
          parentItemId: null,
          ordinal: turn.ordinals.get(key)!,
          startedAt,
          updatedAt: time,
        };
      };
      const publishNode = (
        turn: ActiveTurn,
        base: ReturnType<typeof baseItem>,
        kind: OrchestrationV2ExecutionNode["kind"],
        status: OrchestrationV2TurnItemStatus,
        completedAt: DateTime.Utc | null,
      ) =>
        emit({
          type: "node.updated",
          driver,
          node: {
            id: base.nodeId,
            threadId: base.threadId,
            runId: base.runId,
            parentNodeId: turn.input.rootNodeId,
            rootNodeId: turn.input.rootNodeId,
            kind,
            status,
            countsForRun: false,
            providerThreadId: base.providerThreadId,
            providerTurnId: base.providerTurnId,
            nativeItemRef: base.nativeItemRef,
            runtimeRequestId: null,
            checkpointScopeId: null,
            startedAt: base.startedAt,
            completedAt,
          },
        });

      const publishSegment = Effect.fnUntraced(function* (
        turn: ActiveTurn,
        segment: TextSegment,
        streaming: boolean,
      ) {
        segment.dirty = false;
        const time = yield* DateTime.now;
        const base = baseItem(turn, segment.key, segment.startedAt, time);
        const status = streaming ? "running" : "completed";
        const completedAt = streaming ? null : time;
        if (segment.kind === "assistant") {
          const messageId = idAllocator.derive.messageFromProviderItem({
            driver,
            nativeItemId: `${instanceId}:${turn.input.providerThread.id}:${turn.input.attemptId}:${segment.key}`,
          });
          yield* emit({
            type: "message.updated",
            driver,
            message: {
              id: messageId,
              threadId: base.threadId,
              runId: base.runId,
              nodeId: base.nodeId,
              role: "assistant",
              text: segment.text,
              attachments: [],
              streaming,
              createdBy: "agent",
              creationSource: "provider",
              createdAt: segment.startedAt,
              updatedAt: time,
            },
          });
          yield* publishNode(turn, base, "assistant_message", status, completedAt);
          yield* emit({
            type: "turn_item.updated",
            driver,
            turnItem: {
              ...base,
              type: "assistant_message",
              status,
              title: null,
              completedAt,
              messageId,
              text: segment.text,
              streaming,
            },
          });
        } else {
          yield* publishNode(turn, base, "reasoning", status, completedAt);
          yield* emit({
            type: "turn_item.updated",
            driver,
            turnItem: {
              ...base,
              type: "reasoning",
              status,
              title: null,
              completedAt,
              text: segment.text,
              streaming,
            },
          });
        }
      });
      /** Closes the open text and reasoning: a tool call or the turn's end follows them. */
      const closeSegments = Effect.fnUntraced(function* (turn: ActiveTurn) {
        for (const segment of [turn.reasoning, turn.assistant])
          if (segment) yield* publishSegment(turn, segment, false);
        turn.assistant = undefined;
        turn.reasoning = undefined;
      });
      const appendText = Effect.fnUntraced(function* (
        turn: ActiveTurn,
        kind: TextSegment["kind"],
        text: string,
      ) {
        const field = kind === "assistant" ? "assistant" : "reasoning";
        // Answer text after reasoning closes the reasoning row.
        if (kind === "assistant" && turn.reasoning) {
          yield* publishSegment(turn, turn.reasoning, false);
          turn.reasoning = undefined;
        }
        let segment = turn[field];
        if (!segment) {
          segment = {
            key: `${kind}:${turn.segmentCount++}`,
            kind,
            text: "",
            startedAt: yield* DateTime.now,
            dirty: false,
          };
          turn[field] = segment;
        }
        segment.text += text;
        segment.dirty = true;
      });

      const toolName = (name: string) =>
        engine.usesThreadTools ? `mcp__${T3_MCP_SERVER}__${name}` : name;
      const publishTool = Effect.fnUntraced(function* (
        turn: ActiveTurn,
        row: ToolRow,
        status: OrchestrationV2TurnItemStatus,
        output?: string,
      ) {
        const time = yield* DateTime.now;
        const base = baseItem(turn, row.key, row.startedAt, time);
        const completedAt = status === "running" ? null : time;
        yield* publishNode(turn, base, "tool_call", status, completedAt);
        yield* emit({
          type: "turn_item.updated",
          driver,
          turnItem: {
            ...base,
            type: "dynamic_tool",
            status,
            title: row.name,
            completedAt,
            toolName: toolName(row.name),
            input: row.input ?? {},
            ...(output === undefined ? {} : { output }),
          },
        });
      });

      const publishRequest = Effect.fnUntraced(function* (
        turn: ActiveTurn,
        event: Extract<AgentEvent, { type: "approval.requested" }>,
      ) {
        if (!thread) return;
        const requestId = yield* idAllocator.allocate
          .runtimeRequest({
            driver,
            providerTurnId: turn.providerTurn.id,
            nativeRequestId: event.id,
          })
          .pipe(Effect.mapError((cause) => protocolError("Cannot allocate a request id", cause)));
        const time = yield* DateTime.now;
        const nodeId = idAllocator.derive.approvalNode({ requestId });
        const kind = event.kind === "command" ? ("command" as const) : ("permission" as const);
        const request: OrchestrationV2RuntimeRequest = {
          id: requestId,
          nodeId,
          providerTurnId: turn.providerTurn.id,
          nativeRequestRef: nativeRef(event.id),
          kind,
          status: "pending",
          responseCapability: { type: "live", providerSessionId: input.providerSessionId },
          createdAt: time,
          resolvedAt: null,
        };
        const node: OrchestrationV2ExecutionNode = {
          id: nodeId,
          threadId: turn.input.threadId,
          runId: turn.input.runId,
          parentNodeId: turn.input.rootNodeId,
          rootNodeId: turn.input.rootNodeId,
          kind: "approval_request",
          status: "waiting",
          countsForRun: false,
          providerThreadId: thread.id,
          providerTurnId: turn.providerTurn.id,
          nativeItemRef: nativeRef(event.id),
          runtimeRequestId: requestId,
          checkpointScopeId: null,
          startedAt: time,
          completedAt: null,
        };
        const options: ProviderApprovalOption[] = event.choices.map((choice) => ({
          decision: APPROVAL_DECISIONS[choice],
          label: APPROVAL_LABELS[choice],
        }));
        const item: OrchestrationV2TurnItem = {
          ...baseItem(turn, `request:${event.id}`, time, time),
          id: idAllocator.derive.approvalTurnItem({ requestId }),
          nodeId,
          type: "approval_request",
          status: "waiting",
          title: null,
          completedAt: null,
          requestId,
          requestKind: kind,
          prompt: event.detail ? `${event.title}\n${event.detail}` : event.title,
          options,
        };
        const entry: PendingRequest = {
          nativeId: event.id,
          choices: event.choices,
          request,
          node,
          item,
        };
        pending.set(requestId, entry);
        turn.requests.set(event.id, entry);
        yield* emit({
          type: "runtime_request.updated",
          driver,
          threadId: turn.input.threadId,
          runtimeRequest: request,
        });
        yield* emit({ type: "node.updated", driver, node });
        yield* emit({ type: "turn_item.updated", driver, turnItem: item });
        yield* updateSession("waiting");
      });
      const resolveRequest = Effect.fnUntraced(function* (
        entry: PendingRequest,
        status: "resolved" | "cancelled",
      ) {
        if (!pending.has(entry.request.id)) return;
        pending.delete(entry.request.id);
        const time = yield* DateTime.now;
        entry.request = {
          ...entry.request,
          ...(status === "resolved" && entry.decision ? { decision: entry.decision } : {}),
          status,
          resolvedAt: time,
          responseCapability: { type: "not_resumable", reason: "This request has ended." },
        };
        const itemStatus = status === "resolved" ? "completed" : "cancelled";
        entry.node = { ...entry.node, status: itemStatus, completedAt: time };
        entry.item = { ...entry.item, status: itemStatus, completedAt: time, updatedAt: time };
        yield* emit({
          type: "runtime_request.updated",
          driver,
          threadId: entry.node.threadId,
          runtimeRequest: entry.request,
        });
        yield* emit({ type: "node.updated", driver, node: entry.node });
        yield* emit({ type: "turn_item.updated", driver, turnItem: entry.item });
        if (pending.size === 0 && active) yield* updateSession("running");
      });

      const finish = Effect.fnUntraced(function* (turn: ActiveTurn, outcome: TurnOutcome) {
        if (active !== turn) return;
        yield* closeSegments(turn);
        const completedAt = yield* DateTime.now;
        for (const row of turn.tools.values())
          yield* publishTool(turn, row, outcome.status === "completed" ? "completed" : "cancelled");
        turn.tools.clear();
        for (const entry of turn.requests.values()) yield* resolveRequest(entry, "cancelled");
        const endedStatus =
          outcome.status === "failed" || outcome.status === "completed"
            ? outcome.status
            : turn.interruptRequested
              ? ("interrupted" as const)
              : ("cancelled" as const);
        turn.providerTurn = { ...turn.providerTurn, status: endedStatus, completedAt };
        yield* emit({
          type: "provider_turn.updated",
          driver,
          threadId: turn.input.threadId,
          providerTurn: turn.providerTurn,
        });
        yield* updateThread({ status: "idle" });
        yield* updateSession("ready", outcome.status === "failed" ? outcome.message : null);
        active = undefined;
        if (endedStatus === "failed") {
          const failure = makeProviderFailure(
            outcome.status === "failed"
              ? { class: failureClass(outcome.failureClass), message: outcome.message }
              : {},
          );
          const base = baseItem(turn, "failure", completedAt, completedAt);
          yield* emit({
            type: "turn_item.updated",
            driver,
            turnItem: {
              ...base,
              type: "error",
              status: "failed",
              title: null,
              completedAt,
              failure,
            },
          });
          yield* emit({
            type: "turn.terminal",
            driver,
            providerThreadId: turn.providerTurn.providerThreadId,
            providerTurnId: turn.providerTurn.id,
            runOrdinal: turn.input.runOrdinal,
            status: "failed",
            failure,
            failureItemOrdinal: base.ordinal,
            threadDisposition: "reusable",
          });
        } else {
          yield* emit({
            type: "turn.terminal",
            driver,
            providerThreadId: turn.providerTurn.providerThreadId,
            providerTurnId: turn.providerTurn.id,
            runOrdinal: turn.input.runOrdinal,
            status: endedStatus,
            failure: null,
            threadDisposition: "reusable",
          });
        }
        yield* Deferred.succeed(turn.done, undefined);
      });

      const handleEvent = Effect.fnUntraced(function* (turn: ActiveTurn, event: AgentEvent) {
        if (active !== turn) return;
        switch (event.type) {
          case "text.delta":
            return yield* appendText(turn, "assistant", event.text);
          case "reasoning.delta":
            return yield* appendText(turn, "reasoning", event.text);
          case "tool.started": {
            yield* closeSegments(turn);
            const row: ToolRow = {
              key: `tool:${event.id}`,
              name: event.name,
              input: event.input,
              startedAt: yield* DateTime.now,
            };
            turn.tools.set(event.id, row);
            return yield* publishTool(turn, row, "running");
          }
          case "tool.completed": {
            const row = turn.tools.get(event.id);
            if (!row) return;
            turn.tools.delete(event.id);
            return yield* publishTool(
              turn,
              row,
              event.isError ? "failed" : "completed",
              event.output,
            );
          }
          case "approval.requested": {
            yield* closeSegments(turn);
            // Full access answers the agent's own prompts; the loop engines never ask then.
            if (runtimeMode === "full-access") {
              const choice = event.choices.includes("once") ? "once" : event.choices[0];
              if (choice)
                yield* Effect.tryPromise(() =>
                  engine.answer(turn.nativeThreadId, event.id, choice),
                ).pipe(Effect.ignore, Effect.forkIn(scope));
              return;
            }
            return yield* publishRequest(turn, event);
          }
          case "approval.resolved": {
            const entry = turn.requests.get(event.id);
            if (entry) yield* resolveRequest(entry, "resolved");
            return;
          }
          case "usage":
            turn.providerTurn = {
              ...turn.providerTurn,
              turnTokenUsage: {
                usageScope: "main_agent",
                usageStatus: "partial",
                hasSubagents: false,
                inputTokens:
                  (turn.providerTurn.turnTokenUsage?.inputTokens ?? 0) + event.inputTokens,
                outputTokens:
                  (turn.providerTurn.turnTokenUsage?.outputTokens ?? 0) + event.outputTokens,
                cachedInputTokens: 0,
                reasoningTokens: 0,
              },
            };
            return yield* emit({
              type: "provider_turn.updated",
              driver,
              threadId: turn.input.threadId,
              providerTurn: turn.providerTurn,
            });
          case "run.started":
            return;
        }
      });

      // Applies a batch of engine events, then publishes the text it grew once.
      yield* Effect.gen(function* () {
        for (;;) {
          const batch = yield* Queue.takeAll(inbox);
          yield* permit.withPermits(1)(
            Effect.gen(function* () {
              const touched = new Set<ActiveTurn>();
              for (const entry of batch) {
                if (entry.type === "done") {
                  yield* finish(entry.turn, entry.outcome);
                  continue;
                }
                yield* handleEvent(entry.turn, entry.event);
                touched.add(entry.turn);
              }
              for (const turn of touched) {
                if (active !== turn) continue;
                for (const segment of [turn.reasoning, turn.assistant])
                  if (segment?.dirty) yield* publishSegment(turn, segment, true);
              }
            }),
          );
        }
      }).pipe(
        Effect.catchCause((cause) => Queue.failCause(events, cause).pipe(Effect.asVoid)),
        Effect.forkIn(scope),
      );

      yield* Effect.addFinalizer(() =>
        Effect.gen(function* () {
          const turn = active;
          if (turn) {
            turn.controller.abort();
            yield* permit.withPermits(1)(finish(turn, { status: "cancelled" }));
          }
          yield* Queue.shutdown(inbox);
          yield* Queue.shutdown(events);
        }),
      );

      const resolveModel = Effect.fnUntraced(function* (selection: ModelSelection) {
        if (selection.instanceId !== instanceId)
          return yield* protocolError("The model selection belongs to another provider instance");
        return selection.model;
      });

      const register = Effect.fnUntraced(function* (
        args: ProviderAdapter.ProviderAdapterV2EnsureThreadInput,
      ) {
        if (active) return yield* protocolError("Cannot change threads during an active turn");
        const existing = args.existingProviderThread;
        if (existing) {
          if (existing.driver !== driver || existing.providerInstanceId !== instanceId)
            return yield* protocolError("The thread belongs to another provider instance");
          if (!existing.nativeThreadRef?.nativeId)
            return yield* protocolError("The thread has no native session to resume");
          thread = {
            ...existing,
            providerSessionId: input.providerSessionId,
            status: "idle",
            updatedAt: yield* DateTime.now,
          };
        } else if (thread && thread.appThreadId === args.threadId) {
          return thread;
        } else {
          const id = yield* randomUuidV4;
          const nativeId = yield* Effect.tryPromise({
            try: (signal) =>
              input.initialNativeThreadId
                ? Promise.resolve(input.initialNativeThreadId)
                : engine.createNativeThread({ title: args.title, id }, signal),
            catch: (cause) =>
              protocolError(
                cause instanceof Error
                  ? cause.message
                  : `${engine.displayName} could not start a thread`,
                cause,
              ),
          });
          const createdAt = yield* DateTime.now;
          thread = {
            id: idAllocator.derive.providerThread({
              driver,
              providerInstanceId: instanceId,
              nativeThreadId: nativeId,
            }),
            driver,
            providerInstanceId: instanceId,
            providerSessionId: input.providerSessionId,
            appThreadId: args.threadId,
            ownerNodeId: null,
            nativeThreadRef: nativeRef(nativeId),
            nativeConversationHeadRef: null,
            status: "idle",
            firstRunOrdinal: null,
            lastRunOrdinal: null,
            handoffIds: [],
            forkedFrom: null,
            createdAt,
            updatedAt: createdAt,
          };
        }
        yield* emit({ type: "provider_thread.updated", driver, providerThread: thread });
        return thread;
      });

      const readAttachments = Effect.fnUntraced(function* (
        message: ProviderAdapter.ProviderAdapterV2TurnMessage,
      ) {
        const attachments: AgentAttachment[] = [];
        for (const attachment of message.attachments) {
          const path = providerHost.resolveAttachmentPath(attachment);
          if (!path) return yield* protocolError(`Attachment ${attachment.name} is missing`);
          const mimeType =
            attachment.type === "image" || isProviderNativeImageAttachment(attachment)
              ? attachment.mimeType
              : ((attachment as { readonly mimeType?: string }).mimeType ??
                "application/octet-stream");
          const bytes = yield* fileSystem
            .readFile(path)
            .pipe(
              Effect.mapError((cause) => protocolError(`Cannot read ${attachment.name}`, cause)),
            );
          attachments.push({
            name: attachment.name,
            mimeType,
            data: Buffer.from(bytes).toString("base64"),
          });
        }
        return attachments;
      });

      /** The thread's T3 tools, or none when its MCP server is unavailable. */
      const threadTools = Effect.fnUntraced(function* (
        threadId: ProviderAdapter.ProviderAdapterV2TurnInput["threadId"],
      ) {
        if (!engine.usesThreadTools) return { toolHost: undefined, tools: [] as AgentTool[] };
        const mcp = yield* mcpSessions.read(threadId);
        if (!mcp) return { toolHost: undefined, tools: [] as AgentTool[] };
        const toolHost: ToolHost = makeMcpToolHost({
          fetch: options.fetch,
          endpoint: mcp.endpoint,
          authorization: mcp.authorizationHeader,
        });
        const tools = yield* Effect.tryPromise(() => toolHost.list()).pipe(
          Effect.tapError((cause) =>
            Effect.logWarning("T3 tools are unavailable for this turn", cause),
          ),
          Effect.orElseSucceed(() => [] as ReadonlyArray<AgentTool>),
        );
        return { toolHost: tools.length > 0 ? toolHost : undefined, tools };
      });

      const start = Effect.fnUntraced(function* (
        turnInput: ProviderAdapter.ProviderAdapterV2TurnInput,
      ) {
        if (active)
          return yield* protocolError("A turn is already running; queue through the orchestrator");
        const current = thread;
        const nativeThreadId = current?.nativeThreadRef?.nativeId;
        if (!current || current.id !== turnInput.providerThread.id || !nativeThreadId)
          return yield* protocolError("The thread is not attached to this session");
        if (turnInput.runtimePolicy.interactionMode === "plan")
          return yield* protocolError(`${engine.displayName} has no Plan mode`);
        runtimeMode = turnInput.runtimePolicy.runtimeMode;
        const model = yield* resolveModel(turnInput.modelSelection);
        const attachments = yield* readAttachments(turnInput.message);
        const { toolHost, tools } = yield* threadTools(turnInput.threadId);
        const catalog = yield* options.modelCatalog;
        const modelName = catalog.find((entry) => entry.slug === model)?.name;
        const instructions = engine.usesThreadTools
          ? [
              buildRuntimeInstructions({ harness: engine.displayName, model, modelName }),
              t3OrchestrationSystemPrompt(tools.length > 0),
              engine.extraInstructions,
            ]
              .filter(Boolean)
              .join("\n\n")
          : "";
        const text = pendingContext
          ? `<conversation_context>\n${pendingContext}\n</conversation_context>\n\n${turnInput.message.text}`
          : turnInput.message.text;
        pendingContext = undefined;
        const startedAt = yield* DateTime.now;
        const turn: ActiveTurn = {
          input: turnInput,
          nativeThreadId,
          // The engines are promise code; interruptTurn aborts them through this.
          // @effect-diagnostics-next-line abortControllerInEffect:off
          controller: new AbortController(),
          done: yield* Deferred.make<void>(),
          providerTurn: {
            id: idAllocator.derive.providerTurn({
              driver,
              nativeTurnId: `${instanceId}:${nativeThreadId}:${turnInput.attemptId}`,
            }),
            providerThreadId: turnInput.providerThread.id,
            nodeId: turnInput.rootNodeId,
            runAttemptId: turnInput.attemptId,
            nativeTurnRef: null,
            ordinal: turnInput.providerTurnOrdinal,
            status: "running",
            startedAt,
            completedAt: null,
          },
          ordinals: new Map(),
          nextOrdinal: turnInput.providerTurnOrdinal * 100 + 1,
          segmentCount: 0,
          assistant: undefined,
          reasoning: undefined,
          tools: new Map(),
          requests: new Map(),
          interruptRequested: false,
        };
        yield* permit.withPermits(1)(
          Effect.gen(function* () {
            active = turn;
            yield* emit({
              type: "provider_turn.updated",
              driver,
              threadId: turnInput.threadId,
              providerTurn: turn.providerTurn,
            });
            yield* updateThread({
              status: "active",
              firstRunOrdinal: current.firstRunOrdinal ?? turnInput.runOrdinal,
              lastRunOrdinal: turnInput.runOrdinal,
            });
            yield* updateSession("running");
          }),
        );
        const offer = (entry: InboxEntry) => {
          Queue.offerUnsafe(inbox, entry);
        };
        const history = engine.keepsHistory ? yield* loadHistory(nativeThreadId) : [];
        yield* Effect.promise(() =>
          engine
            .runTurn({
              nativeThreadId,
              model,
              history,
              text,
              attachments,
              instructions,
              askBeforeChanges: runtimeMode !== "full-access",
              tools,
              toolHost,
              emit: (event) => offer({ type: "event", turn, event }),
              signal: turn.controller.signal,
            })
            .catch((error: unknown): TurnOutcome => ({
              status: "failed",
              message: error instanceof Error ? error.message : String(error),
              failureClass: "provider_error",
            })),
        ).pipe(
          Effect.tap(() =>
            engine.keepsHistory ? saveHistory(nativeThreadId, history) : Effect.void,
          ),
          Effect.flatMap((outcome) => Effect.sync(() => offer({ type: "done", turn, outcome }))),
          Effect.forkIn(scope),
        );
      });

      const runtime: ProviderAdapter.ProviderAdapterV2SessionRuntime = {
        instanceId,
        driver,
        providerSessionId: input.providerSessionId,
        providerSession: session,
        events: Stream.fromQueue(events),
        ensureThread: (args) =>
          register(args).pipe(
            Effect.mapError(
              (cause) =>
                new ProviderAdapter.ProviderAdapterEnsureThreadError({
                  driver,
                  threadId: args.threadId,
                  cause,
                }),
            ),
          ),
        resumeThread: (args) =>
          register({
            threadId: args.threadId ?? args.providerThread.appThreadId ?? input.threadId,
            modelSelection: args.modelSelection ?? input.modelSelection,
            runtimePolicy: args.runtimePolicy ?? input.runtimePolicy,
            existingProviderThread: args.providerThread,
          }).pipe(
            Effect.mapError(
              (cause) =>
                new ProviderAdapter.ProviderAdapterResumeThreadError({
                  driver,
                  providerSessionId: input.providerSessionId,
                  providerThreadId: args.providerThread.id,
                  cause,
                }),
            ),
          ),
        injectHistory: (args) =>
          Effect.sync(() => {
            pendingContext = args.context;
            return true;
          }),
        startTurn: (args) =>
          start(args).pipe(
            Effect.mapError(
              (cause) =>
                new ProviderAdapter.ProviderAdapterTurnStartError({
                  driver,
                  threadId: args.threadId,
                  providerThreadId: args.providerThread.id,
                  runId: args.runId,
                  cause,
                }),
            ),
          ),
        steerTurn: (args) =>
          Effect.gen(function* () {
            const turn = active;
            const steer = engine.steer;
            if (!steer)
              return yield* new ProviderAdapter.ProviderAdapterSteerRunUnsupportedError({
                driver,
                providerThreadId: args.providerThread.id,
              });
            if (!turn || turn.providerTurn.id !== args.providerTurnId)
              return yield* new ProviderAdapter.ProviderAdapterSteerRunError({
                driver,
                providerThreadId: args.providerThread.id,
                providerTurnId: args.providerTurnId,
                cause: "The turn is no longer running.",
              });
            const accepted = yield* Effect.promise(() =>
              steer(turn.nativeThreadId, args.message.text).catch(() => false),
            );
            if (!accepted)
              return yield* new ProviderAdapter.ProviderAdapterSteerRunError({
                driver,
                providerThreadId: args.providerThread.id,
                providerTurnId: args.providerTurnId,
                cause: `${engine.displayName} did not accept the message.`,
              });
          }),
        interruptTurn: (args) =>
          Effect.gen(function* () {
            const turn = active;
            if (!turn || turn.providerTurn.id !== args.providerTurnId) return;
            turn.interruptRequested = true;
            yield* Effect.promise(() => engine.stop(turn.nativeThreadId).catch(() => {}));
            turn.controller.abort();
            yield* Deferred.await(turn.done).pipe(
              Effect.timeout(INTERRUPT_TIMEOUT_MS),
              Effect.mapError(
                (cause) =>
                  new ProviderAdapter.ProviderAdapterInterruptError({
                    driver,
                    providerThreadId: args.providerThread.id,
                    providerTurnId: args.providerTurnId,
                    cause,
                  }),
              ),
            );
          }),
        respondToRuntimeRequest: (args) =>
          Effect.gen(function* () {
            const entry = pending.get(args.requestId);
            if (!entry || !active) return yield* protocolError("This request is no longer pending");
            const choice = (Object.keys(APPROVAL_DECISIONS) as ApprovalChoice[]).find(
              (candidate) => APPROVAL_DECISIONS[candidate] === args.decision,
            );
            const answer =
              choice && entry.choices.includes(choice)
                ? choice
                : args.decision === "cancel"
                  ? "deny"
                  : undefined;
            if (!answer) return yield* protocolError("The agent did not offer this decision");
            const turn = active;
            entry.decision = APPROVAL_DECISIONS[answer];
            yield* Effect.tryPromise({
              try: () => engine.answer(turn.nativeThreadId, entry.nativeId, answer),
              catch: (cause) => protocolError("The agent did not take the answer", cause),
            }).pipe(Effect.tapError(() => Effect.sync(() => delete entry.decision)));
            yield* permit.withPermits(1)(resolveRequest(entry, "resolved"));
          }).pipe(
            Effect.mapError(
              (cause) =>
                new ProviderAdapter.ProviderAdapterRuntimeRequestResponseError({
                  driver,
                  requestId: args.requestId,
                  cause,
                }),
            ),
          ),
        readThreadSnapshot: (args) =>
          Effect.succeed({
            providerThread: args.providerThread,
            providerTurns: [],
            messages: [],
            runtimeRequests: [...pending.values()].map((entry) => entry.request),
          }),
        rollbackThread: (args) =>
          Effect.fail(
            new ProviderAdapter.ProviderAdapterRollbackThreadError({
              driver,
              providerThreadId: args.providerThread.id,
              checkpointId: args.target.checkpointId,
              cause: `${engine.displayName} cannot roll back a conversation.`,
            }),
          ),
        forkThread: (args) =>
          Effect.fail(
            new ProviderAdapter.ProviderAdapterForkThreadError({
              driver,
              providerThreadId: args.sourceProviderThread.id,
              cause: `${engine.displayName} has no native forks; T3 forks with a context handoff.`,
            }),
          ),
      };
      return runtime;
    }),
  });
});
