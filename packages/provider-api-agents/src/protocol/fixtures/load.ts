// @effect-diagnostics nodeBuiltinImport:off - Tests read their wire transcripts from disk.
/**
 * Wire transcripts for the protocol tests, transcribed from each agent's
 * documented stream format and server source: OpenRouter's chat completions
 * stream, OpenClaw's `src/gateway/openai-http.ts`, and Hermes'
 * `gateway/platforms/api_server.py`. Replace one with a captured stream when a
 * live recording shows a difference.
 */
import * as NodeFS from "node:fs";

export function fixtureText(name: string): string {
  return NodeFS.readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
}

export function fixtureJson(name: string): unknown {
  return JSON.parse(fixtureText(name));
}

/** A streamed response that delivers the fixture in small, uneven network chunks. */
export function fixtureResponse(
  name: string,
  init: { readonly status?: number; readonly contentType?: string } = {},
): Response {
  return streamedResponse(fixtureText(name), init);
}

export function streamedResponse(
  text: string,
  init: { readonly status?: number; readonly contentType?: string } = {},
): Response {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  let size = 3;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) return controller.close();
      controller.enqueue(bytes.slice(offset, offset + size));
      offset += size;
      size = (size * 7) % 61 || 5;
    },
  });
  return new Response(body, {
    status: init.status ?? 200,
    headers: { "content-type": init.contentType ?? "text/event-stream" },
  });
}

export function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export interface RecordedRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

/** A fetch that answers from a script, in order, and records what it was sent. */
export function scriptedFetch(responses: ReadonlyArray<(request: RecordedRequest) => Response>) {
  const requests: RecordedRequest[] = [];
  let next = 0;
  const fetch = async (input: string, init?: RequestInit): Promise<Response> => {
    init?.signal?.throwIfAborted();
    const request: RecordedRequest = {
      url: input,
      method: init?.method ?? "GET",
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    requests.push(request);
    const respond = responses[next++];
    if (!respond) throw new Error(`Unexpected request ${request.method} ${input}`);
    return respond(request);
  };
  return { fetch, requests };
}
