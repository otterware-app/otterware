import { describe, expect, it } from "vite-plus/test";

import { fixtureResponse, scriptedFetch } from "./fixtures/load.ts";
import { openClawLoopTarget } from "./openClaw.ts";
import { openRouterLoopTarget } from "./openRouter.ts";
import { makeApprovalGate, runToolLoop, settleOpenToolCalls } from "./toolLoop.ts";
import type { AgentEvent, AgentTool, ChatMessage, ToolHost } from "./types.ts";

const LIST_TOOL: AgentTool = {
  name: "t3_thread_list",
  description: "List threads",
  inputSchema: { type: "object", properties: { limit: { type: "number" } } },
  readOnly: false,
};

function fakeToolHost(text = '["thread-1","thread-2"]') {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const host: ToolHost = {
    list: async () => [LIST_TOOL],
    call: async (name, args) => {
      calls.push({ name, args });
      return { text, isError: false };
    },
  };
  return { host, calls };
}

const baseOptions = (overrides: {
  readonly fetch: ReturnType<typeof scriptedFetch>["fetch"];
  readonly messages: ChatMessage[];
  readonly events: AgentEvent[];
  readonly toolHost: ToolHost;
  readonly askBeforeChanges?: boolean;
  readonly approvals?: ReturnType<typeof makeApprovalGate>;
  readonly signal?: AbortSignal;
  readonly onEvent?: (event: AgentEvent) => void;
}) => ({
  ...openRouterLoopTarget("sk-or-test", "anthropic/claude-sonnet-4.5"),
  fetch: overrides.fetch,
  system: "runtime instructions",
  messages: overrides.messages,
  tools: [LIST_TOOL],
  toolHost: overrides.toolHost,
  askBeforeChanges: overrides.askBeforeChanges ?? false,
  approvals: overrides.approvals ?? makeApprovalGate(),
  sessionAllowed: new Set<string>(),
  emit: (event: AgentEvent) => {
    overrides.events.push(event);
    overrides.onEvent?.(event);
  },
  signal: overrides.signal ?? new AbortController().signal,
});

