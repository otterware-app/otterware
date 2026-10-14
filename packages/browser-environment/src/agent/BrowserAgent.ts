// @effect-diagnostics anyUnknownInErrorContext:off -- Turns run as promises (the portable protocol is promise-based); the boundary is wrapped in typed errors.
/**
 * The light agent loop (ADR 0009): chat, tools, approvals and history for the
 * API agents, in the browser's worker. Hermes and OpenClaw run the
 * environment's own drivers (`@otterware/provider-api-agents/engines`)
 * against the user's server; OpenRouter turns run in Otter Cloud with the
 * user's sealed key and call back for tools. Every tool call goes through the
 * module runtime's gate (`makeModuleToolDispatcher`) with the thread's access,
 * so tiers mean what they mean on an environment's MCP server.
 *
 * @module BrowserAgent
 */
import { toolTier } from "@otterware/module-kit/contracts";
import type { ModuleToolCallerScope } from "@otterware/module-kit/engine";
import { makeModuleToolDispatcher, ModuleRuntime } from "@otterware/module-kit/runtime";
import type { AgentTurn } from "@otterware/otter-cloud-client";
import {
  type ApiAgentEngine,
  makeHermesEngine,
  makeOpenClawEngine,
} from "@otterware/provider-api-agents/engines";
import {
  type AgentEvent,
  type AgentTool,
  type ApprovalChoice,
  makeApprovalGate,
  type ToolHost,
  type TurnOutcome,
} from "@otterware/provider-api-agents/protocol";
import type { HermesSettings, OpenClawSettings } from "@otterware/provider-api-agents/settings";
import { EnvironmentId } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as PubSub from "effect/PubSub";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as Tool from "effect/ai/Tool";

import { BrowserAccount } from "../account/BrowserAccount.ts";
import { BrowserInstallation } from "../BrowserInstallation.ts";
import { BrowserPlatform } from "../BrowserPlatform.ts";
import { AgentStore, type StoredThread } from "./AgentStore.ts";
import {
  type BrowserAgentAccess,
  type BrowserAgentApproval,
  BrowserAgentError,
  type BrowserAgentEvent,
  type BrowserAgentKind,
  type BrowserAgentMessage,
  type BrowserAgentSettings,
  type BrowserAgentThread,
} from "./contracts.ts";

/** What every browser turn's agent is told, before the modules' own instructions. */
const BROWSER_INSTRUCTIONS =
  "You run in the user's browser, without a computer: no shell, files or code. You act only through the tools provided.";

const CHOICES: ReadonlyArray<ApprovalChoice> = ["once", "session", "deny"];

/** A turn in flight: how to stop it and where its approvals wait. */
interface RunningTurn {
  readonly controller: AbortController;
  /** The Cloud turn's approvals; the drivers keep their own. */
  readonly gate: ReturnType<typeof makeApprovalGate>;
  readonly engine: ApiAgentEngine | null;
  /** The agent's id for the thread, once it has one. */
  nativeId: string | null;
  /** Approvals waiting for the user, for pages that subscribe mid-turn. */
  readonly approvals: Map<string, BrowserAgentApproval>;
}

export class BrowserAgent extends Context.Service<
  BrowserAgent,
  {
    readonly settings: Effect.Effect<BrowserAgentSettings, BrowserAgentError>;
    readonly configure: (
      input:
        | {
            readonly agent: "hermes";
            readonly baseUrl: string;
            readonly apiKey?: string | undefined;
          }
        | {
            readonly agent: "openclaw";
            readonly baseUrl: string;
            readonly token?: string | undefined;
          },
    ) => Effect.Effect<BrowserAgentSettings, BrowserAgentError>;
    readonly connectOpenRouter: (apiKey: string) => Effect.Effect<void, BrowserAgentError>;
    readonly disconnectOpenRouter: Effect.Effect<void, BrowserAgentError>;
    readonly models: (
      agent: BrowserAgentKind,
    ) => Effect.Effect<
      ReadonlyArray<{ readonly slug: string; readonly name: string; readonly isDefault?: boolean }>,
      BrowserAgentError
    >;
    readonly threads: Effect.Effect<ReadonlyArray<BrowserAgentThread>, BrowserAgentError>;
    readonly messages: (
      threadId: string,
    ) => Effect.Effect<ReadonlyArray<BrowserAgentMessage>, BrowserAgentError>;
    readonly createThread: (input: {
      readonly agent: BrowserAgentKind;
      readonly model: string;
      readonly access: BrowserAgentAccess;
      readonly title?: string | undefined;
    }) => Effect.Effect<BrowserAgentThread, BrowserAgentError>;
    readonly deleteThread: (threadId: string) => Effect.Effect<void, BrowserAgentError>;
    readonly send: (input: {
      readonly threadId: string;
      readonly text: string;
      readonly context?: string | undefined;
    }) => Effect.Effect<void, BrowserAgentError>;
    readonly events: (threadId: string) => Stream.Stream<BrowserAgentEvent>;
    readonly answer: (input: {
      readonly threadId: string;
      readonly approvalId: string;
      readonly choice: ApprovalChoice;
    }) => Effect.Effect<void, BrowserAgentError>;
    readonly stop: (threadId: string) => Effect.Effect<void>;
  }
