import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Stream from "effect/Stream";

import { type BrowserEnvironmentClient, makeBrowserEnvironmentClient } from "../client.ts";
import type { BrowserAgentEvent } from "../contracts.ts";
import { layerConnected } from "../test/connected.ts";
import { ACCOUNTS_URL, CLOUD_ORIGIN, makeFakeCloud, sse } from "../test/fakeCloud.ts";

const cloud = makeFakeCloud();

const chunk = (delta: unknown, finish: string | null = null) => ({
  choices: [{ index: 0, delta, finish_reason: finish }],
});

/** A chat-completions step that calls one tool. */
const toolStep = (id: string, name: string, args: unknown) =>
  sse(
    [
      chunk({ role: "assistant", content: "Let me check." }),
      chunk({
        tool_calls: [
          { index: 0, id, type: "function", function: { name, arguments: JSON.stringify(args) } },
        ],
      }),
      chunk({}, "tool_calls"),
    ],
    true,
  );
const answerStep = (text: string) => sse([chunk({ content: text }), chunk({}, "stop")], true);

/** Follows a thread from its first `thread.state` until the turn completes. */
const follow = (client: BrowserEnvironmentClient, threadId: string) =>
  Effect.gen(function* () {
    const events = yield* client["browser.agent.events"]({ threadId }).pipe(
      Stream.takeUntil((event) => event._tag === "turn.completed"),
      Stream.runCollect,
      Effect.forkScoped,
    );
    return events;
  });

const tags = (events: Iterable<BrowserAgentEvent>) => [...events].map((event) => event._tag);

