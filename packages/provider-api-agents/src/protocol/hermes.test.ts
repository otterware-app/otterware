import { describe, expect, it } from "vite-plus/test";

import {
  fixtureJson,
  fixtureResponse,
  fixtureText,
  jsonResponse,
  scriptedFetch,
  streamedResponse,
} from "./fixtures/load.ts";
import {
  answerHermesApproval,
  createHermesSession,
  hermesModelFields,
  makeHermesTurnMapper,
  normalizeHermesRoot,
  parseHermesModelOptions,
  runHermesTurn,
} from "./hermes.ts";
import { makeSseDecoder } from "./sse.ts";
import type { AgentEvent } from "./types.ts";

describe("Hermes sessions", () => {
  it("maps a session stream: reasoning, text, tool calls and a command approval", () => {
    const sse = makeSseDecoder();
    const mapper = makeHermesTurnMapper();
    const events = [...sse.push(fixtureText("hermes-session-turn.sse")), ...sse.end()].flatMap(
      mapper.push,
    );
    expect(events).toEqual([
      { type: "run.started", runId: "run_5d2f8a" },
      { type: "reasoning.delta", text: "I should list the folder first." },
      { type: "text.delta", text: "I'll check the folder." },
      {
        type: "tool.started",
        id: "hermes-tool-1",
        name: "terminal",
        input: { command: "ls build" },
      },
      { type: "tool.completed", id: "hermes-tool-1", output: "app.js\nassets", isError: false },
      {
        type: "approval.requested",
        id: "apr_31c",
        kind: "command",
        title: "rm -rf build",
        detail: "recursive delete",
        choices: ["once", "session", "deny"],
      },
      {
        type: "tool.started",
        id: "hermes-tool-2",
        name: "terminal",
        input: { command: "rm -rf build" },
      },
      { type: "tool.completed", id: "hermes-tool-2", output: "(done)", isError: false },
      { type: "text.delta", text: " Done, the build folder is gone." },
      { type: "usage", inputTokens: 3210, outputTokens: 84 },
    ]);
    expect(mapper.outcome()).toEqual({ status: "completed" });
  });

  it("reports why a run failed, and a stream that ends early as lost", async () => {
    const failed = makeHermesTurnMapper();
    const sse = makeSseDecoder();
    [...sse.push(fixtureText("hermes-failed-turn.sse")), ...sse.end()].forEach(failed.push);
    expect(failed.outcome()).toEqual({
      status: "failed",
      message: "Hermes failed: iteration_budget_exhausted",
      failureClass: "provider_error",
    });

    const truncated = fixtureText("hermes-session-turn.sse").split("event: run.completed")[0]!;
    const { fetch } = scriptedFetch([() => streamedResponse(truncated)]);
    const outcome = await runHermesTurn({
      fetch,
      root: "http://hermes.test:8642",
      apiKey: "key",
      sessionId: "sess_42",
      message: "Clean up",
      model: "default",
      emit: () => {},
      signal: new AbortController().signal,
    });
    expect(outcome).toMatchObject({ status: "failed", failureClass: "transport_error" });
  });

  it("streams a turn into the session with the chosen model", async () => {
    const { fetch, requests } = scriptedFetch([() => fixtureResponse("hermes-session-turn.sse")]);
    const events: AgentEvent[] = [];
    const outcome = await runHermesTurn({
      fetch,
      root: normalizeHermesRoot("http://hermes.test:8642/v1/"),
      apiKey: "server-key",
      sessionId: "sess 42",
      message: "Clean up the build folder",
      model: "anthropic::claude-sonnet-4.5",
      emit: (event) => events.push(event),
      signal: new AbortController().signal,
    });
    expect(outcome).toEqual({ status: "completed" });
    expect(requests[0]).toMatchObject({
      url: "http://hermes.test:8642/api/sessions/sess%2042/chat/stream",
      method: "POST",
      headers: { authorization: "Bearer server-key", accept: "text/event-stream" },
      body: {
        message: "Clean up the build folder",
        provider: "anthropic",
        model: "claude-sonnet-4.5",
      },
    });
    expect(events.filter((event) => event.type === "text.delta")).toHaveLength(2);
  });

  it("creates a session, retrying without a title that clashes", async () => {
    const { fetch, requests } = scriptedFetch([
      () => jsonResponse({ error: { message: "title exists" } }, 400),
      () => jsonResponse({ session: { id: "sess_new" } }),
    ]);
    const id = await createHermesSession(
      fetch,
      "http://hermes.test:8642",
      "key",
      "Fix the build",
      new AbortController().signal,
    );
    expect(id).toBe("sess_new");
    expect(requests.map((request) => request.body)).toEqual([
      { source: "api_server", title: "Fix the build" },
      { source: "api_server" },
    ]);
  });

  it("answers an approval on its run and treats an already settled one as done", async () => {
    const { fetch, requests } = scriptedFetch([() => jsonResponse({}, 409)]);
    await answerHermesApproval(
      fetch,
      "http://hermes.test:8642",
      "key",
      "run_1",
      "req_9",
      "session",
    );
    expect(requests[0]).toMatchObject({
      url: "http://hermes.test:8642/v1/runs/run_1/approval",
      body: { choice: "session", request_id: "req_9" },
    });
  });

  it("lists the gateway's models with its own default first", () => {
    expect(parseHermesModelOptions(fixtureJson("hermes-model-options.json"))).toEqual([
      { slug: "default", name: "Hermes default", isDefault: true },
      {
        slug: "anthropic::claude-sonnet-4.5",
        name: "claude-sonnet-4.5",
        subProvider: "Anthropic",
      },
      { slug: "anthropic::claude-opus-4.5", name: "Claude Opus 4.5", subProvider: "Anthropic" },
      { slug: "nous::default", name: "Nous Portal", subProvider: "Nous Portal" },
    ]);
    expect(hermesModelFields("default")).toEqual({});
    expect(hermesModelFields("nous::default")).toEqual({ provider: "nous", model: "default" });
  });
});
