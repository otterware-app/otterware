import { describe, expect, it } from "vite-plus/test";

import { makeChatStepAccumulator, streamChatStep, userMessage } from "./chatCompletions.ts";
import { fixtureResponse, fixtureText, jsonResponse, scriptedFetch } from "./fixtures/load.ts";
import { makeSseDecoder } from "./sse.ts";
import { AgentTurnError, type AgentEvent } from "./types.ts";

const accumulate = (fixture: string) => {
  const sse = makeSseDecoder();
  const step = makeChatStepAccumulator();
  const frames = [...sse.push(fixtureText(fixture)), ...sse.end()];
  const events = frames.flatMap(step.push);
  return { events, step };
};

describe("chat completion streams", () => {
  it("assembles OpenRouter reasoning, text and a tool call split over chunks", () => {
    const { events, step } = accumulate("openrouter-tool-step.sse");
    expect(events).toEqual([
      { type: "reasoning.delta", text: "The user wants their threads. " },
      { type: "text.delta", text: "Let me look" },
      { type: "text.delta", text: " at your threads." },
      { type: "usage", inputTokens: 1420, outputTokens: 61 },
    ]);
    expect(step.result()).toEqual({
      text: "Let me look at your threads.",
      finishReason: "tool_calls",
      toolCalls: [
        {
          id: "toolu_01ABC",
          type: "function",
          function: { name: "t3_thread_list", arguments: '{"limit": 5}' },
        },
      ],
    });
  });

  it("reads OpenClaw's tool call chunks the same way", () => {
    const { step } = accumulate("openclaw-tool-step.sse");
    expect(step.result()).toMatchObject({
      text: "Checking the thread list.",
      finishReason: "tool_calls",
      toolCalls: [
        { id: "call_q1", function: { name: "t3_thread_list", arguments: '{"limit":5}' } },
      ],
    });
  });

  it("fails a step when the stream reports an error after partial text", () => {
    const { events, step } = accumulate("openclaw-failed-run.sse");
    expect(events).toEqual([{ type: "text.delta", text: "Partial" }]);
    expect(() => step.result()).toThrow("agent run was cancelled");
  });

  it("classifies HTTP failures so a bad key or a limit is not a generic error", async () => {
    for (const [status, failureClass] of [
      [401, "auth"],
      [402, "usage_limit"],
      [429, "usage_limit"],
      [404, "provider_error"],
      [503, "transport_error"],
    ] as const) {
      const { fetch } = scriptedFetch([() => jsonResponse({ error: { message: "nope" } }, status)]);
      const failure = await streamChatStep(
        {
          fetch,
          url: "https://example.test/v1/chat/completions",
          headers: {},
          body: {},
          agentName: "Agent",
          signal: new AbortController().signal,
        },
        () => {},
      ).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(AgentTurnError);
      expect((failure as AgentTurnError).failureClass).toBe(failureClass);
      expect((failure as AgentTurnError).message).toContain("nope");
    }
  });

  it("streams deltas to the caller as each chunk arrives", async () => {
    const { fetch, requests } = scriptedFetch([
      () => fixtureResponse("openrouter-answer-step.sse"),
    ]);
    const batches: AgentEvent[][] = [];
    const result = await streamChatStep(
      {
        fetch,
        url: "https://openrouter.ai/api/v1/chat/completions",
        headers: { Authorization: "Bearer sk-or-test" },
        body: { model: "anthropic/claude-sonnet-4.5", messages: [] },
        agentName: "OpenRouter",
        signal: new AbortController().signal,
      },
      (events) => batches.push([...events]),
    );
    expect(result).toEqual({
      text: "You have two open threads.",
      toolCalls: [],
      finishReason: "stop",
    });
    expect(requests[0]?.body).toMatchObject({ stream: true, model: "anthropic/claude-sonnet-4.5" });
    expect(batches.flat().filter((event) => event.type === "text.delta")).toHaveLength(2);
  });
});

describe("user messages", () => {
  const encode = (text: string) => btoa(text);

  it("sends plain text alone and inlines text attachments", () => {
    expect(userMessage("hi", [], { agentName: "A", acceptsImages: true })).toEqual({
      role: "user",
      content: "hi",
    });
    expect(
      userMessage(
        "Summarize",
        [
          { name: "notes.md", mimeType: "text/markdown", data: encode("# Notes") },
          { name: "shot.png", mimeType: "image/png", data: "iVBORw0KGgo=" },
        ],
        { agentName: "A", acceptsImages: true },
      ),
    ).toEqual({
      role: "user",
      content: [
        { type: "text", text: "Summarize\n\n--- notes.md ---\n# Notes" },
        { type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgo=" } },
      ],
    });
  });

  it("refuses files the agent cannot read", () => {
    expect(() =>
      userMessage("x", [{ name: "deck.pdf", mimeType: "application/pdf", data: "" }], {
        agentName: "Hermes",
        acceptsImages: true,
      }),
    ).toThrow("Hermes can't read deck.pdf");
  });
});
