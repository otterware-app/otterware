/**
 * The agent loop for chat-completions agents (OpenRouter, OpenClaw): stream a
 * step, run the tool calls it asks for, send the results back, repeat until
 * the model answers. The caller supplies the tools and decides how approvals
 * reach the user. Portable: no Node APIs.
 *
 * @module provider-api-agents/protocol/toolLoop
 */
import { streamChatStep, chatTools } from "./chatCompletions.ts";
import {
  AgentTurnError,
  type AgentEvent,
  type AgentTool,
  type ApprovalChoice,
  type ChatMessage,
  type Fetch,
  type ToolHost,
  type TurnOutcome,
} from "./types.ts";

const DEFAULT_MAX_STEPS = 40;
/** Tool output beyond this goes back to the model truncated. */
export const TOOL_OUTPUT_LIMIT = 30_000;

/** Pending approvals of one session. The UI answers them; the loop waits. */
export function makeApprovalGate() {
  const waiting = new Map<string, (choice: ApprovalChoice) => void>();
  return {
    wait(id: string, signal: AbortSignal): Promise<ApprovalChoice> {
      return new Promise((resolve, reject) => {
        if (signal.aborted) return reject(signal.reason);
        const onAbort = () => {
          waiting.delete(id);
          reject(signal.reason);
        };
        signal.addEventListener("abort", onAbort, { once: true });
        waiting.set(id, (choice) => {
          signal.removeEventListener("abort", onAbort);
          waiting.delete(id);
          resolve(choice);
        });
      });
    },
    /** False when nothing waits under `id` (already answered or the turn ended). */
    answer(id: string, choice: ApprovalChoice): boolean {
      const resolve = waiting.get(id);
      if (!resolve) return false;
      resolve(choice);
      return true;
    },
    has(id: string): boolean {
      return waiting.has(id);
    },
  };
}
export type ApprovalGate = ReturnType<typeof makeApprovalGate>;

export interface ToolLoopOptions {
  readonly agentName: string;
  readonly fetch: Fetch;
  readonly url: string;
  readonly headers: Record<string, string>;
  /** Body fields besides messages and tools: model, provider preferences. */
  readonly body: Record<string, unknown>;
  readonly system?: string | undefined;
  /** The conversation so far, ending with this turn's user message. The loop appends to it. */
  readonly messages: ChatMessage[];
  /**
   * `full` sends the whole conversation every step (OpenRouter is stateless).
   * `delta` sends only what the server has not seen yet, from `unsentFrom`,
   * for servers that keep the session's history themselves (OpenClaw).
   */
  readonly history: "full" | "delta";
  readonly unsentFrom?: number;
  readonly tools: ReadonlyArray<AgentTool>;
  readonly toolHost?: ToolHost | undefined;
  /** Ask before tools that are not read-only. */
  readonly askBeforeChanges: boolean;
  readonly approvals: ApprovalGate;
  /** Tools the user allowed for the rest of the session. The loop adds to it. */
  readonly sessionAllowed: Set<string>;
  readonly emit: (event: AgentEvent) => void;
  readonly signal: AbortSignal;
  readonly maxSteps?: number;
}

/**
 * Makes a conversation sendable again after a turn stopped mid tool batch:
 * every tool call needs a result, so calls left without one get a note.
 */
export function settleOpenToolCalls(messages: ChatMessage[]): void {
  const answered = new Set(
    messages.flatMap((message) => (message.role === "tool" ? [message.tool_call_id] : [])),
  );
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (message.role !== "assistant" || !message.tool_calls?.length) continue;
    const missing = message.tool_calls.filter((call) => !answered.has(call.id));
    if (missing.length === 0) break;
    let insertAt = index + 1;
    while (messages[insertAt]?.role === "tool") insertAt += 1;
    messages.splice(
      insertAt,
      0,
      ...missing.map((call) => ({
        role: "tool" as const,
        tool_call_id: call.id,
        content: "The turn was stopped before this tool call finished.",
      })),
    );
    break;
  }
}