>()("@otterware/browser-environment/agent/BrowserAgent") {}

const unavailable = (message: string) => new BrowserAgentError({ reason: "unavailable", message });
const notConfigured = (message: string) =>
  new BrowserAgentError({ reason: "not-configured", message });
const describe = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

const encodeJson = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));
const jsonText = (value: unknown) =>
  encodeJson(value).pipe(Effect.orElseSucceed(() => String(value)));

const hermesSettings = (baseUrl: string, apiKey: string) =>
  ({ enabled: true, baseUrl, apiKey, customModels: [] }) as HermesSettings;
const openClawSettings = (baseUrl: string, token: string) =>
  ({ enabled: true, baseUrl, token, customModels: [] }) as OpenClawSettings;

export const layer = Layer.effect(
  BrowserAgent,
  Effect.gen(function* () {
    const store = yield* AgentStore;
    const platform = yield* BrowserPlatform;
    const account = yield* BrowserAccount;
    const installation = yield* BrowserInstallation;
    const runtime = yield* ModuleRuntime.ModuleRuntime;
    const crypto = yield* Crypto.Crypto;
    const dispatcher = yield* makeModuleToolDispatcher;
    const services = yield* Effect.context<never>();
    const run = <A, E>(effect: Effect.Effect<A, E>, signal?: AbortSignal) =>
      Effect.runPromiseWith(services)(effect, signal ? { signal } : undefined);
    const now = () => Effect.runSyncWith(services)(Clock.currentTimeMillis);
    const fetch = platform.fetch;

    const published = yield* PubSub.unbounded<{
      readonly threadId: string;
      readonly event: BrowserAgentEvent;
    }>();
    const running = new Map<string, RunningTurn>();
    const publish = (threadId: string, event: BrowserAgentEvent) =>
      Effect.runSync(PubSub.publish(published, { threadId, event }));

    const storeFailure = (cause: unknown) =>
      unavailable(`Could not read this browser's data: ${describe(cause)}`);

    const environmentId = EnvironmentId.make(`browser:${installation.id}`);
    const caller = (access: BrowserAgentAccess): ModuleToolCallerScope => ({
      environmentId,
      threadId: null,
      access,
    });

    /** The module tools a thread's access may run, as the agent sees them. */
    const agentTools = (access: BrowserAgentAccess): ReadonlyArray<AgentTool> =>
      dispatcher.available(access).map(({ tool }) => ({
        name: tool.name,
        description: Tool.getDescription(tool) ?? tool.name,
        inputSchema: Tool.getJsonSchema(tool) as Record<string, unknown>,
        readOnly: toolTier(tool) === "read-only",
      }));

    const toolHost = (access: BrowserAgentAccess): ToolHost => ({
      list: async () => agentTools(access),
      call: (name, args, signal) => run(dispatcher.call(name, args, caller(access)), signal),
    });

    const engineFor = (agent: "hermes" | "openclaw") =>
      Effect.gen(function* () {
        const server = yield* store.server(agent).pipe(Effect.mapError(storeFailure));
        if (server.baseUrl === "")
          return yield* notConfigured(
            agent === "hermes"
              ? "Add your Hermes API server's address and key."
              : "Add your OpenClaw gateway's address and token.",
          );
        return agent === "hermes"
          ? makeHermesEngine(hermesSettings(server.baseUrl, server.secret), { fetch })
          : makeOpenClawEngine(openClawSettings(server.baseUrl, server.secret), { fetch });
      });

    const cloud = account.cloud.pipe(
      Effect.mapError(() =>
        notConfigured("Sign in to your Otter Account to use OpenRouter in the browser."),
      ),
    );

    const settings = Effect.gen(function* () {
      const hermes = yield* store.server("hermes");
      const openclaw = yield* store.server("openclaw");
      return {
        hermes: { baseUrl: hermes.baseUrl, hasApiKey: hermes.secret !== "" },
        openclaw: { baseUrl: openclaw.baseUrl, hasToken: openclaw.secret !== "" },
      };
    }).pipe(Effect.mapError(storeFailure));

    const toThread = (thread: StoredThread): BrowserAgentThread => ({
      id: thread.id,
      agent: thread.agent,
      model: thread.model,
      access: thread.access,
      title: thread.title,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      running: running.has(thread.id),
    });

    const findThread = (threadId: string) =>
      store.thread(threadId).pipe(
        Effect.mapError(storeFailure),
        Effect.flatMap(
          Option.match({
            onNone: () =>
              Effect.fail(
                new BrowserAgentError({
                  reason: "not-found",
                  message: "This chat no longer exists.",
                }),
              ),
            onSome: Effect.succeed,
          }),
        ),
      );

    /**
     * Runs one turn to its end, publishing live events and appending each
     * settled entry to the thread's history as it settles.
     */
    const runTurn = async (
      thread: StoredThread,
      text: string,
      context: string | undefined,
      turn: RunningTurn,
    ): Promise<TurnOutcome> => {
      const { engine } = turn;
      const { signal } = turn.controller;
      const append = (message: BrowserAgentMessage) =>
        run(store.append(thread.id, message)).catch(() => undefined);
      let segment = "";
      const flush = async () => {
        if (segment.trim() === "") return;
        const settled = segment;
        segment = "";
        await append({ _tag: "assistant", text: settled, at: now() });
      };
      const tools = new Map<string, { name: string; input: unknown }>();
      const emit = (event: AgentEvent) => {
        switch (event.type) {
          case "text.delta":
            segment += event.text;
            publish(thread.id, { _tag: "text.delta", text: event.text });
            return;
          case "tool.started":
            void flush();
            tools.set(event.id, { name: event.name, input: event.input });
            publish(thread.id, {
              _tag: "tool.started",
              id: event.id,
              name: event.name,
              input: event.input,
            });
            return;
          case "tool.completed": {
            const started = tools.get(event.id);
            void append({
              _tag: "tool",
              toolId: event.id,
              name: started?.name ?? "tool",
              input: started?.input ?? null,
              output: event.output,
              isError: event.isError,
            });
            publish(thread.id, {
              _tag: "tool.completed",
              id: event.id,
              output: event.output,
              isError: event.isError,
            });
            return;
          }
          case "approval.requested": {
            const approval: BrowserAgentApproval = {
              id: event.id,
              title: event.title,
              detail: event.detail ?? null,
              choices: [...event.choices],
            };
            turn.approvals.set(event.id, approval);
            publish(thread.id, { _tag: "approval.requested", ...approval });
            return;
          }
          case "approval.resolved":
            turn.approvals.delete(event.id);
            publish(thread.id, { _tag: "approval.resolved", id: event.id });
            return;
          default:
            return;
        }
      };

      const input = context ? `${text}\n\n<page-context>\n${context}\n</page-context>` : text;
      const access = thread.access;
      try {
        if (engine !== null) {
          let nativeId = turn.nativeId;
          if (nativeId === null) {
            nativeId = await engine.createNativeThread(
              { title: thread.title, id: thread.id },
              signal,
            );
            turn.nativeId = nativeId;
            await run(store.setNativeId(thread.id, nativeId));
          }
          const instructions = [BROWSER_INSTRUCTIONS, await run(runtime.agentInstructions)]
            .filter((part) => part.trim() !== "")
            .join("\n\n");
          return await engine.runTurn({
            nativeThreadId: nativeId,
            model: thread.model,
            history: [],
            text: input,
            attachments: [],
            instructions,
            askBeforeChanges: access === "approval-required",
            tools: engine.usesThreadTools ? agentTools(access) : [],
            toolHost: engine.usesThreadTools ? toolHost(access) : undefined,
            emit,
            signal,
          });
        }
        return await runCloudTurn(thread, input, turn, emit);
      } catch (error) {
        if (signal.aborted) return { status: "cancelled" };
        return { status: "failed", message: describe(error), failureClass: "transport_error" };
      } finally {
        await flush();
      }
    };

    /** An OpenRouter turn in Otter Cloud; tool requests come back to this browser's engines. */
    const runCloudTurn = async (
      thread: StoredThread,
      input: string,
      turn: RunningTurn,
      emit: (event: AgentEvent) => void,
    ): Promise<TurnOutcome> => {
      const { signal } = turn.controller;
      const { client } = await run(cloud);
      const requestId = await run(crypto.randomUUIDv4());
      const tools = agentTools(thread.access);
      const byName = new Map(tools.map((tool) => [tool.name, tool]));
      const host = toolHost(thread.access);
      const allowed = new Set<string>();
      const request: AgentTurn = {
        requestId,
        ...(turn.nativeId ? { sessionId: turn.nativeId } : { title: thread.title }),
        input,
        model: thread.model,
        tools: tools.map((tool) => ({
          name: tool.name,
          title: tool.name,
          description: tool.description,
          input: tool.inputSchema,
        })),
      };
      const answered = new Set<string>();
      const onAbort = () => void client.cancelAgentTurn(requestId).catch(() => undefined);
      signal.addEventListener("abort", onAbort, { once: true });
      try {
        for await (const event of client.agentTurn(request, signal)) {
          switch (event.type) {
            case "session":
              turn.nativeId = event.sessionId;
              await run(store.setNativeId(thread.id, event.sessionId));
              break;
            case "delta":
              emit({ type: "text.delta", text: event.text });
              break;
            case "tool":
              if (!answered.has(event.id))
                emit({
                  type: "tool.started",
                  id: event.id,
                  name: event.step.title,
                  input: event.step.detail,
                });
              break;
            case "toolResult":
              if (!answered.has(event.id))
                emit({
                  type: "tool.completed",
                  id: event.id,
                  output: event.output,
                  isError: false,
                });
              break;
            case "toolRequest": {
              answered.add(event.id);
              emit({ type: "tool.started", id: event.id, name: event.name, input: event.input });
              const tool = byName.get(event.name);
              let output: { text: string; isError: boolean };
              if (tool === undefined) {
                output = { text: `Unknown tool: ${event.name}`, isError: true };
              } else {
                let choice: ApprovalChoice = "once";
                if (
                  thread.access === "approval-required" &&
                  !tool.readOnly &&
                  !allowed.has(tool.name)
                ) {
                  const approvalId = `approval:${event.id}`;
                  emit({
                    type: "approval.requested",
                    id: approvalId,
                    kind: "tool",
                    title: tool.name,
                    detail: await run(jsonText(event.input)),
                    choices: CHOICES,
                  });
                  choice = await turn.gate.wait(approvalId, signal);
                  emit({ type: "approval.resolved", id: approvalId });
                  if (choice === "session") allowed.add(tool.name);
                }
                output =
                  choice === "deny"
                    ? { text: "The user declined this tool call.", isError: true }
                    : await host.call(event.name, event.input, signal);
              }
              emit({
                type: "tool.completed",
                id: event.id,
                output: output.text,
                isError: output.isError,
              });
              await client.answerAgentTool(requestId, event.id, output);
              break;
            }
            case "error":
              return { status: "failed", message: event.message, failureClass: "provider_error" };
            case "done":
              return { status: "completed" };
          }
        }
        return signal.aborted
          ? { status: "cancelled" }
          : {
              status: "failed",
              message: "Otter Cloud ended the turn early.",
              failureClass: "transport_error",
            };
      } finally {
        signal.removeEventListener("abort", onAbort);
      }
    };

    /** Aborts the turn here and, for drivers that run on, on the agent's side. */
    const stopTurn = (threadId: string) =>
      Effect.promise(async () => {
        const turn = running.get(threadId);
        if (turn === undefined) return;
        turn.controller.abort();
        if (turn.engine !== null && turn.nativeId !== null)
          await turn.engine.stop(turn.nativeId).catch(() => undefined);
      });

    const send: BrowserAgent["Service"]["send"] = ({ threadId, text, context }) =>
      Effect.gen(function* () {
        if (running.has(threadId))
          return yield* new BrowserAgentError({
            reason: "busy",
            message: "Wait for the current answer or stop it first.",
          });
        const thread = yield* findThread(threadId);
        const engine = thread.agent === "openrouter" ? null : yield* engineFor(thread.agent);
        if (engine === null) yield* cloud;
        const turn: RunningTurn = {
          controller: new AbortController(),
          gate: makeApprovalGate(),
          engine,
          nativeId: thread.nativeId,
          approvals: new Map(),
        };
        running.set(threadId, turn);
        yield* store
          .append(threadId, { _tag: "user", text, at: yield* Clock.currentTimeMillis })
          .pipe(Effect.mapError(storeFailure));
        publish(threadId, { _tag: "turn.started" });
        void runTurn(thread, text, context, turn).then(async (outcome) => {
          running.delete(threadId);
          const message =
            outcome.status === "failed"
              ? outcome.message
              : outcome.status === "cancelled"
                ? "Stopped."
                : null;
          if (message !== null)
            await run(store.append(threadId, { _tag: "notice", text: message, at: now() })).catch(
              () => undefined,
            );
          publish(threadId, { _tag: "turn.completed", status: outcome.status, message });
        });
      });

    return BrowserAgent.of({
      settings,
      configure: (input) =>
        Effect.gen(function* () {
          const saved = yield* store.server(input.agent);
          const credential = input.agent === "hermes" ? input.apiKey : input.token;
          yield* store.saveServer(input.agent, {
            baseUrl: input.baseUrl.trim(),
            secret: credential === undefined ? saved.secret : credential.trim(),
          });
        }).pipe(Effect.mapError(storeFailure), Effect.andThen(settings)),
      connectOpenRouter: (apiKey) =>
        Effect.flatMap(cloud, ({ client }) =>
          Effect.tryPromise({
            try: () => client.connectAgent(apiKey),
            catch: () => unavailable("Otter Cloud could not check this OpenRouter key."),
          }),
        ).pipe(Effect.asVoid),
      disconnectOpenRouter: Effect.flatMap(cloud, ({ client }) =>
        Effect.tryPromise({
          try: () => client.disconnectAgent(),
          catch: () => unavailable("Could not reach Otter Cloud. Try again."),
        }),
      ).pipe(Effect.asVoid),
      models: (agent) =>
        agent === "openrouter"
          ? Effect.flatMap(cloud, ({ client }) =>
              Effect.tryPromise({
                try: () => client.agentConnection(),
                catch: () => unavailable("Could not reach Otter Cloud. Try again."),
              }),
            ).pipe(
              Effect.flatMap((connection) =>
                connection.connected
                  ? Effect.succeed(
                      connection.models.map((model) => ({
                        slug: model.slug,
                        name: model.name,
                        ...(model.isDefault === undefined ? {} : { isDefault: model.isDefault }),
                      })),
                    )
                  : Effect.fail(notConfigured("Connect your OpenRouter key first.")),
              ),
            )
          : Effect.flatMap(engineFor(agent), (engine) =>
              Effect.tryPromise({
                try: (signal) => engine.listModels(signal),
                catch: (cause) => unavailable(describe(cause)),
              }),
            ).pipe(
              Effect.map((models) =>
                models.map((model) => ({
                  slug: model.slug,
                  name: model.name,
                  ...(model.isDefault === undefined ? {} : { isDefault: model.isDefault }),
                })),
              ),
            ),
      threads: Effect.map(store.threads, (threads) => threads.map(toThread)).pipe(
        Effect.mapError(storeFailure),
      ),
      messages: (threadId) =>
        findThread(threadId).pipe(
          Effect.andThen(store.messages(threadId).pipe(Effect.mapError(storeFailure))),
        ),
      createThread: (input) =>
        Effect.gen(function* () {
          const id = yield* crypto.randomUUIDv4();
          const thread = yield* store.createThread({
            id,
            agent: input.agent,
            model: input.model,
            access: input.access,
            title: input.title?.trim() || "New chat",
          });
          return toThread(thread);
        }).pipe(Effect.mapError(storeFailure)),
      deleteThread: (threadId) =>
        Effect.gen(function* () {
          yield* stopTurn(threadId);
          yield* store.deleteThread(threadId).pipe(Effect.mapError(storeFailure));
        }),
      send,
      events: (threadId) =>
        Stream.unwrap(
          Effect.gen(function* () {
            // Subscribed before the snapshot, so nothing between them is lost.
            const subscription = yield* PubSub.subscribe(published);
            const turn = running.get(threadId);
            const state: BrowserAgentEvent = {
              _tag: "thread.state",
              running: turn !== undefined,
              approvals: turn === undefined ? [] : [...turn.approvals.values()],
            };
            return Stream.concat(
              Stream.succeed(state),
              Stream.fromSubscription(subscription).pipe(
                Stream.filter((entry) => entry.threadId === threadId),
                Stream.map((entry) => entry.event),
              ),
            );
          }),
        ),
      answer: ({ threadId, approvalId, choice }) => {
        const turn = running.get(threadId);
        if (turn === undefined)
          return Effect.fail(
            new BrowserAgentError({
              reason: "not-found",
              message: "This answer is no longer awaited.",
            }),
          );
        if (turn.gate.answer(approvalId, choice)) return Effect.void;
        const { engine, nativeId } = turn;
        if (engine === null || nativeId === null)
          return Effect.fail(
            new BrowserAgentError({
              reason: "not-found",
              message: "This answer is no longer awaited.",
            }),
          );
        return Effect.tryPromise({
          try: () => engine.answer(nativeId, approvalId, choice),
          catch: (cause) => unavailable(describe(cause)),
        });
      },
      stop: (threadId) => stopTurn(threadId),
    });
  }),
);
