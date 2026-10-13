/**
 * The three API agent drivers. Each instance builds its engine from its
 * settings, probes the agent's model list for its status, and hands the
 * shared adapter its engine.
 *
 * @module provider-api-agents/server/driver
 */
import {
  TextGenerationError,
  type CustomModelSetting,
  type ProviderDriverKind,
  type ServerProvider,
  type ServerProviderModel,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import {
  defaultProviderContinuationIdentity,
  type ProviderDriver,
  type ProviderInstance,
} from "@t3tools/provider-core/server/driver";
import { ProviderDriverError } from "@t3tools/provider-core/server/errors";
import * as IdAllocator from "@t3tools/provider-core/server/IdAllocator";
import { withInstanceIdentity } from "@t3tools/provider-core/server/instanceIdentity";
import { makeManagedServerProvider } from "@t3tools/provider-core/server/managedProvider";
import { makeManualOnlyProviderMaintenanceCapabilities } from "@t3tools/provider-core/server/maintenanceResolver";
import * as McpProviderSessions from "@t3tools/provider-core/server/McpProviderSessions";
import * as ProviderHost from "@t3tools/provider-core/server/ProviderHost";
import {
  buildServerProvider,
  providerModelsFromSettings,
  type ProviderProbeResult,
} from "@t3tools/provider-core/server/snapshotProbe";
import {
  haveProviderSnapshotSettingsChanged,
  makeProviderSnapshotSettingsSource,
  type ProviderSnapshotSettings,
} from "@t3tools/provider-core/server/snapshotSettings";
import type { ProviderTextGeneration } from "@t3tools/provider-core/server/textGeneration";
import {
  decodeJsonReply,
  fromRunner,
  withoutInvestigation,
} from "@t3tools/provider-core/server/textGenerationOperations";

import { completeChat } from "../protocol/chatCompletions.ts";
import { openRouterLoopTarget } from "../protocol/openRouter.ts";
import { AgentTurnError, type Fetch } from "../protocol/types.ts";
import { HermesSettings, OpenClawSettings, OpenRouterSettings } from "../settings.ts";
import { makeApiAgentAdapter } from "./adapter.ts";
import {
  HERMES_DRIVER,
  makeHermesEngine,
  makeOpenClawEngine,
  makeOpenRouterEngine,
  OPENCLAW_DRIVER,
  OPENROUTER_DRIVER,
  type ApiAgentEngine,
} from "./engines.ts";

export type ApiAgentDriverEnv =
  | IdAllocator.IdAllocatorV2
  | McpProviderSessions.McpProviderSessions
  | ProviderHost.ProviderHost
  | FileSystem.FileSystem
  | Path.Path;

const PROBE_TIMEOUT_MS = 10_000;
const PRESENTATION_MODES = ["approval-required", "full-access"] as const;

interface ApiAgentSettings {
  readonly enabled: boolean;
  readonly customModels: ReadonlyArray<CustomModelSetting>;
}

const unsupportedTextGeneration = (agent: string): ProviderTextGeneration => {
  const unsupported = (operation: string) =>
    Effect.fail(
      new TextGenerationError({
        operation,
        detail: `${agent} runs a whole agent per request, so T3 Code does not use it for text generation.`,
      }),
    );
  return {
    generateCommitMessage: () => unsupported("generateCommitMessage"),
    generatePrContent: () => unsupported("generatePrContent"),
    generateBranchName: () => unsupported("generateBranchName"),
    generateThreadTitle: () => unsupported("generateThreadTitle"),
    generateReviewGuide: () => unsupported("generateReviewGuide"),
  };
};

/** Titles, branch names and commit messages through one plain OpenRouter completion. */
const openRouterTextGeneration = (settings: OpenRouterSettings, fetch: Fetch) =>
  fromRunner(
    "OpenRouterTextGeneration",
    withoutInvestigation("OpenRouter", (request) =>
      Effect.tryPromise({
        try: (signal) => {
          const target = openRouterLoopTarget(settings.apiKey, request.modelSelection.model);
          return completeChat({
            fetch,
            url: target.url,
            headers: target.headers,
            agentName: target.agentName,
            signal,
            body: {
              ...target.body,
              messages: [{ role: "user", content: request.prompt }],
              stream_options: undefined,
            },
          });
        },
        catch: (cause) =>
          new TextGenerationError({
            operation: request.operation,
            detail: cause instanceof Error ? cause.message : "OpenRouter text generation failed.",
            cause,
          }),
      }).pipe(Effect.flatMap((text) => decodeJsonReply(request, "OpenRouter", text))),
    ),
  );

interface ApiAgentSpec<Settings extends ApiAgentSettings> {
  readonly driverKind: ProviderDriverKind;
  readonly displayName: string;
  readonly settingsSchema: Schema.Codec<Settings, unknown>;
  readonly makeEngine: (settings: Settings, fetch: Fetch) => ApiAgentEngine;
  readonly makeTextGeneration: (settings: Settings, fetch: Fetch) => ProviderTextGeneration;
}

function makeApiAgentDriver<Settings extends ApiAgentSettings>(
  spec: ApiAgentSpec<Settings>,
): ProviderDriver<Settings, ApiAgentDriverEnv> {
  const decode = Schema.decodeSync(spec.settingsSchema);
  const maintenance = makeManualOnlyProviderMaintenanceCapabilities({
    provider: spec.driverKind,
    packageName: null,
  });
  return {
    driverKind: spec.driverKind,
    metadata: {
      displayName: spec.displayName,
      supportsMultipleInstances: true,
      // Nothing runs until the user adds an instance with a URL or key.
      hasDefaultInstance: false,
    },
    configSchema: spec.settingsSchema,
    defaultConfig: () => decode({}),
    create: ({ instanceId, displayName, accentColor, enabled, config }) =>
      Effect.gen(function* () {
        const settings = { ...config, enabled };
        // The protocol code takes a WHATWG fetch so the browser's agent loop runs it too (ADR 0009).
        // @effect-diagnostics-next-line globalFetch:off
        const fetch: Fetch = (input, init) => globalThis.fetch(input, init);
        const engine = spec.makeEngine(settings, fetch);
        const continuationIdentity = defaultProviderContinuationIdentity({
          driverKind: spec.driverKind,
          instanceId,
        });
        const stampIdentity = withInstanceIdentity({
          instanceId,
          driverKind: spec.driverKind,
          displayName,
          accentColor,
          continuationGroupKey: continuationIdentity.continuationKey,
        });
        const presentation = {
          displayName: spec.displayName,
          badgeLabel: "Beta",
          showInteractionModeToggle: false,
          supportedRuntimeModes: PRESENTATION_MODES,
        };
        const snapshotOf = (
          probe: ProviderProbeResult,
          models: ReadonlyArray<ServerProviderModel>,
        ) =>
          Effect.map(DateTime.now, (now) =>
            stampIdentity(
              buildServerProvider({
                presentation,
                enabled: settings.enabled,
                checkedAt: DateTime.formatIso(now),
                models: providerModelsFromSettings(models, settings.customModels, null),
                probe,
              }),
            ),
          );
        const checkProvider: Effect.Effect<ServerProvider> = Effect.gen(function* () {
          if (!settings.enabled)
            return yield* snapshotOf(
              { installed: false, version: null, status: "warning", auth: { status: "unknown" } },
              [],
            );
          if (engine.missingConfiguration)
            return yield* snapshotOf(
              {
                installed: false,
                version: null,
                status: "warning",
                auth: { status: "unauthenticated" },
                message: `${engine.missingConfiguration} Open this instance's settings.`,
              },
              [],
            );
          const result = yield* Effect.tryPromise((signal) => engine.listModels(signal)).pipe(
            Effect.timeoutOption(PROBE_TIMEOUT_MS),
            Effect.result,
          );
          if (result._tag === "Failure") {
            const error = result.failure.cause;
            const auth = error instanceof AgentTurnError && error.failureClass === "auth";
            return yield* snapshotOf(
              {
                installed: true,
                version: null,
                status: "error",
                auth: { status: auth ? "unauthenticated" : "unknown" },
                message:
                  error instanceof Error
                    ? error.message
                    : `Can't reach ${spec.displayName} from this environment.`,
              },
              [],
            );
          }
          if (Option.isNone(result.success))
            return yield* snapshotOf(
              {
                installed: true,
                version: null,
                status: "error",
                auth: { status: "unknown" },
                message: `${spec.displayName} did not answer within ${PROBE_TIMEOUT_MS / 1000} seconds.`,
              },
              [],
            );
          const models = result.success.value.map((model): ServerProviderModel => ({
            slug: model.slug,
            name: model.name,
            ...(model.subProvider ? { subProvider: model.subProvider } : {}),
            ...(model.isDefault ? { isDefault: true } : {}),
            isCustom: false,
            capabilities: null,
          }));
          return yield* snapshotOf(
            models.length > 0
              ? {
                  installed: true,
                  version: null,
                  status: "ready",
                  auth: { status: "authenticated" },
                }
              : {
                  installed: true,
                  version: null,
                  status: "warning",
                  auth: { status: "authenticated" },
                  message: `${spec.displayName} offers no models this agent can use.`,
                },
            models,
          );
        });
        const snapshotSettings = yield* makeProviderSnapshotSettingsSource(settings);
        const snapshot = yield* makeManagedServerProvider<ProviderSnapshotSettings<Settings>>({
          resolveMaintenance: () => Effect.succeed(maintenance),
          getSettings: snapshotSettings.getSettings,
          streamSettings: snapshotSettings.streamSettings,
          haveSettingsChanged: haveProviderSnapshotSettingsChanged,
          initialSnapshot: () =>
            snapshotOf(
              {
                installed: false,
                version: null,
                status: "warning",
                auth: { status: "unknown" },
                message: settings.enabled
                  ? `Checking ${spec.displayName}…`
                  : `${spec.displayName} is disabled in settings.`,
              },
              [],
            ),
          checkProvider,
        }).pipe(
          Effect.mapError(
            (cause) =>
              new ProviderDriverError({
                driver: spec.driverKind,
                instanceId,
                detail: `Failed to build the ${spec.displayName} snapshot.`,
                cause,
              }),
          ),
        );
        const orchestrationAdapter = yield* makeApiAgentAdapter({
          instanceId,
          engine,
          fetch,
          modelCatalog: snapshot.getSnapshot.pipe(Effect.map((current) => current.models)),
        });
        return {
          instanceId,
          driverKind: spec.driverKind,
          continuationIdentity,
          displayName,
          accentColor,
          enabled,
          snapshot,
          orchestrationAdapter,
          textGeneration: spec.makeTextGeneration(settings, fetch),
        } satisfies ProviderInstance;
      }),
  };
}

export const OpenRouterDriver = makeApiAgentDriver<OpenRouterSettings>({
  driverKind: OPENROUTER_DRIVER,
  displayName: "OpenRouter",
  settingsSchema: OpenRouterSettings,
  makeEngine: (settings, fetch) => makeOpenRouterEngine(settings, { fetch }),
  makeTextGeneration: openRouterTextGeneration,
});

export const HermesDriver = makeApiAgentDriver<HermesSettings>({
  driverKind: HERMES_DRIVER,
  displayName: "Hermes",
  settingsSchema: HermesSettings,
  makeEngine: (settings, fetch) => makeHermesEngine(settings, { fetch }),
  makeTextGeneration: () => unsupportedTextGeneration("Hermes"),
});

export const OpenClawDriver = makeApiAgentDriver<OpenClawSettings>({
  driverKind: OPENCLAW_DRIVER,
  displayName: "OpenClaw",
  settingsSchema: OpenClawSettings,
  makeEngine: (settings, fetch) => makeOpenClawEngine(settings, { fetch }),
  makeTextGeneration: () => unsupportedTextGeneration("OpenClaw"),
});