function parseArguments(raw: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(raw || "{}");
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Runs one user turn to its end. Never throws: failures and stops come back as outcomes. */
export async function runToolLoop(options: ToolLoopOptions): Promise<TurnOutcome> {
  const { messages, signal } = options;
  const toolsByName = new Map(options.tools.map((tool) => [tool.name, tool]));
  const toolSpecs = chatTools(options.tools);
  let unsent = options.history === "delta" ? (options.unsentFrom ?? 0) : 0;
  try {
    for (let step = 0; step < (options.maxSteps ?? DEFAULT_MAX_STEPS); step += 1) {
      const outgoing = [
        ...(options.system ? [{ role: "system" as const, content: options.system }] : []),
        ...messages.slice(unsent),
      ];
      const result = await streamChatStep(
        {
          fetch: options.fetch,
          url: options.url,
          headers: options.headers,
          agentName: options.agentName,
          signal,
          body: {
            ...options.body,
            messages: outgoing,
            ...(toolSpecs.length > 0 ? { tools: toolSpecs } : {}),
          },
        },
        (events) => events.forEach(options.emit),
      );
      const assistantIndex = messages.length;
      messages.push({
        role: "assistant",
        content: result.text || null,
        ...(result.toolCalls.length > 0 ? { tool_calls: result.toolCalls } : {}),
      });
      if (result.toolCalls.length === 0) {
        if (options.history === "delta") unsent = messages.length;
        if (result.finishReason === "length")
          throw new AgentTurnError(
            "The response hit the model's length limit. Send a follow-up to continue.",
            "provider_error",
          );
        return { status: "completed" };
      }
      // A delta server learns of the tool calls with their results.
      if (options.history === "delta") unsent = assistantIndex;
      for (const call of result.toolCalls) {
        signal.throwIfAborted();
        const args = parseArguments(call.function.arguments);
        options.emit({
          type: "tool.started",
          id: call.id,
          name: call.function.name,
          input: args ?? call.function.arguments,
        });
        const output = await runToolCall(options, toolsByName.get(call.function.name), call, args);
        const text =
          output.text.length > TOOL_OUTPUT_LIMIT
            ? `${output.text.slice(0, TOOL_OUTPUT_LIMIT)}\n[… truncated]`
            : output.text;
        options.emit({
          type: "tool.completed",
          id: call.id,
          output: text,
          isError: output.isError,
        });
        messages.push({ role: "tool", tool_call_id: call.id, content: text });
      }
    }
    throw new AgentTurnError(
      "The agent reached this turn's step limit. Send a follow-up to continue.",
      "provider_error",
    );
  } catch (error) {
    if (signal.aborted) return { status: "cancelled" };
    if (error instanceof AgentTurnError)
      return { status: "failed", message: error.message, failureClass: error.failureClass };
    return {
      status: "failed",
      message: `Can't reach ${options.agentName}: ${error instanceof Error ? error.message : String(error)}`,
      failureClass: "transport_error",
    };
  }
}

async function runToolCall(
  options: ToolLoopOptions,
  tool: AgentTool | undefined,
  call: { readonly id: string; readonly function: { readonly name: string } },
  args: Record<string, unknown> | undefined,
): Promise<{ text: string; isError: boolean }> {
  if (!tool || !options.toolHost)
    return { text: `Unknown tool: ${call.function.name}`, isError: true };
  if (!args) return { text: "The tool arguments were not a JSON object.", isError: true };
  if (options.askBeforeChanges && !tool.readOnly && !options.sessionAllowed.has(tool.name)) {
    const approvalId = `approval:${call.id}`;
    options.emit({
      type: "approval.requested",
      id: approvalId,
      kind: "tool",
      title: tool.name,
      detail: JSON.stringify(args),
      choices: ["once", "session", "deny"],
    });
    const choice = await options.approvals.wait(approvalId, options.signal);
    options.emit({ type: "approval.resolved", id: approvalId });
    if (choice === "deny") return { text: "The user declined this tool call.", isError: true };
    if (choice === "session" || choice === "always") options.sessionAllowed.add(tool.name);
  }
  try {
    return await options.toolHost.call(tool.name, args, options.signal);
  } catch (error) {
    if (options.signal.aborted) throw error;
    return {
      text: `The tool failed: ${error instanceof Error ? error.message : String(error)}`,
      isError: true,
    };
  }
}
