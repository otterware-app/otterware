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
const LinkedAccount = Schema.Struct({
  provider: Schema.Literal("google"),
  email: Schema.String,
  /** This device's grant; null until the account is authorized here. */
  connection: Schema.NullOr(Connection),
});
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
  /** Built into a desktop app: it uses the app's account instead of signing in itself. */
  followsApp: Schema.Boolean,
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
  /** The app an environment is built into hands over its access token; null once it signs out. */
  Rpc.make("account.session.useAppAccount", {
    payload: Schema.Struct({ accessToken: Schema.NullOr(Schema.String) }),
    success: Schema.Void,
    error: errors,
  }),
  /** The Google accounts linked to the Otter Account, each with this device's grant, if any. */
  Rpc.make("account.connections.list", {
    payload: Schema.Struct({}),
    success: Schema.Array(LinkedAccount),
    error: errors,
  }),
  /** Authorizes Google on this device; `email` picks a linked account or adds Mail access. */
  Rpc.make("account.connections.connect", {
    payload: Schema.Struct({ provider: Provider, email: Schema.optional(Schema.String) }),
    success: Schema.Struct({ url: Schema.String }),
    error: errors,
  }),
  /** Unlinks an account from the Otter Account, on every device. */
  Rpc.make("account.connections.unlink", {
    payload: Schema.Struct({ email: Schema.String }),
    success: Schema.Void,
    error: errors,
  }),
);
export const ACCOUNT_RPC_SCOPES = {
  "account.session.state": AuthOrchestrationReadScope,
  "account.session.signIn": AuthSettingsWriteScope,
  "account.session.signOut": AuthSettingsWriteScope,
  "account.session.useAppAccount": AuthSettingsWriteScope,
  "account.connections.list": AuthOrchestrationReadScope,
  "account.connections.connect": AuthSettingsWriteScope,
  "account.connections.unlink": AuthSettingsWriteScope,
} as const;
