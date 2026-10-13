import { describe, expect, it } from "vite-plus/test";

import { fixtureResponse } from "./fixtures/load.ts";
import { makeSseDecoder, readSse, type SseFrame } from "./sse.ts";

describe("SSE decoding", () => {
  it("joins frames split across chunks, CRLF lines and multi-line data", () => {
    const sse = makeSseDecoder();
    const frames = [
      ...sse.push("event: run.st"),
      ...sse.push('arted\r\ndata: {"a":'),
      ...sse.push("1}\r"),
      ...sse.push("\n\r\n: keepalive\n\ndata: line one\ndata: line two\n"),
      ...sse.push("\n"),
    ];
    expect(frames).toEqual([
      { event: "run.started", data: '{"a":1}' },
      { event: null, data: "line one\nline two" },
    ]);
  });

  it("keeps a final frame that lacks its blank line", () => {
    const sse = makeSseDecoder();
    expect(sse.push("data: [DONE]")).toEqual([]);
    expect(sse.end()).toEqual([{ event: null, data: "[DONE]" }]);
  });

  it("reads a whole stream delivered in uneven chunks", async () => {
    const frames: SseFrame[] = [];
    await readSse(fixtureResponse("hermes-session-turn.sse").body!, (batch) =>
      frames.push(...batch),
    );
    expect(frames.map((frame) => frame.event)).toEqual([
      "run.started",
      "message.started",
      "tool.progress",
      "assistant.delta",
      "tool.started",
      "tool.completed",
      "approval.request",
      "tool.started",
      "tool.completed",
      "assistant.delta",
      "assistant.completed",
      "run.completed",
      "done",
    ]);
  });
});
