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
import { mailToolDefinitions, type MailToolDefinition } from "@otterware/mail-contracts/tools";
import { projectToolDefinitions } from "@otterware/mail-contracts/project-tools";
type ToolAccess = { readOnly?: boolean | undefined; permanent?: boolean | undefined };
const descriptors: readonly MailToolDefinition[] = [
  ...mailToolDefinitions,
  ...projectToolDefinitions(),
];

export const mailToolTier = (tool: ToolAccess): ModuleToolTier =>
  tool.readOnly ? "read-only" : tool.permanent ? "full" : "safe";

/** The existing portable tool definitions are the single catalog for MCP and browser agents. */
export const MailToolkit = Toolkit.make(
  ...descriptors.map((tool) =>
    withToolTier(
      Tool.dynamic(`mail_${tool.name}`, {
        description: tool.description,
        parameters: tool.input as JsonSchema.JsonSchema,
        failure: moduleToolFailures(MailError),
      })
        .annotate(Tool.Title, tool.title)
        .annotate(Tool.Readonly, tool.readOnly === true)
        .annotate(Tool.Destructive, "permanent" in tool && tool.permanent === true),
      mailToolTier(tool),
    ),
  ),
);

export const toolHandlers = Effect.gen(function* () {
  const runtime = yield* MailRuntime;
  return Object.fromEntries(
    descriptors.map((tool) => [
      `mail_${tool.name}`,
      (input: unknown) =>
        Effect.flatMap(ModuleToolCaller, (caller) => runtime.runTool(tool.name, input, caller)),
    ]),
  );
});
