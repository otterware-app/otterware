/**
 * The portable half of the API agent drivers: wire protocols, SSE parsing,
 * event mapping and the tool loop, with no Node or Electron imports. The
 * environment's drivers (`./server`) and the browser's light agent loop
 * (ADR 0009) both run on this.
 *
 * @module provider-api-agents/protocol
 */
export * from "./protocol/types.ts";
export { makeSseDecoder, readSse, parseSseJson, type SseFrame } from "./protocol/sse.ts";
export {
  chatTools,
  completeChat,
  httpFailure,
  makeChatStepAccumulator,
  streamChatStep,
  userMessage,
  type ChatRequest,
  type ChatStepResult,
} from "./protocol/chatCompletions.ts";
export {
  makeApprovalGate,
  runToolLoop,
  settleOpenToolCalls,
  TOOL_OUTPUT_LIMIT,
  type ApprovalGate,
  type ToolLoopOptions,
} from "./protocol/toolLoop.ts";
export { makeMcpToolHost, type McpServerConnection } from "./protocol/mcpClient.ts";
export {
  fetchOpenRouterCatalog,
  OPENROUTER_API,
  OPENROUTER_AUTO_MODEL,
  OPENROUTER_PROVIDER_PREFERENCES,
  openRouterHeaders,
  openRouterLoopTarget,
  parseOpenRouterCatalog,
  type OpenRouterModel,
} from "./protocol/openRouter.ts";
export {
  fetchOpenClawModels,
  normalizeOpenClawBaseUrl,
  OPENCLAW_DEFAULT_MODEL,
  openClawHeaders,
  openClawLoopTarget,
  openClawSessionKey,
  parseOpenClawModels,
} from "./protocol/openClaw.ts";
export {
  answerHermesApproval,
  createHermesSession,
  fetchHermesModels,
  HERMES_DEFAULT_MODEL,
  hermesModelFields,
  makeHermesTurnMapper,
  normalizeHermesRoot,
  parseHermesModelOptions,
  runHermesTurn,
  steerHermesRun,
  stopHermesRun,
  type HermesTurnInput,
} from "./protocol/hermes.ts";
