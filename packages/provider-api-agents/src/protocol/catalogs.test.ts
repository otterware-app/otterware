import { describe, expect, it } from "vite-plus/test";

import { fixtureJson, jsonResponse, scriptedFetch } from "./fixtures/load.ts";
import { fetchOpenClawModels, openClawSessionKey, parseOpenClawModels } from "./openClaw.ts";
import { fetchOpenRouterCatalog, parseOpenRouterCatalog } from "./openRouter.ts";
import { AgentTurnError } from "./types.ts";

describe("model catalogs", () => {
  it("keeps only OpenRouter models that call tools and answer in text, auto first", () => {
    expect(parseOpenRouterCatalog(fixtureJson("openrouter-models-user.json"))).toEqual([
      {
        slug: "openrouter/auto",
        name: "Auto Router",
        subProvider: "openrouter",
        acceptsImages: true,
        isDefault: true,
      },
      {
        slug: "anthropic/claude-sonnet-4.5",
        name: "Anthropic: Claude Sonnet 4.5",
        subProvider: "anthropic",
        acceptsImages: true,
      },
      {
        slug: "openai/gpt-5.1",
        name: "OpenAI: GPT-5.1",
        subProvider: "openai",
        acceptsImages: true,
      },
    ]);
  });

  it("reads the account-specific catalog with the key and rejects a bad key as auth", async () => {
    const ok = scriptedFetch([() => jsonResponse(fixtureJson("openrouter-models-user.json"))]);
    await fetchOpenRouterCatalog(ok.fetch, "sk-or-1", new AbortController().signal);
    expect(ok.requests[0]).toMatchObject({
      url: "https://openrouter.ai/api/v1/models/user",
      headers: { authorization: "Bearer sk-or-1" },
    });

    const rejected = scriptedFetch([() => jsonResponse({ error: { message: "No auth" } }, 401)]);
    const error = await fetchOpenRouterCatalog(
      rejected.fetch,
      "sk-or-bad",
      new AbortController().signal,
    ).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(AgentTurnError);
    expect((error as AgentTurnError).failureClass).toBe("auth");
  });

  it("lists OpenClaw agents once, the default agent first", () => {
    expect(parseOpenClawModels(fixtureJson("openclaw-models.json"))).toEqual([
      { slug: "openclaw/default", name: "Default agent", isDefault: true },
      { slug: "openclaw/research", name: "research" },
    ]);
  });

  it("explains a gateway without the HTTP API enabled", async () => {
    const { fetch } = scriptedFetch([() => new Response("Not Found", { status: 404 })]);
    await expect(
      fetchOpenClawModels(fetch, "http://127.0.0.1:18789", "t", new AbortController().signal),
    ).rejects.toThrow("gateway.http.endpoints.chatCompletions.enabled");
  });

  it("uses session keys outside the gateway's reserved prefixes", () => {
    expect(openClawSessionKey("abc")).toBe("otterware:abc");
  });
});
