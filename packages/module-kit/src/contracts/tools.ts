import * as Context from "effect/Context";
import * as Schema from "effect/Schema";
import type * as Tool from "effect/ai/Tool";

/**
 * What a module tool may do, declared as an annotation and enforced by the
 * host before the handler runs: `read-only` tools run for every caller,
 * `safe` tools (non-destructive writes) refuse read-only MCP clients, and
 * `full` tools (destructive or external effects: sending mail, deleting
 * files) need a full-access caller.
 */
export const MODULE_TOOL_TIERS = ["read-only", "safe", "full"] as const;
export type ModuleToolTier = (typeof MODULE_TOOL_TIERS)[number];

/** Defaults to `full`, so a tool that forgot to declare its tier is the most guarded. */
export const ModuleToolTier = Context.Reference<ModuleToolTier>(
  "otterware/module-kit/ModuleToolTier",
  { defaultValue: () => "full" },
);

export const withToolTier = <T extends Tool.Any>(tool: T, tier: ModuleToolTier): T =>
  tool.annotate(ModuleToolTier, tier) as T;

export const toolTier = (tool: Tool.Any): ModuleToolTier =>
  Context.get(tool.annotations, ModuleToolTier);

/**
 * Why the host refused a module tool call before the handler ran. Declared in
 * every module tool's failure schema (`moduleToolFailures`) so the agent reads
 * the reason instead of a scrubbed internal error.
 */
export class ModuleToolRefusedError extends Schema.TaggedError<ModuleToolRefusedError>()(
  "ModuleToolRefusedError",
  {
    module: Schema.String,
    tool: Schema.String,
    reason: Schema.Literals(["module-off", "read-only-caller", "full-access-required"]),
  },
) {
  override get message(): string {
    switch (this.reason) {
      case "module-off":
        return `${this.tool} is unavailable: the ${this.module} module is turned off on this environment. Ask the user to turn it on in Settings › Modules.`;
      case "read-only-caller":
        return `${this.tool} changes ${this.module} data, and this MCP client was approved for read-only access.`;
      case "full-access-required":
        return `${this.tool} has effects outside this environment (sending, sharing or deleting), which needs a full-access caller.`;
    }
  }
}

/** The failure union every module tool starts from; add the module's own errors. */
export const moduleToolFailures = <const Members extends ReadonlyArray<Schema.Top>>(
  ...members: Members
) => Schema.Union([ModuleToolRefusedError, ...members]);
