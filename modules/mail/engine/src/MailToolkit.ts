import { MailError } from "@otterware/mail-contracts/rpc";
import {
  moduleToolFailures,
  withToolTier,
  type ModuleToolTier,
} from "@otterware/module-kit/contracts";
import { ModuleToolCaller } from "@otterware/module-kit/engine";
import * as Effect from "effect/Effect";
import type * as JsonSchema from "effect/JsonSchema";
import * as Tool from "effect/ai/Tool";
import * as Toolkit from "effect/ai/Toolkit";
import { MailRuntime } from "./MailRuntime.ts";
import { mailToolImplementations } from "./services/agent/tools/index.ts";
import type { AgentTool } from "./services/agent/tools/tool.ts";

export const mailToolTier = (tool: Pick<AgentTool, "readOnly" | "permanent">): ModuleToolTier =>
  tool.readOnly ? "read-only" : tool.permanent ? "full" : "safe";

/** The existing portable tool definitions are the single catalog for MCP and browser agents. */
export const MailToolkit = Toolkit.make(
  ...mailToolImplementations.map((tool) =>
    withToolTier(
      Tool.dynamic(`mail_${tool.name}`, {
        description: tool.description,
        parameters: tool.input as JsonSchema.JsonSchema,
        failure: moduleToolFailures(MailError),
      })
        .annotate(Tool.Title, tool.title)
        .annotate(Tool.Readonly, tool.readOnly === true)
        .annotate(Tool.Destructive, tool.permanent === true),
      mailToolTier(tool),
    ),
  ),
);

export const toolHandlers = Effect.gen(function* () {
  const runtime = yield* MailRuntime;
  return Object.fromEntries(
    mailToolImplementations.map((tool) => [
      `mail_${tool.name}`,
      (input: unknown) =>
        Effect.flatMap(ModuleToolCaller, (caller) => runtime.runTool(tool.name, input, caller)),
    ]),
  );
});
