// @effect-diagnostics globalTimers:off - Portable protocol code; it runs without an Effect runtime (ADR 0009).
/**
 * Hermes Agent over its API server's native Sessions API (default port 8642,
 * `Authorization: Bearer API_SERVER_KEY`). Each thread is one persistent
 * Hermes session, so history survives restarts on both sides. Hermes runs its
 * own tools and asks before dangerous commands; T3 relays those approvals and
 * can steer or stop a run. Portable: no Node APIs.
 * Event names follow `gateway/platforms/api_server.py`.
 *
 * @module provider-api-agents/protocol/hermes
 */
import { httpFailure, readErrorDetail } from "./chatCompletions.ts";
import { parseSseJson, readSse, type SseFrame } from "./sse.ts";
import {
  AgentTurnError,
  type AgentEvent,
  type AgentModel,
  type ApprovalChoice,
  type ChatContentPart,
  type Fetch,
  type TurnOutcome,
} from "./types.ts";

/** Lets Hermes use the model its gateway is configured with. Never sent to Hermes. */
export const HERMES_DEFAULT_MODEL = "default";
const APPROVAL_CHOICES: ReadonlyArray<ApprovalChoice> = ["once", "session", "always", "deny"];

/** `https://host:8642/v1` or `https://host:8642` → the API root the Sessions API hangs off. */
export function normalizeHermesRoot(raw: string): string {
  return raw.trim().replace(/\/+$/, "").replace(/\/v1$/i, "");
}

