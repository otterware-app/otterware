/**
 * Server-sent events, as OpenRouter, OpenClaw, Hermes and MCP servers stream
 * them. Portable: no Node APIs.
 *
 * @module provider-api-agents/protocol/sse
 */

export interface SseFrame {
  /** The `event:` name, or `null` for the default `message` event. */
  readonly event: string | null;
  readonly data: string;
}

/**
 * Incremental SSE parser. Feed text as it arrives; complete frames come back.
 * Comment lines (`: keepalive`) and frames without data are dropped.
 */
export function makeSseDecoder() {
  let buffer = "";
  let event: string | null = null;
  let data: string[] = [];

  const takeLine = (line: string, frames: SseFrame[]) => {
    if (line === "") {
      if (data.length > 0) frames.push({ event, data: data.join("\n") });
      event = null;
      data = [];
      return;
    }
    if (line.startsWith(":")) return;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  };

  return {
    push(text: string): SseFrame[] {
      buffer += text;
      const frames: SseFrame[] = [];
      for (;;) {
        const newline = buffer.search(/\r\n|\r|\n/);
        if (newline === -1) break;
        const separatorLength = buffer.startsWith("\r\n", newline) ? 2 : 1;
        // A lone trailing `\r` may be the first half of `\r\n`; wait for more.
        if (buffer[newline] === "\r" && separatorLength === 1 && newline === buffer.length - 1)
          break;
        takeLine(buffer.slice(0, newline), frames);
        buffer = buffer.slice(newline + separatorLength);
      }
      return frames;
    },
    /** Ends the stream: a final frame without its blank line still counts. */
    end(): SseFrame[] {
      const frames: SseFrame[] = [];
      if (buffer) takeLine(buffer, frames);
      buffer = "";
      takeLine("", frames);
      return frames;
    },
  };
}

/**
 * Reads an SSE body and hands over the frames of each network chunk at once,
 * so callers can apply a chunk's deltas together and publish once.
 */
export async function readSse(
  body: ReadableStream<Uint8Array>,
  onFrames: (frames: ReadonlyArray<SseFrame>) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const sse = makeSseDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const frames = sse.push(decoder.decode(value, { stream: true }));
      if (frames.length > 0) onFrames(frames);
    }
    const rest = sse.push(decoder.decode());
    const last = [...rest, ...sse.end()];
    if (last.length > 0) onFrames(last);
  } finally {
    reader.releaseLock();
  }
}

/** Parses a frame's JSON payload; `null` for `[DONE]` and malformed data. */
export function parseSseJson(data: string): Record<string, unknown> | null {
  if (data === "[DONE]") return null;
  try {
    const value: unknown = JSON.parse(data);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
