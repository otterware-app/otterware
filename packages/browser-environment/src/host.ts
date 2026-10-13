/**
 * The in-browser environment's host, independent of where it runs: the
 * module runtime over `suite.sqlite`, the browser's Otter Account, and the
 * RPC handlers for its group. The worker (`worker.ts`) provides SQLite on
 * OPFS and the browser's platform services; tests provide memory and fakes.
 */
import type { ServerModule } from "@otterware/module-kit/engine";
import { AssistantProjectError } from "@otterware/module-kit/contracts";
import {
  AssistantProjectHost,
  layerRpcHandlers,
  layerRuntime,
} from "@otterware/module-kit/runtime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as FetchHttpClient from "effect/http/FetchHttpClient";

import * as BrowserAccount from "./account/BrowserAccount.ts";
import { layerAccountCredential } from "./account/credential.ts";
import { layerAccountHandlers } from "./account/handlers.ts";
import { layerHomeAccount, layerMailFollowsAccount, layerMailHost } from "./account/mailHost.ts";
import * as AgentStore from "./agent/AgentStore.ts";
import * as BrowserAgent from "./agent/BrowserAgent.ts";
import { layerAgentHandlers } from "./agent/handlers.ts";
import * as BrowserInstallation from "./BrowserInstallation.ts";
import { BrowserPlatform } from "./BrowserPlatform.ts";
import * as BrowserSecrets from "./BrowserSecrets.ts";
import { BrowserModulesRpcGroup } from "./contracts.ts";

/**
 * Assistant threads belong to an environment's assistant project (ADR 0004);
 * the browser has none. Its agent chat is the light loop (ADR 0009).
 */
export const layerNoAssistantProject = Layer.succeed(AssistantProjectHost, {
  ensure: Effect.fail(
    new AssistantProjectError({
      workspaceRoot: "",
      cause: "Assistant threads need an environment; this browser runs none.",
    }),
  ),
});

/** Engines' `HttpClient` over the platform's fetch, so every request the worker makes goes one way. */
const layerHttpClient = FetchHttpClient.layer.pipe(
  Layer.provide(
    Layer.effect(
      FetchHttpClient.Fetch,
      Effect.gen(function* () {
        const platform = yield* BrowserPlatform;
        return platform.fetch;
      }),
    ),
  ),
);

/**
 * Every handler of `BrowserEnvironmentRpcGroup` over the module runtime, the
 * browser's account and its agent loop. `Requirements` names what the modules need from the
 * browser, as the composition derives it, so a missing platform service fails
 * the typecheck.
 */
export const layerHost =
  <Requirements = never>() =>
  (modules: ReadonlyArray<ServerModule>) =>
    Layer.mergeAll(
      layerRpcHandlers(BrowserModulesRpcGroup).pipe(Layer.provide(layerNoAssistantProject)),
      layerAccountHandlers,
      layerAgentHandlers,
      layerMailFollowsAccount,
    ).pipe(
      Layer.provideMerge(BrowserAgent.layer),
      Layer.provideMerge(AgentStore.layer.pipe(Layer.provide(BrowserSecrets.layer))),
      Layer.provideMerge(layerRuntime<Requirements>(modules)),
      Layer.provideMerge(Layer.mergeAll(layerAccountCredential, layerMailHost, layerHomeAccount)),
      Layer.provideMerge(BrowserAccount.layer),
      Layer.provideMerge(BrowserInstallation.layer),
      Layer.provideMerge(layerHttpClient),
    );
