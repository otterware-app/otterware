/**
 * OpenAI-compatible chat completions with streaming and client tools, the
 * protocol OpenRouter and OpenClaw's gateway share. Portable: no Node APIs.
 *
 * @module provider-api-agents/protocol/chatCompletions
 */
import { parseSseJson, readSse, type SseFrame } from "./sse.ts";
import {
  AgentTurnError,
  type AgentAttachment,
  type AgentEvent,
  type AgentTool,
  type ChatContentPart,
  type ChatMessage,
  type ChatToolCall,
  type FailureClass,
} from "./types.ts";

/** Text attachments are inlined; providers accept images as data URLs. */
const TEXT_MIME = /^(text\/|application\/(json|xml|x-yaml|yaml)|message\/rfc822)/;
const MAX_INLINE_TEXT_CHARS = 200_000;

function decodeBase64Text(data: string): string {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(bytes);
}

/**
 * A user message with its attachments: images as `image_url` parts, text
 * files inline. Anything else is refused with a message the user can act on.
 */
export function userMessage(
  text: string,
  attachments: ReadonlyArray<AgentAttachment>,
  options: { readonly agentName: string; readonly acceptsImages: boolean },
): ChatMessage {
  if (attachments.length === 0) return { role: "user", content: text };
  let body = text;
  const images: ChatContentPart[] = [];
  for (const attachment of attachments) {
    if (attachment.mimeType.startsWith("image/")) {
      if (!options.acceptsImages)
        throw new AgentTurnError(
          `${options.agentName} can't read images. Choose a model that accepts images.`,
          "provider_error",
        );
      images.push({
        type: "image_url",
        image_url: { url: `data:${attachment.mimeType};base64,${attachment.data}` },
      });
    } else if (TEXT_MIME.test(attachment.mimeType)) {
      body += `\n\n--- ${attachment.name} ---\n${decodeBase64Text(attachment.data)}`;
    } else {
      throw new AgentTurnError(
        `${options.agentName} can't read ${attachment.name}. Attach images or text files.`,
        "provider_error",
      );
    }
  }
  if (body.length > MAX_INLINE_TEXT_CHARS)
    throw new AgentTurnError("The attached text is too long for one message.", "provider_error");
  return {
    role: "user",
    content: [{ type: "text", text: body || "See the attached image." }, ...images],
  };
}

/** OpenAI function tools from agent tools. */
export function chatTools(tools: ReadonlyArray<AgentTool>) {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
}

/** Failure class and a readable message for an HTTP error status. */
export function httpFailure(
  status: number,
  agentName: string,
  detail?: string,
): { readonly message: string; readonly failureClass: FailureClass } {
  const suffix = detail ? ` (${detail})` : "";
  if (status === 401)
    return { message: `${agentName} rejected the API key${suffix}.`, failureClass: "auth" };
  if (status === 402)
    return { message: `${agentName} credits are exhausted${suffix}.`, failureClass: "usage_limit" };
  if (status === 429)
    return { message: `${agentName} is rate limited${suffix}.`, failureClass: "usage_limit" };
  if (status === 403)
    return { message: `${agentName} denied access${suffix}.`, failureClass: "auth" };
  return {
    message: `${agentName} answered HTTP ${status}${suffix}.`,
    failureClass: status >= 500 ? "transport_error" : "provider_error",
  };
}

/** The `error.message` of an OpenAI-style error body, if any. */
export async function readErrorDetail(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { error?: { message?: unknown } | string };
    const message = typeof body.error === "string" ? body.error : body.error?.message;
    return typeof message === "string" && message.trim() ? message.trim().slice(0, 500) : undefined;
  } catch {
    return undefined;
  }
}

export interface ChatStepResult {
  readonly text: string;
  readonly toolCalls: ReadonlyArray<ChatToolCall>;
  readonly finishReason: string | null;
}

/**
 * Folds streamed `chat.completion.chunk` frames into one assistant step.
 * Text and reasoning deltas go out as events as they arrive; tool calls are
 * assembled by index and returned when the step ends.
 */
