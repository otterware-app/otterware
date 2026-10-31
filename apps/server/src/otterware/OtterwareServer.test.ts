import { NodeHttpServer } from "@effect/platform-node";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { ModuleRuntime, SuiteDatabase } from "@otterware/module-kit/server";
import { ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as McpProviderSessions from "@t3tools/provider-core/server/McpProviderSessions";
import { buildRuntimeInstructions } from "@t3tools/provider-core/server/runtimeInstructions";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { HttpBody, HttpClient, HttpRouter } from "effect/http";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as ServerConfig from "../config.ts";
import * as DeviceService from "../device/DeviceService.ts";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as GitWorkflowService from "../git/GitWorkflowService.ts";
import * as McpHttpServer from "../mcp/McpHttpServer.ts";
import * as McpSessionRegistry from "../mcp/McpSessionRegistry.ts";
import * as PreviewAutomationBroker from "../mcp/PreviewAutomationBroker.ts";
import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import * as ProjectStore from "../orchestration-v2/ProjectStore.ts";
import * as ProviderAdapterRegistry from "../orchestration-v2/ProviderAdapterRegistry.ts";
import * as ThreadManagementService from "../orchestration-v2/ThreadManagementService.ts";
import * as PeerForwarding from "../peer/PeerForwarding.ts";
import * as PeerLinkRequests from "../peer/PeerLinkRequests.ts";
import * as PeerLinks from "../peer/PeerLinks.ts";
import * as RemoteDelegation from "../peer/RemoteDelegation.ts";
import * as PreviewBrowser from "../preview/PreviewBrowser.ts";
import * as ProjectCloneTracker from "../project/ProjectCloneTracker.ts";
import * as ProjectService from "../project/ProjectService.ts";
import * as DocumentText from "../provider/DocumentText.ts";
import * as ProjectSetupScriptRunner from "../project/ProjectSetupScriptRunner.ts";
import * as ProviderRegistry from "../provider/ProviderRegistry.ts";
import * as ScheduledTaskService from "../scheduledTasks/ScheduledTaskService.ts";
import * as SecretRequests from "../secrets/SecretRequests.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as VcsStatusBroadcaster from "../vcs/VcsStatusBroadcaster.ts";
import { GitVcsDriver } from "../vcs/GitVcsDriver.ts";
import { ManagedProjectFolders } from "../project/ManagedProjectFolders.ts";
import { PreviewManager } from "../preview/Manager.ts";
import { SourceControlRepositoryService } from "../sourceControl/SourceControlRepositoryService.ts";
import { ThreadLaunchService } from "../orchestration-v2/ThreadLaunchService.ts";
import { ThreadSearch } from "../orchestration-v2/ThreadSearch.ts";
import { PullRequestReviewGuideService } from "../pullRequest/PullRequestReviewGuideService.ts";
import * as LinearIssueSyncReactor from "../linear/LinearIssueSyncReactor.ts";
import * as OtterwareServer from "./OtterwareServer.ts";

// The upstream toolkits merged beside the modules' resolve these lazily; the
// module tools under test need none of them.
const layerStubServices = Layer.mergeAll(
  Layer.mock(McpProviderSessions.McpProviderSessions)({}),
  Layer.mock(GitVcsDriver)({}),
  Layer.mock(ManagedProjectFolders)({ namedProjectsRoot: "/tmp/otterware-test-unused-projects" }),
  Layer.mock(PreviewManager)({}),
  Layer.mock(SourceControlRepositoryService)({}),
  Layer.mock(ThreadLaunchService)({}),
  Layer.mock(ThreadSearch)({}),
  Layer.mock(PullRequestReviewGuideService)({}),
  Layer.mock(LinearIssueSyncReactor.LinearIssueSyncReactor)({}),
  Layer.mock(Orchestrator.OrchestratorV2)({}),
  Layer.mock(ProjectionStore.ProjectionStoreV2)({}),
  Layer.mock(ProjectStore.ProjectStoreV2)({}),
  Layer.mock(DeviceService.DeviceService)({}),
  Layer.mock(ThreadManagementService.ThreadManagementService)({}),
  Layer.mock(ProviderRegistry.ProviderRegistry)({}),
  Layer.mock(ProviderAdapterRegistry.ProviderAdapterRegistryV2)({}),
  Layer.mock(ScheduledTaskService.ScheduledTaskService)({}),
  Layer.mock(SecretRequests.SecretRequests)({}),
  Layer.mock(PeerForwarding.PeerForwarding)({}),
  Layer.mock(PeerLinkRequests.PeerLinkRequests)({}),
  Layer.mock(PeerLinks.PeerLinks)({}),
  Layer.mock(RemoteDelegation.RemoteDelegation)({}),
  Layer.mock(ProjectService.ProjectService)({}),
  Layer.mock(ProjectCloneTracker.ProjectCloneTracker)({}),
  Layer.mock(DocumentText.DocumentText)({}),
  ServerSettings.layerTest({}),
  Layer.mock(GitWorkflowService.GitWorkflowService)({}),
  Layer.mock(ProjectSetupScriptRunner.ProjectSetupScriptRunner)({}),
  Layer.mock(VcsStatusBroadcaster.VcsStatusBroadcaster)({}),
);

const ToolList = Schema.fromJsonString(
  Schema.Struct({
    result: Schema.Struct({ tools: Schema.Array(Schema.Struct({ name: Schema.String })) }),
  }),
);
/** A hidden tool is refused with a JSON-RPC error, not a tool result. */
const ToolCall = Schema.fromJsonString(
  Schema.Struct({
    result: Schema.optional(
      Schema.Struct({
        isError: Schema.optional(Schema.Boolean),
        structuredContent: Schema.optional(Schema.Unknown),
      }),
    ),
    error: Schema.optional(Schema.Struct({ code: Schema.Number, message: Schema.String })),
  }),
);
const decodeToolList = Schema.decodeUnknownEffect(ToolList);
const decodeToolCall = Schema.decodeUnknownEffect(ToolCall);

/** A streamed response carries the JSON-RPC message after an SSE preamble. */
const firstJson = (body: string) => body.match(/\{.*\}/s)?.[0] ?? body;

it.effect(
  "module tools appear in tools/list while the module is on and vanish when it is off",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const layerRoutes = McpHttpServer.layer.pipe(Layer.provideMerge(McpSessionRegistry.layer));
        const context = yield* HttpRouter.serve(layerRoutes, {
          disableListenLog: true,
          disableLogger: true,
        }).pipe(
          Layer.provide(
            Layer.mock(ServerEnvironment.ServerEnvironment)({
              getEnvironmentId: Effect.succeed("environment-otterware" as never),
            }),
          ),
          Layer.provideMerge(OtterwareServer.layer),
          Layer.provide(ServerSecretStore.layer),
          Layer.provide(PreviewAutomationBroker.layer),
          Layer.provide(PreviewBrowser.layer),
          Layer.provide(layerStubServices),
          Layer.build,
        );
        const runtime = yield* ModuleRuntime.ModuleRuntime.pipe(Effect.provideContext(context));

        const registry = yield* McpSessionRegistry.McpSessionRegistry.pipe(
          Effect.provideContext(context),
        );
        const credential = yield* registry.issue({
          threadId: ThreadId.make("thread-otterware"),
          providerInstanceId: ProviderInstanceId.make("claudeAgent"),
        });
        const authorization = credential.config.authorizationHeader;
        const httpClient = yield* HttpClient.HttpClient;
        const post = (body: string, sessionId?: string) =>
          httpClient.post("/mcp", {
            headers: {
              accept: "application/json, text/event-stream",
              authorization,
              "mcp-protocol-version": "2025-06-18",
              ...(sessionId ? { "mcp-session-id": sessionId } : {}),
            },
            body: HttpBody.text(body, "application/json"),
          });

        const init = yield* post(
          `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"otterware","version":"1.0.0"}}}`,
        );
        expect(init.status).toBe(200);
        const sessionId = init.headers["mcp-session-id"];
        const listTools = Effect.gen(function* () {
          const response = yield* post(
            `{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}`,
            sessionId,
          );
          const listed = yield* decodeToolList(firstJson(yield* response.text));
          return listed.result.tools.map((tool) => tool.name);
        });
        const callTool = (name: string, args: unknown) =>
          Effect.gen(function* () {
            const response = yield* post(
              JSON.stringify({
                jsonrpc: "2.0",
                id: 3,
                method: "tools/call",
                params: { name, arguments: args },
              }),
              sessionId,
            );
            return yield* decodeToolCall(firstJson(yield* response.text));
          });

        // Home is on: its tools sit beside the upstream toolkits.
        const names = yield* listTools;
        expect(names).toContain("home_overview");
        expect(names).toContain("home_create_project");
        expect(names).toContain("delegate_task");
        // Home answers even when Code's projections cannot be read (stubbed here).
        const overview = yield* callTool("home_overview", {});
        expect(overview.error).toBeUndefined();
        expect(overview.result?.isError ?? false).toBe(false);
        expect(overview.result?.structuredContent).toMatchObject({
          contributors: expect.arrayContaining([{ module: "code", ok: false, itemCount: 0 }]),
        });
        expect(
          yield* Effect.sync(() => buildRuntimeInstructions({ harness: "Codex" })).pipe(
            Effect.provideContext(context),
          ),
        ).toContain("home_overview");

        // Off: withdrawn from the list, refused when called anyway, gone from the prompt.
        yield* runtime.setEnabled("home", false);
        const withoutHome = yield* listTools;
        expect(withoutHome).not.toContain("home_overview");
        expect(withoutHome).toContain("delegate_task");
        const refused = yield* callTool("home_overview", {});
        expect(refused.result).toBeUndefined();
        expect(refused.error?.message).toContain("home_overview");
        expect(
          yield* Effect.sync(() => buildRuntimeInstructions({ harness: "Codex" })).pipe(
            Effect.provideContext(context),
          ),
        ).not.toContain("home_overview");

        // Back on, without a restart.
        yield* runtime.setEnabled("home", true);
        expect(yield* listTools).toContain("home_overview");

        // Module migrations ran in suite.sqlite, beside (not inside) the main database.
        const config = yield* ServerConfig.ServerConfig;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        expect(
          yield* fs.exists(path.join(config.stateDir, SuiteDatabase.SUITE_DATABASE_FILENAME)),
        ).toBe(true);
        const sql = yield* SuiteDatabase.SuiteSqlClient.pipe(Effect.provideContext(context));
        const applied = yield* sql<{ readonly module: string; readonly id: number }>`
        SELECT module, id FROM suite_migrations
      `;
        expect(applied.map((row) => `${row.module}#${row.id}`)).toEqual(
          expect.arrayContaining(["host#1", "home#1"]),
        );
      }),
    ).pipe(
      Effect.provide(
        Layer.mergeAll(
          NodeHttpServer.layerTest,
          ServerConfig.layerTest(process.cwd(), { prefix: "t3-otterware-mcp-" }).pipe(
            Layer.provide(NodeServices.layer),
          ),
          NodeServices.layer,
        ),
      ),
    ),
);
