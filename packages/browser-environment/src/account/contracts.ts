/**
 * The in-browser environment's Otter Account (ADR 0007, 0018): the page hands
 * the worker its Account sign-in, and the worker reaches Otter Cloud like any
 * environment does: provider tokens, the channel's push, account data sync.
 */
import { Connection, Provider } from "@otterware/otter-cloud-client/contracts";
import * as Schema from "effect/Schema";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";

export const BrowserAccountStatus = Schema.Literals([
  "signed-out",
  "connecting",
  "connected",
  "failed",
]);
export type BrowserAccountStatus = typeof BrowserAccountStatus.Type;

export const BrowserAccountState = Schema.Struct({
  status: BrowserAccountStatus,
  /** The Otter Account's id while signed in. */
  userId: Schema.NullOr(Schema.String),
  /** Why the last attempt failed; null otherwise. */
  message: Schema.NullOr(Schema.String),
});
export type BrowserAccountState = typeof BrowserAccountState.Type;

export class BrowserAccountError extends Schema.TaggedError<BrowserAccountError>()(
  "BrowserAccountError",
  {
    reason: Schema.Literals(["signed-out", "unavailable"]),
    message: Schema.String,
  },
) {}

/** The page's Account sign-in: a Code OAuth access token and where it was issued. */
export const BrowserAccountCredential = Schema.Struct({
  accessToken: Schema.String,
  /** Otter Accounts' API root, e.g. `https://accounts.otterware.app/v1/auth`. */
  accountsUrl: Schema.String,
  /** Otter Cloud's origin, e.g. `https://cloud.otterware.app`. */
  cloudOrigin: Schema.String,
  /** Otter Mail's relay, which seals this browser's Google grants (`BrowserGoogle`). */
  mailRelayUrl: Schema.optional(Schema.String),
});
export type BrowserAccountCredential = typeof BrowserAccountCredential.Type;

export const BROWSER_ACCOUNT_METHODS = {
  attach: "browser.account.attach",
  detach: "browser.account.detach",
  watch: "browser.account.watch",
  connections: "browser.account.connections",
  connect: "browser.account.connect",
  disconnect: "browser.account.disconnect",
  saveGoogle: "browser.account.saveGoogle",
} as const;

export const BrowserAccountRpcGroup = RpcGroup.make(
  /** Signs this browser's environment in; the page calls it again with each fresh token. */
  Rpc.make(BROWSER_ACCOUNT_METHODS.attach, {
    payload: BrowserAccountCredential,
    success: BrowserAccountState,
    error: BrowserAccountError,
  }),
  Rpc.make(BROWSER_ACCOUNT_METHODS.detach, { payload: Schema.Struct({}) }),
  Rpc.make(BROWSER_ACCOUNT_METHODS.watch, {
    payload: Schema.Struct({}),
    success: BrowserAccountState,
    stream: true,
  }),
  Rpc.make(BROWSER_ACCOUNT_METHODS.connections, {
    payload: Schema.Struct({}),
    success: Schema.Struct({ connections: Schema.Array(Connection) }),
    error: BrowserAccountError,
  }),
  /** Starts connecting Google in this browser; the page opens the returned URL in a popup. */
  Rpc.make(BROWSER_ACCOUNT_METHODS.connect, {
    payload: Schema.Struct({
      provider: Provider,
      scopes: Schema.Array(Schema.String),
      returnTo: Schema.String,
    }),
    success: Schema.Struct({ url: Schema.String }),
    error: BrowserAccountError,
  }),
  /** Forgets a Google grant in this browser only (Google revokes per project, not per device). */
  Rpc.make(BROWSER_ACCOUNT_METHODS.disconnect, {
    payload: Schema.Struct({ connectionId: Schema.String }),
    error: BrowserAccountError,
  }),
  /** Keeps the sealed grant the relay's popup handed the page. */
  Rpc.make(BROWSER_ACCOUNT_METHODS.saveGoogle, {
    payload: Schema.Struct({ email: Schema.String, sealed: Schema.String }),
    error: BrowserAccountError,
  }),
);
