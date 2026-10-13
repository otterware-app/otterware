/**
 * OpenClaw's gateway over its OpenAI-compatible HTTP API
 * (`gateway.http.endpoints.chatCompletions.enabled`). A model id picks an
 * OpenClaw agent, not a provider model; `x-openclaw-session-key` keeps one
 * gateway session per thread, so the gateway holds the history and each
 * request sends only what it has not seen. Client function tools come back as
 * tool calls the loop runs. Portable: no Node APIs.
 * https://docs.openclaw.ai/gateway/openai-http-api
 *
 * @module provider-api-agents/protocol/openClaw
 */
import { httpFailure, readErrorDetail } from "./chatCompletions.ts";
import { AgentTurnError, type AgentModel, type Fetch } from "./types.ts";

export const OPENCLAW_DEFAULT_MODEL = "openclaw/default";

/** `http://host:18789` or `http://host:18789/v1` → the `/v1` base. */
export function normalizeOpenClawBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  return /\/v1$/i.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

/**
 * Session keys the app owns. The gateway rejects keys that start with its
 * reserved prefixes (`subagent:`, `cron:`, `acp:`).
 */
export function openClawSessionKey(id: string): string {
  return `otterware:${id}`;
}

export function openClawHeaders(token: string, sessionKey?: string): Record<string, string> {
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(sessionKey ? { "x-openclaw-session-key": sessionKey } : {}),
  };
}

/** `GET /v1/models` lists agent targets: `openclaw`, `openclaw/default`, `openclaw/<agentId>`. */
export function parseOpenClawModels(body: unknown): ReadonlyArray<AgentModel> {
  const data = (body as { data?: unknown })?.data;
  const ids = (Array.isArray(data) ? data : [])
    .map((entry) => (entry as { id?: unknown })?.id)
    .filter((id): id is string => typeof id === "string" && id.trim() !== "")
    .map((id) => id.trim())
    // `openclaw` and `openclaw/default` are the same agent; keep the stable alias.
    .filter((id, _index, all) => !(id === "openclaw" && all.includes(OPENCLAW_DEFAULT_MODEL)));
  const unique = [...new Set(ids)];
  const defaultSlug = unique.includes(OPENCLAW_DEFAULT_MODEL) ? OPENCLAW_DEFAULT_MODEL : unique[0];
  return unique
    .map((slug) => {
      const agent = slug.replace(/^openclaw[/:]?/i, "").replace(/^agent:/i, "");
      return {
        slug,
        name: !agent || agent === "default" ? "Default agent" : agent,
        ...(slug === defaultSlug ? { isDefault: true } : {}),
      };
    })
    .sort((a, b) => Number(b.isDefault === true) - Number(a.isDefault === true));
}

/** Reads the agent list; checks the URL and token on the way. */
export async function fetchOpenClawModels(
  fetch: Fetch,
  baseUrl: string,
  token: string,
  signal: AbortSignal,
): Promise<ReadonlyArray<AgentModel>> {
  const response = await fetch(`${normalizeOpenClawBaseUrl(baseUrl)}/models`, {
    headers: openClawHeaders(token),
    signal,
  });
  if (response.status === 404)
    throw new AgentTurnError(
      "The gateway has no OpenAI-compatible API. Set gateway.http.endpoints.chatCompletions.enabled to true.",
      "provider_error",
    );
  if (!response.ok) {
    const failure = httpFailure(response.status, "OpenClaw", await readErrorDetail(response));
    throw new AgentTurnError(failure.message, failure.failureClass);
  }
  return parseOpenClawModels(await response.json());
}

/** Where and how the tool loop sends an OpenClaw turn. The gateway keeps the session history. */
export function openClawLoopTarget(input: {
  readonly baseUrl: string;
  readonly token: string;
  readonly sessionKey: string;
  readonly model: string;
}) {
  return {
    agentName: "OpenClaw",
    url: `${normalizeOpenClawBaseUrl(input.baseUrl)}/chat/completions`,
    headers: openClawHeaders(input.token, input.sessionKey),
    body: { model: input.model, stream_options: { include_usage: true } },
    history: "delta" as const,
  };
}
