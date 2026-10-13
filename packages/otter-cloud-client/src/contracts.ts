import * as Schema from "effect/Schema";

export const Provider = Schema.Literals(["google", "microsoft"]);
export const Collection = Schema.Literals([
  "settings",
  "mail.projects",
  "mail.views",
  "home.projects",
]);
export const Connection = Schema.Struct({
  id: Schema.String,
  provider: Provider,
  email: Schema.String,
  scopes: Schema.Array(Schema.String),
  updatedAt: Schema.Number,
});
export const Connections = Schema.Struct({ connections: Schema.Array(Connection) });
export const AccessToken = Schema.Struct({
  accessToken: Schema.String,
  expiresAt: Schema.Number,
  audience: Schema.String,
});
export const ProviderToken = Schema.Struct({
  connectionId: Schema.String,
  accessToken: Schema.String,
  expiresAt: Schema.Number,
  audience: Schema.String,
  scopes: Schema.Array(Schema.String),
});
export const SyncRecord = Schema.Struct({
  collection: Collection,
  id: Schema.String,
  value: Schema.Unknown,
  modifiedAt: Schema.Number,
  mutationId: Schema.String,
});
export const SyncedRecord = Schema.Struct({ ...SyncRecord.fields, revision: Schema.Number });
export const SyncPush = Schema.Struct({ records: Schema.Array(SyncedRecord) });
export const SyncPage = Schema.Struct({
  records: Schema.Array(SyncedRecord),
  cursor: Schema.Number,
  hasMore: Schema.Boolean,
});
export const ChannelTicket = Schema.Struct({ ticket: Schema.String, expiresAt: Schema.Number });
export const ConnectResult = Schema.Struct({ url: Schema.String });
export const ChannelEvent = Schema.Union([
  Schema.Struct({ type: Schema.Literal("sync.changed") }),
  Schema.Struct({ type: Schema.Literal("connections.changed") }),
  Schema.Struct({ type: Schema.Literal("heartbeat") }),
  Schema.Struct({
    type: Schema.Literal("module.push"),
    module: Schema.Literal("mail"),
    event: Schema.Unknown,
  }),
  Schema.Struct({ type: Schema.Literal("result"), id: Schema.String, data: Schema.Unknown }),
  Schema.Struct({
    type: Schema.Literal("error"),
    id: Schema.optional(Schema.String),
    status: Schema.Number,
    error: Schema.String,
  }),
]);
export type Provider = typeof Provider.Type;
export type Connection = typeof Connection.Type;
export type ProviderToken = typeof ProviderToken.Type;
export type SyncRecord = typeof SyncRecord.Type;
export type SyncedRecord = typeof SyncedRecord.Type;
export type ChannelEvent = typeof ChannelEvent.Type;

export * from "./agent-contracts.ts";
