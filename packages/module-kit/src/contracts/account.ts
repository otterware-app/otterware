import {
  AuthSettingsWriteScope,
  AuthOrchestrationReadScope,
  EnvironmentAuthorizationError,
} from "@t3tools/contracts";
import { Connection, Provider } from "@otterware/otter-cloud-client/contracts";
import * as Schema from "effect/Schema";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";

export class AccountSessionError extends Schema.TaggedError<AccountSessionError>()(
  "AccountSessionError",
  {
    message: Schema.String,
  },
) {}
const errors = Schema.Union([AccountSessionError, EnvironmentAuthorizationError]);
const SignInPrompt = Schema.Struct({
  verificationUrl: Schema.String,
  userCode: Schema.String,
  expiresAt: Schema.Number,
});
/** The environment's own account; a client compares it with its own sign-in. */
const state = Schema.Struct({
  accountId: Schema.NullOr(Schema.String),
  email: Schema.NullOr(Schema.String),
  pendingSignIn: Schema.NullOr(SignInPrompt),
  error: Schema.NullOr(Schema.String),
});
export const AccountRpcGroup = RpcGroup.make(
  Rpc.make("account.session.state", { payload: Schema.Struct({}), success: state, error: errors }),
  Rpc.make("account.session.signIn", {
    payload: Schema.Struct({}),
    success: SignInPrompt,
    error: errors,
  }),
  Rpc.make("account.session.signOut", {
    payload: Schema.Struct({}),
    success: Schema.Void,
    error: errors,
  }),
  Rpc.make("account.connections.list", {
    payload: Schema.Struct({}),
    success: Schema.Array(Connection),
    error: errors,
  }),
  Rpc.make("account.connections.connect", {
    payload: Schema.Struct({
      provider: Provider,
      scopes: Schema.Array(Schema.String),
      returnTo: Schema.String,
    }),
    success: Schema.Struct({ url: Schema.String }),
    error: errors,
  }),
  Rpc.make("account.connections.disconnect", {
    payload: Schema.Struct({ connectionId: Schema.String }),
    success: Schema.Void,
    error: errors,
  }),
);
export const ACCOUNT_RPC_SCOPES = {
  "account.session.state": AuthOrchestrationReadScope,
  "account.session.signIn": AuthSettingsWriteScope,
  "account.session.signOut": AuthSettingsWriteScope,
  "account.connections.list": AuthOrchestrationReadScope,
  "account.connections.connect": AuthSettingsWriteScope,
  "account.connections.disconnect": AuthSettingsWriteScope,
} as const;
