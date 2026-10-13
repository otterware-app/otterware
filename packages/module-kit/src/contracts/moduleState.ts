import * as Schema from "effect/Schema";

/**
 * A module's state on one environment (ADR 0010). "Not installed" is not a
 * state: such a module is absent from `modules.list` altogether.
 */
export const ModuleState = Schema.Literals(["off", "on", "failed"]);
export type ModuleState = typeof ModuleState.Type;

export const ModuleStateEntry = Schema.Struct({
  id: Schema.String,
  state: ModuleState,
  /** Why the module could not start, when `failed`. Bounded, never a raw cause. */
  failure: Schema.optional(Schema.String),
});
export type ModuleStateEntry = typeof ModuleStateEntry.Type;

/** The answer every module RPC gives while its module is off or failed. */
export class ModuleOffError extends Schema.TaggedError<ModuleOffError>()("ModuleOffError", {
  module: Schema.String,
  state: ModuleState,
}) {
  override get message(): string {
    return this.state === "failed"
      ? `The ${this.module} module failed to start on this environment.`
      : `The ${this.module} module is turned off on this environment. Turn it on in Settings › Modules.`;
  }
}

export class ModuleNotInstalledError extends Schema.TaggedError<ModuleNotInstalledError>()(
  "ModuleNotInstalledError",
  { module: Schema.String },
) {
  override get message(): string {
    return `The ${this.module} module is not part of this build.`;
  }
}

/** Starting or stopping a module failed; the module's state says where it ended up. */
export class ModuleStateError extends Schema.TaggedError<ModuleStateError>()("ModuleStateError", {
  module: Schema.String,
  operation: Schema.Literals(["start", "stop", "persist"]),
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return `Could not ${this.operation} the ${this.module} module.`;
  }
}
