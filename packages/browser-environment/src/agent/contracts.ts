/**
 * The light agent loop's wire surface (ADR 0009): chat, tools, approvals and
 * history for the API agents, with no worktrees, checkpoints or terminal.
 * Hermes and OpenClaw are driven from the browser against the user's own
 * server; OpenRouter turns run in Otter Cloud with the user's sealed key.
 * Module tools are answered by this browser's engines either way.
 */
import * as Schema from "effect/Schema";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";

export const BrowserAgentKind = Schema.Literals(["openrouter", "hermes", "openclaw"]);
export type BrowserAgentKind = typeof BrowserAgentKind.Type;

/**
 * What a thread's agent may do with module tools, as an MCP client's access:
 * only read; ask before changes and never run tools with outside effects
 * (sending, sharing, deleting); or run everything without asking.
 */
export const BrowserAgentAccess = Schema.Literals([
  "read-only",
  "approval-required",
  "full-access",
]);
export type BrowserAgentAccess = typeof BrowserAgentAccess.Type;

export const ApprovalChoice = Schema.Literals(["once", "session", "always", "deny"]);

export class BrowserAgentError extends Schema.TaggedError<BrowserAgentError>()(
  "BrowserAgentError",
  {
    reason: Schema.Literals(["not-configured", "not-found", "busy", "unavailable"]),
    message: Schema.String,
  },
) {}

export const BrowserAgentSettings = Schema.Struct({
  hermes: Schema.Struct({ baseUrl: Schema.String, hasApiKey: Schema.Boolean }),
  openclaw: Schema.Struct({ baseUrl: Schema.String, hasToken: Schema.Boolean }),
});
export type BrowserAgentSettings = typeof BrowserAgentSettings.Type;

/** Saves an agent's server. A missing credential keeps the saved one; an empty one clears it. */
export const BrowserAgentConfigureInput = Schema.Union([
  Schema.Struct({
    agent: Schema.Literal("hermes"),
    baseUrl: Schema.String,
    apiKey: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    agent: Schema.Literal("openclaw"),
    baseUrl: Schema.String,
    token: Schema.optional(Schema.String),
  }),
]);

export const BrowserAgentModel = Schema.Struct({
  slug: Schema.String,
  name: Schema.String,
  isDefault: Schema.optional(Schema.Boolean),
});

export const BrowserAgentThread = Schema.Struct({
  id: Schema.String,
  agent: BrowserAgentKind,
  model: Schema.String,
  access: BrowserAgentAccess,
  title: Schema.String,
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
  /** A turn is running; `send` refuses until it ends. */
  running: Schema.Boolean,
});
export type BrowserAgentThread = typeof BrowserAgentThread.Type;

/** One entry of a thread's history, as the chat shows it. */
export const BrowserAgentMessage = Schema.Union([
  Schema.TaggedStruct("user", { text: Schema.String, at: Schema.Number }),
  Schema.TaggedStruct("assistant", { text: Schema.String, at: Schema.Number }),
  Schema.TaggedStruct("tool", {
    toolId: Schema.String,
    name: Schema.String,
    input: Schema.Unknown,
    output: Schema.NullOr(Schema.String),
    isError: Schema.Boolean,
  }),
  /** How a turn that did not complete ended. */
  Schema.TaggedStruct("notice", { text: Schema.String, at: Schema.Number }),
]);
export type BrowserAgentMessage = typeof BrowserAgentMessage.Type;

const ApprovalRequestFields = {
  id: Schema.String,
  title: Schema.String,
  detail: Schema.NullOr(Schema.String),
  choices: Schema.Array(ApprovalChoice),
};
export const BrowserAgentApproval = Schema.Struct(ApprovalRequestFields);
export type BrowserAgentApproval = typeof BrowserAgentApproval.Type;

/**
 * A thread's live progress. A subscription starts with `thread.state` (is a
 * turn running, which approvals wait), so a page that opens mid-turn shows
 * it; history has the settled form of everything else.
 */
