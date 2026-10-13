import { assert, describe, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  EnvironmentId,
  MessageId,
  NodeId,
  ProjectId,
  ProviderInstanceId,
  ProviderSessionId,
  RunAttemptId,
  RunId,
  ThreadId,
  type OrchestrationV2AppThread,
  type OrchestrationV2ProviderThread,
  type RuntimeMode,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import * as IdAllocator from "@t3tools/provider-core/server/IdAllocator";
import * as McpProviderSessions from "@t3tools/provider-core/server/McpProviderSessions";
import * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import * as TestProviderHost from "@t3tools/provider-testing/TestProviderHost";

import { fixtureResponse, jsonResponse, type RecordedRequest } from "../protocol/fixtures/load.ts";
import type { ChatMessage, Fetch } from "../protocol/types.ts";
import { HermesSettings, OpenRouterSettings } from "../settings.ts";
import { makeApiAgentAdapter } from "./adapter.ts";
import { makeHermesEngine, makeOpenRouterEngine, type ApiAgentEngine } from "./engines.ts";

const testLayer = Layer.mergeAll(
  NodeServices.layer,
  IdAllocator.layer,
  McpProviderSessions.layer,
  TestProviderHost.layer().pipe(Layer.provide(NodeServices.layer)),
);
const INSTANCE_ID = ProviderInstanceId.make("openrouter_work");
const THREAD_ID = ThreadId.make("thread-api-agent-test");
const MODEL = "anthropic/claude-sonnet-4.5";
const MCP_ENDPOINT = "http://127.0.0.1:43210/mcp";
const decodeOpenRouterSettings = Schema.decodeSync(OpenRouterSettings);
const decodeHermesSettings = Schema.decodeSync(HermesSettings);

type Route = (request: RecordedRequest) => Response | undefined;

/** A fetch that serves T3's MCP tools and answers model requests from a script, in order. */
function fakeNetwork(steps: ReadonlyArray<string | ((request: RecordedRequest) => Response)>) {
  const requests: RecordedRequest[] = [];
  const queue = [...steps];
  const mcp: Route = (request) => {
    if (request.url !== MCP_ENDPOINT) return undefined;
    const body = request.body as { id?: number; method: string };
    if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
    const result =
      body.method === "initialize"
        ? { protocolVersion: "2025-06-18", capabilities: { tools: {} } }
        : body.method === "tools/list"
          ? {
              tools: [
                {
                  name: "t3_thread_list",
                  description: "List threads",
                  inputSchema: { type: "object", properties: { limit: { type: "number" } } },
                },
              ],
            }
          : { content: [{ type: "text", text: '["thread-1","thread-2"]' }] };
    return jsonResponse({ jsonrpc: "2.0", id: body.id, result });
  };
  const fetch: Fetch = async (input, init) => {
    init?.signal?.throwIfAborted();
    const request: RecordedRequest = {
      url: input,
      method: init?.method ?? "GET",
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    requests.push(request);
    const served = mcp(request);
    if (served) return served;
    const step = queue.shift();
    if (step === undefined) throw new Error(`Unexpected request ${request.method} ${input}`);
    return typeof step === "string" ? fixtureResponse(step) : step(request);
  };
  return { fetch, requests, modelRequests: () => requests.filter((r) => r.url !== MCP_ENDPOINT) };
}

const turnInput = Effect.fnUntraced(function* (
  providerThread: OrchestrationV2ProviderThread,
  runOrdinal: number,
  runtimeMode: RuntimeMode,
  text = "What threads do I have?",
): Effect.fn.Return<ProviderAdapter.ProviderAdapterV2TurnInput> {
  const now = yield* DateTime.now;
  const modelSelection = { instanceId: providerThread.providerInstanceId, model: MODEL };
  const appThread: OrchestrationV2AppThread = {
    id: THREAD_ID,
    projectId: ProjectId.make("project-api-agent-test"),
    title: "API agent test",
    createdBy: "user",
    creationSource: "web",
    providerInstanceId: providerThread.providerInstanceId,
    modelSelection,
    runtimeMode,
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    activeProviderThreadId: providerThread.id,
    lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: THREAD_ID },
    forkedFrom: null,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    lastVisitedAt: null,
    deletedAt: null,
  };
  return {
    appThread,
    threadId: THREAD_ID,
    runId: RunId.make(`run-${runOrdinal}`),
    runOrdinal,
    providerTurnOrdinal: runOrdinal,
    attemptId: RunAttemptId.make(`attempt-${runOrdinal}`),
    rootNodeId: NodeId.make(`root-${runOrdinal}`),
    providerThread,
    message: {
      messageId: MessageId.make(`message-${runOrdinal}`),
      text,
      attachments: [],
      createdBy: "user",
      creationSource: "web",
    },
    modelSelection,
    runtimePolicy: { runtimeMode, interactionMode: "default", cwd: null },
  };
});

const openHarness = Effect.fnUntraced(function* (
  engine: ApiAgentEngine,
  fetch: Fetch,
  runtimeMode: RuntimeMode,
) {
  yield* (yield* McpProviderSessions.McpProviderSessions).set({
    environmentId: EnvironmentId.make("test-environment"),
    threadId: THREAD_ID,
    providerSessionId: "test-session",
    providerInstanceId: INSTANCE_ID,
    endpoint: MCP_ENDPOINT,
    authorizationHeader: "Bearer thread-token",
    browserToolsAvailable: false,
  });
  const adapter = yield* makeApiAgentAdapter({
    instanceId: INSTANCE_ID,
    engine,
    fetch,
    modelCatalog: Effect.succeed([]),
  });
  const runtime = yield* adapter.openSession({
    threadId: THREAD_ID,
    providerSessionId: ProviderSessionId.make("session-api-agent"),
    modelSelection: { instanceId: INSTANCE_ID, model: MODEL },
    runtimePolicy: { runtimeMode, interactionMode: "default", cwd: null },
  });
  const emitted = yield* Queue.unbounded<ProviderAdapter.ProviderAdapterV2Event>();
  const all: ProviderAdapter.ProviderAdapterV2Event[] = [];
  yield* runtime.events.pipe(
    Stream.runForEach((event) =>
      Effect.sync(() => all.push(event)).pipe(Effect.andThen(Queue.offer(emitted, event))),
    ),
    Effect.forkScoped,
  );
  const providerThread = yield* runtime.ensureThread({
    threadId: THREAD_ID,
    title: "API agent test",
    modelSelection: { instanceId: INSTANCE_ID, model: MODEL },
    runtimePolicy: { runtimeMode, interactionMode: "default", cwd: null },
  });
  const takeEvent = Effect.fnUntraced(function* <
    T extends ProviderAdapter.ProviderAdapterV2Event["type"],
  >(
    type: T,
    predicate: (
      event: Extract<ProviderAdapter.ProviderAdapterV2Event, { type: T }>,
    ) => boolean = () => true,
  ) {
    for (;;) {
      const event = yield* Queue.take(emitted);
      if (
        event.type === type &&
        predicate(event as Extract<ProviderAdapter.ProviderAdapterV2Event, { type: T }>)
      )
        return event as Extract<ProviderAdapter.ProviderAdapterV2Event, { type: T }>;
    }
  });
  return { runtime, providerThread, takeEvent, all };
});

const openRouter = (fetch: Fetch) =>
  makeOpenRouterEngine(decodeOpenRouterSettings({ enabled: true, apiKey: "sk-or-test" }), {
    fetch,
  });

describe("API agent adapter", () => {
  it.effect("asks before a T3 tool in Supervised mode, then runs it and answers", () =>
    Effect.gen(function* () {
      const network = fakeNetwork(["openrouter-tool-step.sse", "openrouter-answer-step.sse"]);
      const { runtime, providerThread, takeEvent, all } = yield* openHarness(
        openRouter(network.fetch),
        network.fetch,
        "approval-required",
      );
      yield* runtime.startTurn(yield* turnInput(providerThread, 1, "approval-required"));

      const asked = yield* takeEvent(
        "runtime_request.updated",
        (e) => e.runtimeRequest.status === "pending",
      );
      assert.strictEqual(asked.runtimeRequest.kind, "permission");
      const prompt = yield* takeEvent(
        "turn_item.updated",
        (e) => e.turnItem.type === "approval_request",
      );
      assert.deepStrictEqual(
        prompt.turnItem.type === "approval_request"
          ? prompt.turnItem.options?.map((o) => o.decision)
          : [],
        ["accept", "acceptForSession", "decline"],
      );
      yield* runtime.respondToRuntimeRequest({
        requestId: asked.runtimeRequest.id,
        decision: "accept",
      });

      const terminal = yield* takeEvent("turn.terminal");
      assert.strictEqual(terminal.status, "completed");
      const resolved = all.findLast(
        (e) =>
          e.type === "runtime_request.updated" && e.runtimeRequest.id === asked.runtimeRequest.id,
      );
      assert.deepInclude(
        resolved?.type === "runtime_request.updated" ? resolved.runtimeRequest : {},
        {
          status: "resolved",
          decision: "accept",
        },
      );
      const tool = all.findLast(
        (e) => e.type === "turn_item.updated" && e.turnItem.type === "dynamic_tool",
      );
      assert.deepInclude(tool?.type === "turn_item.updated" ? tool.turnItem : {}, {
        status: "completed",
        toolName: "mcp__t3-code__t3_thread_list",
        output: '["thread-1","thread-2"]',
      });
      const messages = all.flatMap((e) =>
        e.type === "message.updated" && !e.message.streaming ? [e.message.text] : [],
      );
      assert.deepStrictEqual(messages, [
        "Let me look at your threads.",
        "You have two open threads.",
      ]);
      const reasoning = all.findLast(
        (e) => e.type === "turn_item.updated" && e.turnItem.type === "reasoning",
      );
      assert.deepInclude(reasoning?.type === "turn_item.updated" ? reasoning.turnItem : {}, {
        text: "The user wants their threads. ",
        streaming: false,
      });
      const system = (network.modelRequests()[0]!.body as { messages: ChatMessage[] }).messages[0];
      assert.include(
        system?.role === "system" ? system.content : "",
        "through the OpenRouter harness",
      );
    }).pipe(Effect.scoped, Effect.provide(testLayer)),
  );

  it.effect("keeps the conversation between turns, since OpenRouter has no history", () =>
    Effect.gen(function* () {
      const network = fakeNetwork(["openrouter-answer-step.sse", "openrouter-answer-step.sse"]);
      const engine = openRouter(network.fetch);
      const first = yield* openHarness(engine, network.fetch, "full-access");
      yield* first.runtime.startTurn(
        yield* turnInput(first.providerThread, 1, "full-access", "First?"),
      );
      yield* first.takeEvent("turn.terminal");
      yield* first.runtime.startTurn(
        yield* turnInput(first.providerThread, 2, "full-access", "Second?"),
      );
      yield* first.takeEvent("turn.terminal");
      const sent = (network.modelRequests()[1]!.body as { messages: ChatMessage[] }).messages;
      assert.deepStrictEqual(
        sent.map((message) => [message.role, message.role === "system" ? "" : message.content]),
        [
          ["system", ""],
          ["user", "First?"],
          ["assistant", "You have two open threads."],
          ["user", "Second?"],
        ],
      );
    }).pipe(Effect.scoped, Effect.provide(testLayer)),
  );

  it.effect("ends an interrupted turn while it waits for an approval", () =>
    Effect.gen(function* () {
      const network = fakeNetwork(["openrouter-tool-step.sse"]);
      const { runtime, providerThread, takeEvent } = yield* openHarness(
        openRouter(network.fetch),
        network.fetch,
        "approval-required",
      );
      yield* runtime.startTurn(yield* turnInput(providerThread, 1, "approval-required"));
      const running = yield* takeEvent(
        "provider_turn.updated",
        (e) => e.providerTurn.status === "running",
      );
      yield* takeEvent("runtime_request.updated", (e) => e.runtimeRequest.status === "pending");
      yield* runtime.interruptTurn({ providerThread, providerTurnId: running.providerTurn.id });
      const cancelled = yield* takeEvent(
        "runtime_request.updated",
        (e) => e.runtimeRequest.status === "cancelled",
      );
      assert.strictEqual(cancelled.runtimeRequest.status, "cancelled");
      const terminal = yield* takeEvent("turn.terminal");
      assert.strictEqual(terminal.status, "interrupted");
    }).pipe(Effect.scoped, Effect.provide(testLayer)),
  );

  it.effect("fails a turn with a rejected key as a permission error", () =>
    Effect.gen(function* () {
      const network = fakeNetwork([
        () => jsonResponse({ error: { message: "User not found." } }, 401),
      ]);
      const { runtime, providerThread, takeEvent } = yield* openHarness(
        openRouter(network.fetch),
        network.fetch,
        "full-access",
      );
      yield* runtime.startTurn(yield* turnInput(providerThread, 1, "full-access"));
      const terminal = yield* takeEvent("turn.terminal");
      assert.strictEqual(terminal.status, "failed");
      assert.deepInclude(terminal.failure ?? {}, { class: "permission_error" });
      assert.include(terminal.failure?.message ?? "", "OpenRouter rejected the API key");
    }).pipe(Effect.scoped, Effect.provide(testLayer)),
  );

  it.effect("answers Hermes' own command approvals itself in Full access", () =>
    Effect.gen(function* () {
      const network = fakeNetwork([
        () => jsonResponse({ session: { id: "sess_42" } }),
        "hermes-session-turn.sse",
        () => jsonResponse({ object: "hermes.run.approval_response" }),
      ]);
      const engine = makeHermesEngine(
        decodeHermesSettings({
          enabled: true,
          baseUrl: "http://hermes.test:8642",
          apiKey: "server-key",
        }),
        { fetch: network.fetch },
      );
      const { runtime, providerThread, takeEvent, all } = yield* openHarness(
        engine,
        network.fetch,
        "full-access",
      );
      assert.strictEqual(providerThread.nativeThreadRef?.nativeId, "sess_42");
      yield* runtime.startTurn(yield* turnInput(providerThread, 1, "full-access"));
      const terminal = yield* takeEvent("turn.terminal");
      assert.strictEqual(terminal.status, "completed");
      assert.isFalse(all.some((e) => e.type === "runtime_request.updated"));
      const tools = all.filter(
        (e) => e.type === "turn_item.updated" && e.turnItem.type === "dynamic_tool",
      );
      assert.isTrue(
        tools.some(
          (e) =>
            e.type === "turn_item.updated" &&
            e.turnItem.type === "dynamic_tool" &&
            e.turnItem.toolName === "terminal",
        ),
      );
      // Hermes runs its own tools; T3's MCP server is never contacted.
      assert.isFalse(network.requests.some((request) => request.url === MCP_ENDPOINT));
    }).pipe(Effect.scoped, Effect.provide(testLayer)),
  );
});
