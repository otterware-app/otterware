import * as Schema from "effect/Schema";
const ObjectFields = Schema.Record(Schema.String, Schema.Unknown);
export const AgentModel = Schema.Struct({
  slug: Schema.String,
  name: Schema.String,
  subProvider: Schema.optional(Schema.String),
  isDefault: Schema.optional(Schema.Boolean),
  inputModalities: Schema.Array(Schema.String),
});
export const AgentConnection = Schema.Struct({
  connected: Schema.Boolean,
  models: Schema.Array(AgentModel),
});
export const AgentFile = Schema.Struct({
  name: Schema.String,
  mime: Schema.String,
  data: Schema.String,
});
export const AgentToolOutput = Schema.Struct({
  text: Schema.String,
  isError: Schema.Boolean,
  file: Schema.optional(AgentFile),
});
export const AgentTurn = Schema.Struct({
  requestId: Schema.String,
  sessionId: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
  input: Schema.String,
  model: Schema.String,
  tools: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      title: Schema.String,
      description: Schema.String,
      input: ObjectFields,
    }),
  ),
  attachments: Schema.optional(Schema.Array(AgentFile)),
});
export const AgentStep = Schema.Struct({
  kind: Schema.Literal("tool"),
  title: Schema.String,
  source: Schema.String,
  detail: Schema.String,
});
export const AgentMessages = Schema.Array(
  Schema.Struct({
    role: Schema.Literals(["user", "assistant", "tool"]),
    text: Schema.String,
    toolName: Schema.optional(Schema.String),
    toolCalls: Schema.optional(Schema.Array(AgentStep)),
  }),
);
export const AgentSessions = Schema.Array(
  Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    source: Schema.String,
    lastActive: Schema.Number,
    messageCount: Schema.Number,
    preview: Schema.NullOr(Schema.String),
  }),
);
export const AgentEvent = Schema.Union([
  Schema.Struct({
    requestId: Schema.String,
    type: Schema.Literal("session"),
    sessionId: Schema.String,
  }),
  Schema.Struct({ requestId: Schema.String, type: Schema.Literal("delta"), text: Schema.String }),
  Schema.Struct({
    requestId: Schema.String,
    type: Schema.Literal("tool"),
    id: Schema.String,
    step: AgentStep,
  }),
  Schema.Struct({
    requestId: Schema.String,
    type: Schema.Literal("toolResult"),
    id: Schema.String,
    output: Schema.String,
  }),
  Schema.Struct({
    requestId: Schema.String,
    type: Schema.Literal("done"),
    responseId: Schema.Null,
  }),
  Schema.Struct({
    requestId: Schema.String,
    type: Schema.Literal("error"),
    message: Schema.String,
  }),
  Schema.Struct({
    requestId: Schema.String,
    type: Schema.Literal("toolRequest"),
    id: Schema.String,
    name: Schema.String,
    input: ObjectFields,
  }),
]);
export type AgentTurn = typeof AgentTurn.Type;
export type AgentToolOutput = typeof AgentToolOutput.Type;
export type AgentEvent = typeof AgentEvent.Type;