export function hermesHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}` };
}

async function hermesError(response: Response): Promise<AgentTurnError> {
  const failure = httpFailure(response.status, "Hermes", await readErrorDetail(response));
  return new AgentTurnError(failure.message, failure.failureClass);
}

interface RawModelOptions {
  readonly model?: unknown;
  readonly provider?: unknown;
  readonly providers?: ReadonlyArray<{
    readonly slug?: unknown;
    readonly name?: unknown;
    readonly authenticated?: unknown;
    readonly models?: ReadonlyArray<unknown>;
  }>;
}

/**
 * `GET /api/model/options`: the providers and models the gateway is set up
 * for, as `provider::model` slugs. The gateway's own default leads as the
 * `default` entry, which keeps Hermes on whatever it is configured to use.
 */
export function parseHermesModelOptions(body: unknown): ReadonlyArray<AgentModel> {
  const options = (body ?? {}) as RawModelOptions;
  const models: AgentModel[] = [
    { slug: HERMES_DEFAULT_MODEL, name: "Hermes default", isDefault: true },
  ];
  for (const provider of options.providers ?? []) {
    if (typeof provider.slug !== "string" || !provider.slug || provider.authenticated === false)
      continue;
    const providerName =
      typeof provider.name === "string" && provider.name ? provider.name : provider.slug;
    for (const raw of provider.models ?? []) {
      const entry = raw as { id?: unknown; slug?: unknown; name?: unknown } | string;
      const id =
        typeof entry === "string"
          ? entry
          : typeof entry?.id === "string"
            ? entry.id
            : typeof entry?.slug === "string"
              ? entry.slug
              : "";
      if (!id) continue;
      const name =
        typeof entry === "object" && typeof entry.name === "string" && entry.name
          ? entry.name
          : id === "default"
            ? providerName
            : id;
      models.push({ slug: `${provider.slug}::${id}`, name, subProvider: providerName });
    }
  }
  return models;
}

/** `model` and `provider` for a turn; the default sentinel sends neither. */
export function hermesModelFields(slug: string): Record<string, string> {
  const separator = slug.indexOf("::");
  if (slug === HERMES_DEFAULT_MODEL || separator === -1) return {};
  return { provider: slug.slice(0, separator), model: slug.slice(separator + 2) };
}

/** Checks the key with `GET /v1/models`, then reads the catalog (older gateways have none). */
export async function fetchHermesModels(
  fetch: Fetch,
  root: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<ReadonlyArray<AgentModel>> {
  const check = await fetch(`${root}/v1/models`, { headers: hermesHeaders(apiKey), signal });
  if (!check.ok) throw await hermesError(check);
  const options = await fetch(`${root}/api/model/options`, {
    headers: hermesHeaders(apiKey),
    signal,
  });
  return options.ok ? parseHermesModelOptions(await options.json()) : parseHermesModelOptions({});
}

/** `POST /api/sessions`: an empty session for a new thread. Titles are unique on Hermes. */
export async function createHermesSession(
  fetch: Fetch,
  root: string,
  apiKey: string,
  title: string | undefined,
  signal: AbortSignal,
): Promise<string> {
  const attempt = (withTitle: string | undefined) =>
    fetch(`${root}/api/sessions`, {
      method: "POST",
      headers: { ...hermesHeaders(apiKey), "Content-Type": "application/json" },
      body: JSON.stringify({ source: "api_server", ...(withTitle ? { title: withTitle } : {}) }),
      signal,
    });
  let response = await attempt(title?.slice(0, 100));
  // A title clash must not block the thread.
  if (response.status === 400 && title) response = await attempt(undefined);
  if (!response.ok) throw await hermesError(response);
  const body = (await response.json()) as { session?: { id?: unknown }; id?: unknown };
  const id = body.session?.id ?? body.id;
  if (typeof id !== "string" || !id)
    throw new AgentTurnError("Hermes returned no session id.", "provider_error");
  return id;
}

/**
 * Maps one Hermes session stream to agent events. Hermes names tools but not
 * tool calls, so calls get sequential ids and complete in start order per tool.
 */
export function makeHermesTurnMapper() {
  let terminal: TurnOutcome | undefined;
  let runId: string | undefined;
  let streamedText = false;
  let toolSequence = 0;
  const openTools = new Map<string, string[]>();

  const push = (frame: SseFrame): AgentEvent[] => {
    const payload = parseSseJson(frame.data);
    if (!payload) return [];
    const event = frame.event ?? String(payload.event ?? payload.type ?? "");
    const events: AgentEvent[] = [];
    // Every event names its run; the first one tells callers where to steer, stop and approve.
    if (runId === undefined && typeof payload.run_id === "string" && payload.run_id) {
      runId = payload.run_id;
      events.push({ type: "run.started", runId });
    }
    switch (event) {
      case "assistant.delta": {
        const text = String(payload.delta ?? payload.text ?? "");
        if (text) {
          streamedText = true;
          events.push({ type: "text.delta", text });
        }
        break;
      }
      case "assistant.commentary": {
        // Commentary beside tool calls; skip what already streamed as deltas.
        const text = String(payload.text ?? "").trim();
        if (payload.already_streamed || !text) break;
        events.push({ type: "text.delta", text: `${streamedText ? "\n\n" : ""}${text}\n\n` });
        streamedText = true;
        break;
      }
      case "assistant.completed": {
        // A provider that does not stream sends the whole answer here.
        const text = String(payload.content ?? "");
        if (!streamedText && text) {
          streamedText = true;
          events.push({ type: "text.delta", text });
        }
        break;
      }
      case "tool.progress": {
        const delta = String(payload.delta ?? "");
        if (payload.tool_name === "_thinking" && delta)
          events.push({ type: "reasoning.delta", text: delta });
        break;
      }
      case "tool.started": {
        const name = String(payload.tool_name ?? payload.tool ?? "tool");
        const id = `hermes-tool-${++toolSequence}`;
        openTools.set(name, [...(openTools.get(name) ?? []), id]);
        events.push({
          type: "tool.started",
          id,
          name,
          input:
            payload.args ?? (payload.preview === undefined ? {} : { preview: payload.preview }),
        });
        break;
      }
      case "tool.completed":
      case "tool.failed": {
        const name = String(payload.tool_name ?? payload.tool ?? "tool");
        const queue = openTools.get(name) ?? [];
        const id = queue.shift();
        if (!id) break;
        openTools.set(name, queue);
        events.push({
          type: "tool.completed",
          id,
          output:
            String(payload.preview ?? "") || (event === "tool.failed" ? "(failed)" : "(done)"),
          isError: event === "tool.failed",
        });
        break;
      }
      case "approval.request": {
        // Hermes waits for a dangerous command; answered through POST /v1/runs/{run_id}/approval.
        const id = payload.request_id;
        if (typeof id !== "string" || !id) break;
        const offered = Array.isArray(payload.choices)
          ? APPROVAL_CHOICES.filter((choice) => (payload.choices as unknown[]).includes(choice))
          : APPROVAL_CHOICES;
        events.push({
          type: "approval.requested",
          id,
          kind: "command",
          title: typeof payload.command === "string" ? payload.command : "Command approval",
          ...(typeof payload.description === "string" ? { detail: payload.description } : {}),
          choices: offered.length > 0 ? offered : ["once", "deny"],
        });
        break;
      }
      case "approval.responded":
      case "approval.resolved":
        if (typeof payload.request_id === "string")
          events.push({ type: "approval.resolved", id: payload.request_id });
        break;
      case "run.completed": {
        terminal = { status: "completed" };
        const usage = payload.usage as { input_tokens?: unknown; output_tokens?: unknown } | null;
        if (usage && typeof usage === "object")
          events.push({
            type: "usage",
            inputTokens: Number(usage.input_tokens) || 0,
            outputTokens: Number(usage.output_tokens) || 0,
          });
        break;
      }
      case "run.failed": {
        const reason = payload.turn_exit_reason ?? payload.error;
        terminal = {
          status: "failed",
          message:
            typeof reason === "string" && reason ? `Hermes failed: ${reason}` : "Hermes failed.",
          failureClass: "provider_error",
        };
        break;
      }
      case "run.cancelled":
        terminal = { status: "cancelled" };
        break;
      case "error": {
        const message = typeof payload.message === "string" ? payload.message : "";
        terminal = {
          status: "failed",
          message: message ? `Hermes failed: ${message}` : "Hermes failed.",
          failureClass: "provider_error",
        };
        break;
      }
      default:
        // message.started, done, run.steered: nothing to show.
        break;
    }
    return events;
  };

  /** The outcome once the stream ended; a stream that closed early lost its gateway. */
  const outcome = (): TurnOutcome =>
    terminal ?? {
      status: "failed",
      message: "Hermes closed the stream before the run finished.",
      failureClass: "transport_error",
    };

  return { push, outcome };
}

export interface HermesTurnInput {
  readonly fetch: Fetch;
  readonly root: string;
  readonly apiKey: string;
  readonly sessionId: string;
  readonly message: string | ReadonlyArray<ChatContentPart>;
  readonly model: string;
  /** Run-only instructions, kept out of the session's history. */
  readonly instructions?: string | undefined;
  readonly emit: (event: AgentEvent) => void;
  readonly signal: AbortSignal;
}

/** One turn on `POST /api/sessions/{id}/chat/stream`. Never throws. */
export async function runHermesTurn(input: HermesTurnInput): Promise<TurnOutcome> {
  try {
    const response = await input.fetch(
      `${input.root}/api/sessions/${encodeURIComponent(input.sessionId)}/chat/stream`,
      {
        method: "POST",
        headers: {
          ...hermesHeaders(input.apiKey),
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          message: input.message,
          ...hermesModelFields(input.model),
          ...(input.instructions ? { system_message: input.instructions } : {}),
        }),
        signal: input.signal,
      },
    );
    if (response.status === 404)
      throw new AgentTurnError(
        "This Hermes session no longer exists. Start a new thread.",
        "provider_error",
      );
    if (!response.ok || !response.body) throw await hermesError(response);
    const mapper = makeHermesTurnMapper();
    await readSse(response.body, (frames) => frames.flatMap(mapper.push).forEach(input.emit));
    return mapper.outcome();
  } catch (error) {
    if (input.signal.aborted) return { status: "cancelled" };
    if (error instanceof AgentTurnError)
      return { status: "failed", message: error.message, failureClass: error.failureClass };
    return {
      status: "failed",
      message: `Can't reach Hermes: ${error instanceof Error ? error.message : String(error)}`,
      failureClass: "transport_error",
    };
  }
}

