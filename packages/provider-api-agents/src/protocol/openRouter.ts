/**
 * OpenRouter: the account's model catalog and the request fields every turn
 * sends. Turns run through the shared tool loop. Portable: no Node APIs.
 * https://openrouter.ai/docs/api/reference/overview
 *
 * @module provider-api-agents/protocol/openRouter
 */
import { httpFailure, readErrorDetail } from "./chatCompletions.ts";
import { AgentTurnError, type AgentModel, type Fetch } from "./types.ts";

export const OPENROUTER_API = "https://openrouter.ai/api/v1";
export const OPENROUTER_CHAT_URL = `${OPENROUTER_API}/chat/completions`;
export const OPENROUTER_AUTO_MODEL = "openrouter/auto";

/** Attribution headers OpenRouter shows in its activity log. */
export function openRouterHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "HTTP-Referer": "https://otterware.app",
    "X-Title": "Otterware",
  };
}

/**
 * Routing preferences on every request: only endpoints that support every
 * parameter sent (tools), and never providers that keep or train on prompts.
 */
export const OPENROUTER_PROVIDER_PREFERENCES = {
  provider: { require_parameters: true, data_collection: "deny" },
} as const;

export interface OpenRouterModel extends AgentModel {
  readonly acceptsImages: boolean;
}

interface RawModel {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly supported_parameters?: unknown;
  readonly architecture?: {
    readonly input_modalities?: unknown;
    readonly output_modalities?: unknown;
  };
}

const stringArray = (value: unknown): ReadonlyArray<string> =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

/**
 * `GET /models/user` lists the models this key may use under the account's
 * privacy settings. The loop needs tools and text output, so only those
 * count. `openrouter/auto` leads as the default when present.
 */
export function parseOpenRouterCatalog(body: unknown): ReadonlyArray<OpenRouterModel> {
  const data = (body as { data?: unknown })?.data;
  const models = (Array.isArray(data) ? (data as RawModel[]) : [])
    .filter(
      (model) =>
        typeof model.id === "string" &&
        model.id.trim() !== "" &&
        stringArray(model.supported_parameters).includes("tools") &&
        (model.architecture?.output_modalities === undefined ||
          stringArray(model.architecture.output_modalities).includes("text")),
    )
    .map((model): OpenRouterModel => {
      const slug = (model.id as string).trim();
      return {
        slug,
        name: typeof model.name === "string" && model.name.trim() ? model.name.trim() : slug,
        subProvider: slug.split("/")[0] ?? slug,
        acceptsImages: stringArray(model.architecture?.input_modalities).includes("image"),
      };
    })
    .sort(
      (a, b) =>
        Number(b.slug === OPENROUTER_AUTO_MODEL) - Number(a.slug === OPENROUTER_AUTO_MODEL) ||
        a.name.localeCompare(b.name),
    );
  return models.map((model, index) => (index === 0 ? { ...model, isDefault: true } : model));
}

/** Reads the catalog; a rejected key fails with an `auth` error. */
export async function fetchOpenRouterCatalog(
  fetch: Fetch,
  apiKey: string,
  signal: AbortSignal,
): Promise<ReadonlyArray<OpenRouterModel>> {
  const response = await fetch(`${OPENROUTER_API}/models/user`, {
    headers: openRouterHeaders(apiKey),
    signal,
  });
  if (!response.ok) {
    const failure = httpFailure(response.status, "OpenRouter", await readErrorDetail(response));
    throw new AgentTurnError(failure.message, failure.failureClass);
  }
  return parseOpenRouterCatalog(await response.json());
}

/** Where and how the tool loop sends an OpenRouter turn. OpenRouter keeps no history. */
export function openRouterLoopTarget(apiKey: string, model: string) {
  return {
    agentName: "OpenRouter",
    url: OPENROUTER_CHAT_URL,
    headers: openRouterHeaders(apiKey),
    body: {
      model,
      ...OPENROUTER_PROVIDER_PREFERENCES,
      stream_options: { include_usage: true },
    },
    history: "full" as const,
  };
}
