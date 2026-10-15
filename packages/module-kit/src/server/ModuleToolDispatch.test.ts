import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { AuthOrchestrationReadScope, EnvironmentId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Tool from "effect/ai/Tool";
import * as Toolkit from "effect/ai/Toolkit";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";

import { defineModuleContract, moduleRpcErrors } from "../contracts/contract.ts";
import { moduleToolFailures, withToolTier } from "../contracts/tools.ts";
import { defineServerModule, ModuleToolCaller } from "../engine/ServerModule.ts";
import * as ModuleRuntime from "./ModuleRuntime.ts";
import { makeModuleToolDispatcher } from "./ModuleToolDispatch.ts";
import { layerRuntime } from "./RuntimeLayer.ts";
import * as SuiteDatabase from "./SuiteDatabase.ts";

const NotesContract = defineModuleContract({
  id: "notes",
  group: RpcGroup.make(
    Rpc.make("notes.ping", {
      payload: Schema.Struct({}),
      success: Schema.Struct({}),
      error: moduleRpcErrors(),
    }),
  ),
  scopes: { "notes.ping": AuthOrchestrationReadScope },
});

const failure = moduleToolFailures();
const NotesToolkit = Toolkit.make(
  withToolTier(
    Tool.make("notes_count", {
      description: "Counts characters.",
      parameters: Schema.Struct({ text: Schema.String }),
      success: Schema.Struct({ length: Schema.Number }),
      failure,
    }),
    "read-only",
  ),
  withToolTier(
    Tool.make("notes_publish", {
      description: "Publishes a note to the world.",
      parameters: Schema.Struct({ text: Schema.String }),
      success: Schema.Struct({ publishedBy: Schema.String }),
      failure,
    }),
    "full",
  ),
);

const NotesModule = defineServerModule({
  contract: NotesContract,
  migrations: [],
  tools: {
    toolkit: NotesToolkit,
    handlers: {
      notes_count: ({ text }: { readonly text: string }) => Effect.succeed({ length: text.length }),
      // The handler sees who called it, as on the MCP server.
      notes_publish: () =>
        Effect.gen(function* () {
          const caller = yield* ModuleToolCaller;
          return { publishedBy: caller.access };
        }),
    },
  },
});

const layer = layerRuntime([NotesModule]).pipe(
  Layer.provideMerge(SuiteDatabase.layerMemory),
  Layer.provide(NodeServices.layer),
);

const caller = (access: "read-only" | "approval-required" | "full-access") => ({
  environmentId: EnvironmentId.make("browser"),
  threadId: null,
  access,
});

it.layer(layer)("module tool dispatch", (it) => {
  it.effect("decodes parameters and gates each call by module state and tier", () =>
    Effect.gen(function* () {
      const runtime = yield* ModuleRuntime.ModuleRuntime;
      const dispatcher = yield* makeModuleToolDispatcher;

      assert.deepStrictEqual(
        dispatcher.available("read-only").map(({ tool }) => tool.name),
        ["notes_count"],
      );
      assert.deepStrictEqual(
        dispatcher.available("full-access").map(({ tool }) => tool.name),
        ["notes_count", "notes_publish"],
      );

      const counted = yield* dispatcher.call("notes_count", { text: "otter" }, caller("read-only"));
      assert.deepStrictEqual(counted, { text: '{"length":5}', isError: false });

      const invalid = yield* dispatcher.call("notes_count", { text: 3 }, caller("full-access"));
      assert.isTrue(invalid.isError);
      assert.include(invalid.text, "Invalid arguments for notes_count");

      // A refusal reaches the agent as the reason, before the handler runs.
      const refused = yield* dispatcher.call(
        "notes_publish",
        { text: "hi" },
        caller("approval-required"),
      );
      assert.deepStrictEqual(refused, {
        text: "notes_publish has effects outside this environment (sending, sharing or deleting), which needs a full-access caller.",
        isError: true,
      });

      const published = yield* dispatcher.call(
        "notes_publish",
        { text: "hi" },
        caller("full-access"),
      );
      assert.deepStrictEqual(published, { text: '{"publishedBy":"full-access"}', isError: false });

      yield* runtime.setEnabled("notes", false);
      assert.deepStrictEqual(dispatcher.available("full-access"), []);
      const off = yield* dispatcher.call("notes_count", { text: "x" }, caller("full-access"));
      assert.isTrue(off.isError);
      assert.include(off.text, "the notes module is turned off");
      yield* runtime.setEnabled("notes", true);

      const unknown = yield* dispatcher.call("nope", {}, caller("full-access"));
      assert.deepStrictEqual(unknown, { text: "Unknown tool: nope", isError: true });
    }),
  );
});
