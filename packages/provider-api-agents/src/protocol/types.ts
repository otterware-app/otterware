/**
 * The neutral vocabulary every API agent turn speaks, whatever its wire
 * protocol. An environment's adapter maps these events onto T3 orchestration;
 * the browser's light agent loop (ADR 0009) renders them directly.
 * Portable: no Node APIs.
 *
 * @module provider-api-agents/protocol/types
 */

/** How the user answers an approval. The agent's own choice ids pass through unchanged. */
export type ApprovalChoice = "once" | "session" | "always" | "deny";

export type AgentEvent =
  /** Assistant text. A new segment starts after each tool call. */
  | { readonly type: "text.delta"; readonly text: string }
  | { readonly type: "reasoning.delta"; readonly text: string }
  | {
      readonly type: "tool.started";
      readonly id: string;
      readonly name: string;
      readonly input: unknown;
    }
  | {
      readonly type: "tool.completed";
      readonly id: string;
      readonly output: string;
      readonly isError: boolean;
    }
  | {
      readonly type: "approval.requested";
      readonly id: string;
      /** `tool` for a tool call the loop gates; `command` for an agent's own shell approval. */
      readonly kind: "tool" | "command";
      readonly title: string;
      readonly detail?: string;
      readonly choices: ReadonlyArray<ApprovalChoice>;
    }
  | { readonly type: "approval.resolved"; readonly id: string }
  /** Hermes names each run; steer, stop and approvals address it. */
  | { readonly type: "run.started"; readonly runId: string }
  | {
      readonly type: "usage";
      readonly inputTokens: number;
      readonly outputTokens: number;
    };

/** Why a turn failed, so callers can tell a bad key or a limit from a provider error. */
export type FailureClass = "auth" | "usage_limit" | "provider_error" | "transport_error";

export type TurnOutcome =
  | { readonly status: "completed" }
  | { readonly status: "cancelled" }
  | { readonly status: "failed"; readonly message: string; readonly failureClass: FailureClass };

export class AgentTurnError extends Error {
  readonly failureClass: FailureClass;
  constructor(message: string, failureClass: FailureClass) {
    super(message);
    this.name = "AgentTurnError";
    this.failureClass = failureClass;
  }
}

/** An attachment already read into memory; `data` is base64. */
export interface AgentAttachment {
  readonly name: string;
  readonly mimeType: string;
  readonly data: string;
}

/** OpenAI chat-completions message, the format OpenRouter and OpenClaw accept. */
export type ChatMessage =
  | { readonly role: "system"; readonly content: string }
  | { readonly role: "user"; readonly content: string | ReadonlyArray<ChatContentPart> }
  | {
      readonly role: "assistant";
      readonly content: string | null;
      readonly tool_calls?: ReadonlyArray<ChatToolCall>;
    }
  | { readonly role: "tool"; readonly tool_call_id: string; readonly content: string };

export type ChatContentPart =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "image_url"; readonly image_url: { readonly url: string } };

export interface ChatToolCall {
  readonly id: string;
  readonly type: "function";
  readonly function: { readonly name: string; readonly arguments: string };
}

/** A tool the agent may call, as an MCP server or a module engine describes it. */
export interface AgentTool {
  readonly name: string;
  readonly description: string;
  /** JSON Schema of the arguments. */
  readonly inputSchema: Record<string, unknown>;
  /** Reads only; runs without asking even when the thread asks before changes. */
  readonly readOnly: boolean;
}

export interface AgentToolResult {
  readonly text: string;
  readonly isError: boolean;
}

/** Where the loop's tools come from: T3's MCP server on an environment, module engines in a browser. */
export interface ToolHost {
  readonly list: () => Promise<ReadonlyArray<AgentTool>>;
  readonly call: (
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ) => Promise<AgentToolResult>;
}

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** A model an API agent offers, before the host adds its own presentation. */
export interface AgentModel {
  readonly slug: string;
  readonly name: string;
  readonly subProvider?: string;
  readonly isDefault?: boolean;
}