export const BrowserAgentEvent = Schema.Union([
  Schema.TaggedStruct("thread.state", {
    running: Schema.Boolean,
    approvals: Schema.Array(BrowserAgentApproval),
  }),
  Schema.TaggedStruct("turn.started", {}),
  Schema.TaggedStruct("text.delta", { text: Schema.String }),
  Schema.TaggedStruct("tool.started", {
    id: Schema.String,
    name: Schema.String,
    input: Schema.Unknown,
  }),
  Schema.TaggedStruct("tool.completed", {
    id: Schema.String,
    output: Schema.String,
    isError: Schema.Boolean,
  }),
  Schema.TaggedStruct("approval.requested", ApprovalRequestFields),
  Schema.TaggedStruct("approval.resolved", { id: Schema.String }),
  Schema.TaggedStruct("turn.completed", {
    status: Schema.Literals(["completed", "cancelled", "failed"]),
    message: Schema.NullOr(Schema.String),
  }),
]);
export type BrowserAgentEvent = typeof BrowserAgentEvent.Type;

export const BROWSER_AGENT_METHODS = {
  settings: "browser.agent.settings",
  configure: "browser.agent.configure",
  connectOpenRouter: "browser.agent.openRouter.connect",
  disconnectOpenRouter: "browser.agent.openRouter.disconnect",
  models: "browser.agent.models",
  threads: "browser.agent.threads",
  messages: "browser.agent.messages",
  createThread: "browser.agent.createThread",
  deleteThread: "browser.agent.deleteThread",
  send: "browser.agent.send",
  events: "browser.agent.events",
  answer: "browser.agent.answer",
  stop: "browser.agent.stop",
} as const;

const ThreadId = Schema.Struct({ threadId: Schema.String });

export const BrowserAgentRpcGroup = RpcGroup.make(
  Rpc.make(BROWSER_AGENT_METHODS.settings, {
    payload: Schema.Struct({}),
    success: BrowserAgentSettings,
  }),
  Rpc.make(BROWSER_AGENT_METHODS.configure, {
    payload: BrowserAgentConfigureInput,
    success: BrowserAgentSettings,
    error: BrowserAgentError,
  }),
  /** Seals the user's OpenRouter key in Otter Cloud, which runs OpenRouter turns. */
  Rpc.make(BROWSER_AGENT_METHODS.connectOpenRouter, {
    payload: Schema.Struct({ apiKey: Schema.String }),
    error: BrowserAgentError,
  }),
  Rpc.make(BROWSER_AGENT_METHODS.disconnectOpenRouter, {
    payload: Schema.Struct({}),
    error: BrowserAgentError,
  }),
  Rpc.make(BROWSER_AGENT_METHODS.models, {
    payload: Schema.Struct({ agent: BrowserAgentKind }),
    success: Schema.Struct({ models: Schema.Array(BrowserAgentModel) }),
    error: BrowserAgentError,
  }),
  Rpc.make(BROWSER_AGENT_METHODS.threads, {
    payload: Schema.Struct({}),
    success: Schema.Struct({ threads: Schema.Array(BrowserAgentThread) }),
  }),
  Rpc.make(BROWSER_AGENT_METHODS.messages, {
    payload: ThreadId,
    success: Schema.Struct({ messages: Schema.Array(BrowserAgentMessage) }),
    error: BrowserAgentError,
  }),
  Rpc.make(BROWSER_AGENT_METHODS.createThread, {
    payload: Schema.Struct({
      agent: BrowserAgentKind,
      model: Schema.String,
      access: BrowserAgentAccess,
      title: Schema.optional(Schema.String),
    }),
    success: BrowserAgentThread,
  }),
  Rpc.make(BROWSER_AGENT_METHODS.deleteThread, { payload: ThreadId }),
  /** Starts a turn; follow it with `events`. Refuses while one runs. */
  Rpc.make(BROWSER_AGENT_METHODS.send, {
    payload: Schema.Struct({
      threadId: Schema.String,
      text: Schema.String,
      /** What the user is looking at (a module page's context), for this turn only. */
      context: Schema.optional(Schema.String),
    }),
    error: BrowserAgentError,
  }),
  Rpc.make(BROWSER_AGENT_METHODS.events, {
    payload: ThreadId,
    success: BrowserAgentEvent,
    stream: true,
  }),
  Rpc.make(BROWSER_AGENT_METHODS.answer, {
    payload: Schema.Struct({
      threadId: Schema.String,
      approvalId: Schema.String,
      choice: ApprovalChoice,
    }),
    error: BrowserAgentError,
  }),
  Rpc.make(BROWSER_AGENT_METHODS.stop, { payload: ThreadId }),
);