export function makeChatStepAccumulator() {
  let text = "";
  let finishReason: string | null = null;
  const calls = new Map<number, { id: string; name: string; arguments: string }>();
  let failure: string | undefined;

  const push = (frame: SseFrame): AgentEvent[] => {
    const chunk = parseSseJson(frame.data);
    if (!chunk) return [];
    const events: AgentEvent[] = [];
    const error = chunk.error as { message?: unknown } | string | undefined;
    if (error !== undefined) {
      failure =
        typeof error === "string"
          ? error
          : typeof error.message === "string"
            ? error.message
            : "The agent reported an error.";
      return events;
    }
    const usage = chunk.usage as { prompt_tokens?: unknown; completion_tokens?: unknown } | null;
    if (usage && typeof usage === "object") {
      events.push({
        type: "usage",
        inputTokens: Number(usage.prompt_tokens) || 0,
        outputTokens: Number(usage.completion_tokens) || 0,
      });
    }
    const choices = Array.isArray(chunk.choices) ? chunk.choices : [];
    for (const choice of choices as Array<Record<string, unknown>>) {
      const delta = (choice.delta ?? {}) as Record<string, unknown>;
      // OpenRouter streams reasoning as `reasoning`; some upstreams use `reasoning_content`.
      const reasoning = delta.reasoning ?? delta.reasoning_content;
      if (typeof reasoning === "string" && reasoning) {
        events.push({ type: "reasoning.delta", text: reasoning });
      }
      if (typeof delta.content === "string" && delta.content) {
        text += delta.content;
        events.push({ type: "text.delta", text: delta.content });
      }
      if (Array.isArray(delta.tool_calls)) {
        for (const raw of delta.tool_calls as Array<Record<string, unknown>>) {
          const index = typeof raw.index === "number" ? raw.index : calls.size;
          const current = calls.get(index) ?? { id: "", name: "", arguments: "" };
          const fn = (raw.function ?? {}) as { name?: unknown; arguments?: unknown };
          if (typeof raw.id === "string" && raw.id) current.id = raw.id;
          if (typeof fn.name === "string" && fn.name) current.name += fn.name;
          if (typeof fn.arguments === "string") current.arguments += fn.arguments;
          calls.set(index, current);
        }
      }
      if (typeof choice.finish_reason === "string") finishReason = choice.finish_reason;
    }
    return events;
  };

  const result = (): ChatStepResult => {
    if (failure !== undefined) throw new AgentTurnError(failure, "provider_error");
    const toolCalls = [...calls.entries()]
      .sort(([a], [b]) => a - b)
      .filter(([, call]) => call.name)
      .map(([index, call]) => ({
        id: call.id || `call_${index}`,
        type: "function" as const,
        function: { name: call.name, arguments: call.arguments || "{}" },
      }));
    return { text, toolCalls, finishReason };
  };

  return { push, result };
}

export interface ChatRequest {
  readonly fetch: (input: string, init?: RequestInit) => Promise<Response>;
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: Record<string, unknown>;
  readonly agentName: string;
  readonly signal: AbortSignal;
}

/** One streamed completion request: deltas go to `emit`, the assembled step comes back. */
export async function streamChatStep(
  request: ChatRequest,
  emit: (events: ReadonlyArray<AgentEvent>) => void,
): Promise<ChatStepResult> {
  const response = await request.fetch(request.url, {
    method: "POST",
    headers: {
      ...request.headers,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ ...request.body, stream: true }),
    signal: request.signal,
  });
  if (!response.ok || !response.body) {
    const failure = httpFailure(
      response.status,
      request.agentName,
      await readErrorDetail(response),
    );
    throw new AgentTurnError(failure.message, failure.failureClass);
  }
  const step = makeChatStepAccumulator();
  await readSse(response.body, (frames) => {
    const events = frames.flatMap(step.push);
    if (events.length > 0) emit(events);
  });
  return step.result();
}

/** One non-streaming completion without tools; the reply text. */
export async function completeChat(request: ChatRequest): Promise<string> {
  const response = await request.fetch(request.url, {
    method: "POST",
    headers: { ...request.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ ...request.body, stream: false }),
    signal: request.signal,
  });
  if (!response.ok) {
    const failure = httpFailure(
      response.status,
      request.agentName,
      await readErrorDetail(response),
    );
    throw new AgentTurnError(failure.message, failure.failureClass);
  }
  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const content = body.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : "";
}