describe("tool loop", () => {
  it("runs a tool call and sends the whole conversation back to OpenRouter", async () => {
    const { fetch, requests } = scriptedFetch([
      () => fixtureResponse("openrouter-tool-step.sse"),
      () => fixtureResponse("openrouter-answer-step.sse"),
    ]);
    const tools = fakeToolHost();
    const events: AgentEvent[] = [];
    const messages: ChatMessage[] = [{ role: "user", content: "What threads do I have?" }];
    const outcome = await runToolLoop(
      baseOptions({ fetch, messages, events, toolHost: tools.host }),
    );

    expect(outcome).toEqual({ status: "completed" });
    expect(tools.calls).toEqual([{ name: "t3_thread_list", args: { limit: 5 } }]);
    expect(events.filter((event) => event.type.startsWith("tool."))).toEqual([
      { type: "tool.started", id: "toolu_01ABC", name: "t3_thread_list", input: { limit: 5 } },
      {
        type: "tool.completed",
        id: "toolu_01ABC",
        output: '["thread-1","thread-2"]',
        isError: false,
      },
    ]);
    expect(requests[0]?.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(requests[0]?.headers.authorization).toBe("Bearer sk-or-test");
    expect(requests[0]?.body).toMatchObject({
      model: "anthropic/claude-sonnet-4.5",
      provider: { require_parameters: true, data_collection: "deny" },
      tools: [{ type: "function", function: { name: "t3_thread_list" } }],
    });
    // Stateless: the second request carries the system prompt, question, tool call and result.
    expect((requests[1]!.body as { messages: ChatMessage[] }).messages.map((m) => m.role)).toEqual([
      "system",
      "user",
      "assistant",
      "tool",
    ]);
    expect(messages.at(-1)).toEqual({ role: "assistant", content: "You have two open threads." });
  });

  it("sends OpenClaw only what its session has not seen", async () => {
    const { fetch, requests } = scriptedFetch([
      () => fixtureResponse("openclaw-tool-step.sse"),
      () => fixtureResponse("openclaw-answer-step.sse"),
    ]);
    const events: AgentEvent[] = [];
    const outcome = await runToolLoop({
      ...baseOptions({
        fetch,
        messages: [{ role: "user", content: "What threads do I have?" }],
        events,
        toolHost: fakeToolHost().host,
      }),
      ...openClawLoopTarget({
        baseUrl: "http://127.0.0.1:18789",
        token: "gateway-token",
        sessionKey: "otterware:abc",
        model: "openclaw/default",
      }),
      unsentFrom: 0,
    });

    expect(outcome).toEqual({ status: "completed" });
    expect(requests[0]?.url).toBe("http://127.0.0.1:18789/v1/chat/completions");
    expect(requests[0]?.headers["x-openclaw-session-key"]).toBe("otterware:abc");
    const roles = (index: number) =>
      (requests[index]!.body as { messages: ChatMessage[] }).messages.map((m) => m.role);
    expect(roles(0)).toEqual(["system", "user"]);
    // The follow-up repeats the tool call so the gateway can match its result.
    expect(roles(1)).toEqual(["system", "assistant", "tool"]);
  });

  it("asks before a tool that changes something and honors a decline", async () => {
    const { fetch } = scriptedFetch([
      () => fixtureResponse("openrouter-tool-step.sse"),
      () => fixtureResponse("openrouter-answer-step.sse"),
    ]);
    const tools = fakeToolHost();
    const approvals = makeApprovalGate();
    const events: AgentEvent[] = [];
    const asked = approvalRequested();
    const running = runToolLoop(
      baseOptions({
        fetch,
        messages: [{ role: "user", content: "Archive everything" }],
        events,
        toolHost: tools.host,
        askBeforeChanges: true,
        approvals,
        onEvent: asked.onEvent,
      }),
    );
    await asked.promise;
    expect(approvals.has("approval:toolu_01ABC")).toBe(true);
    expect(events.find((event) => event.type === "approval.requested")).toMatchObject({
      id: "approval:toolu_01ABC",
      kind: "tool",
      title: "t3_thread_list",
      choices: ["once", "session", "deny"],
    });
    approvals.answer("approval:toolu_01ABC", "deny");
    expect(await running).toEqual({ status: "completed" });
    expect(tools.calls).toEqual([]);
    expect(events.find((event) => event.type === "tool.completed")).toMatchObject({
      isError: true,
      output: "The user declined this tool call.",
    });
  });

  it("returns cancelled when stopped while waiting for an approval", async () => {
    const { fetch } = scriptedFetch([() => fixtureResponse("openrouter-tool-step.sse")]);
    const controller = new AbortController();
    const approvals = makeApprovalGate();
    const messages: ChatMessage[] = [{ role: "user", content: "Archive everything" }];
    const asked = approvalRequested();
    const running = runToolLoop(
      baseOptions({
        fetch,
        messages,
        events: [],
        toolHost: fakeToolHost().host,
        askBeforeChanges: true,
        approvals,
        signal: controller.signal,
        onEvent: asked.onEvent,
      }),
    );
    await asked.promise;
    controller.abort();
    expect(await running).toEqual({ status: "cancelled" });
    settleOpenToolCalls(messages);
    expect(messages.at(-1)).toEqual({
      role: "tool",
      tool_call_id: "toolu_01ABC",
      content: "The turn was stopped before this tool call finished.",
    });
  });

  it("fails with the agent's own error message", async () => {
    const { fetch } = scriptedFetch([() => fixtureResponse("openclaw-failed-run.sse")]);
    const outcome = await runToolLoop(
      baseOptions({
        fetch,
        messages: [{ role: "user", content: "hi" }],
        events: [],
        toolHost: fakeToolHost().host,
      }),
    );
    expect(outcome).toEqual({
      status: "failed",
      message: "agent run was cancelled",
      failureClass: "provider_error",
    });
  });
});

/** Resolves once the loop asks; by then it is waiting on the gate. */
function approvalRequested() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return {
    promise,
    onEvent: (event: AgentEvent) => {
      if (event.type === "approval.requested") resolve();
    },
  };
}