it.layer(layerConnected(cloud), { timeout: 30_000 })("light agent loop", (it) => {
  it.effect("drives OpenClaw from the browser and answers its tools with module engines", () =>
    Effect.gen(function* () {
      const client = yield* makeBrowserEnvironmentClient;
      const bodies: Array<{
        readonly tools?: ReadonlyArray<{ readonly function: { readonly name: string } }>;
        readonly messages: ReadonlyArray<{ readonly role: string; readonly content: unknown }>;
      }> = [];
      const steps = [
        () => toolStep("call_1", "home_create_project", { name: "Acme" }),
        () => answerStep("Created Acme."),
      ];
      cloud.external = (url, init) => {
        assert.strictEqual(url, "https://claw.example/v1/chat/completions");
        bodies.push(JSON.parse(String(init.body)));
        return steps[bodies.length - 1]!();
      };
      yield* client["browser.agent.configure"]({
        agent: "openclaw",
        baseUrl: "https://claw.example",
        token: "claw-token",
      });
      const thread = yield* client["browser.agent.createThread"]({
        agent: "openclaw",
        model: "openclaw/default",
        access: "approval-required",
      });
      // The first event is the thread's state, so the turn below cannot be missed.
      const first = yield* client["browser.agent.events"]({ threadId: thread.id }).pipe(
        Stream.take(1),
        Stream.runCollect,
      );
      assert.deepStrictEqual(tags(first), ["thread.state"]);
      const followed = yield* follow(client, thread.id);
      yield* Effect.yieldNow;
      yield* client["browser.agent.send"]({ threadId: thread.id, text: "Track Acme" });

      // A safe tool waits for the user under approval-required access.
      const approval = yield* client["browser.agent.events"]({ threadId: thread.id }).pipe(
        Stream.filter(
          (event) => event._tag === "approval.requested" || event._tag === "thread.state",
        ),
        Stream.map((event) =>
          event._tag === "approval.requested"
            ? event.id
            : event._tag === "thread.state"
              ? event.approvals[0]?.id
              : undefined,
        ),
        Stream.filter((id): id is string => id !== undefined),
        Stream.runHead,
      );
      assert.strictEqual(approval._tag, "Some");
      yield* client["browser.agent.answer"]({
        threadId: thread.id,
        approvalId: approval._tag === "Some" ? approval.value : "",
        choice: "once",
      });

      const events = yield* Fiber.join(followed);
      assert.deepStrictEqual(
        tags(events).filter((tag) => tag !== "text.delta"),
        [
          "thread.state",
          "turn.started",
          "tool.started",
          "approval.requested",
          "approval.resolved",
          "tool.completed",
          "turn.completed",
        ],
      );

      // Tools offered follow the access: full-tier tools (creating events) are not.
      const offered = bodies[0]!.tools!.map((tool) => tool.function.name);
      assert.include(offered, "home_create_project");
      assert.include(offered, "calendar_list_accounts");
      assert.notInclude(offered, "calendar_create_event");

      // The tool ran in the browser's Home engine and its result went back to OpenClaw.
      const toolMessage = bodies[1]!.messages.find((message) => message.role === "tool")!;
      assert.include(String(toolMessage.content), '"name":"Acme"');

      const { messages } = yield* client["browser.agent.messages"]({ threadId: thread.id });
      assert.deepStrictEqual(
        messages.map((message) => message._tag),
        ["user", "assistant", "tool", "assistant"],
      );
      const [, , tool, answer] = messages;
      assert.strictEqual(tool?._tag === "tool" && tool.isError, false);
      assert.strictEqual(answer?._tag === "assistant" && answer.text, "Created Acme.");
    }),
  );

  it.effect("runs OpenRouter turns in Otter Cloud and answers its tool requests here", () =>
    Effect.gen(function* () {
      const client = yield* makeBrowserEnvironmentClient;
      const answered: Array<unknown> = [];
      cloud.cloud = (path, init) => {
        if (path === "/v1/cloud/agent/turn") {
          const turn = JSON.parse(String(init.body)) as {
            readonly requestId: string;
            readonly tools: ReadonlyArray<{ readonly name: string }>;
          };
          assert.notInclude(
            turn.tools.map((tool) => tool.name),
            "home_create_project",
          );
          const frame = (event: object) => ({ requestId: turn.requestId, ...event });
          return sse([
            frame({ type: "session", sessionId: "cloud-session" }),
            frame({ type: "toolRequest", id: "req_1", name: "calendar_list_accounts", input: {} }),
            frame({
              type: "toolRequest",
              id: "req_2",
              name: "home_create_project",
              input: { name: "X" },
            }),
            frame({ type: "delta", text: "You have no calendars yet." }),
            frame({ type: "done", responseId: null }),
          ]);
        }
        if (path === "/v1/cloud/agent/tool-result") {
          answered.push(JSON.parse(String(init.body)));
          return Response.json({ ok: true });
        }
        return Response.json({ error: "not found" }, { status: 404 });
      };

      const signedOut = yield* client["browser.agent.createThread"]({
        agent: "openrouter",
        model: "openrouter/auto",
        access: "read-only",
      });
      const refused = yield* Effect.flip(
        client["browser.agent.send"]({ threadId: signedOut.id, text: "hi" }),
      );
      assert.strictEqual(refused.reason, "not-configured");

      yield* client["browser.account.attach"]({
        accessToken: "oauth-ada",
        accountsUrl: ACCOUNTS_URL,
        cloudOrigin: CLOUD_ORIGIN,
      });
      const followed = yield* follow(client, signedOut.id);
      yield* Effect.yieldNow;
      yield* client["browser.agent.send"]({ threadId: signedOut.id, text: "What's on?" });
      const events = yield* Fiber.join(followed);
      assert.deepStrictEqual([...events].at(-1), {
        _tag: "turn.completed",
        status: "completed",
        message: null,
      });

      // Read-only access: the read tool ran, the write tool was refused before running.
      const outputs = answered.map(
        (body) =>
          body as {
            readonly id: string;
            readonly output: { readonly text: string; readonly isError: boolean };
          },
      );
      assert.deepStrictEqual(
        outputs.map(({ id, output }) => [id, output.isError]),
        [
          ["req_1", false],
          ["req_2", true],
        ],
      );
      assert.include(outputs[0]!.output.text, '"accounts":[]');
      assert.strictEqual(outputs[1]!.output.text, "Unknown tool: home_create_project");
    }),
  );
});