const runUrl = (root: string, runId: string, action: string) =>
  `${root}/v1/runs/${encodeURIComponent(runId)}/${action}`;

/** Answers a pending approval. 409 means Hermes already settled it. */
export async function answerHermesApproval(
  fetch: Fetch,
  root: string,
  apiKey: string,
  runId: string,
  approvalId: string,
  choice: ApprovalChoice,
): Promise<void> {
  const response = await fetch(runUrl(root, runId, "approval"), {
    method: "POST",
    headers: { ...hermesHeaders(apiKey), "Content-Type": "application/json" },
    body: JSON.stringify({ choice, request_id: approvalId }),
  });
  if (!response.ok && response.status !== 409) throw await hermesError(response);
}

/** Hard-stops a run; closing the stream alone also interrupts it. */
export async function stopHermesRun(
  fetch: Fetch,
  root: string,
  apiKey: string,
  runId: string,
): Promise<void> {
  await fetch(runUrl(root, runId, "stop"), { method: "POST", headers: hermesHeaders(apiKey) });
}

/**
 * Adds guidance to a running agent; it lands after the current tool batch.
 * Right after a run starts Hermes may answer 409 until it accepts steers.
 */
export async function steerHermesRun(
  fetch: Fetch,
  root: string,
  apiKey: string,
  runId: string,
  text: string,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(runUrl(root, runId, "steer"), {
      method: "POST",
      headers: { ...hermesHeaders(apiKey), "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    }).catch(() => null);
    if (response?.ok) return true;
    if (response?.status !== 409) return false;
    await sleep(300);
  }
  return false;
}
