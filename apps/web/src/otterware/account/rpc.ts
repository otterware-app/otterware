import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import { connectionAtomRuntime } from "../../connection/runtime";

export const accountState = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "otterware:account-state",
  tag: "account.session.state",
  refreshIntervalMs: 5_000,
});
export const accountConnections = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "otterware:account-connections",
  tag: "account.connections.list",
  refreshIntervalMs: 5_000,
});
export const signInEnvironment = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "otterware:account-sign-in",
  tag: "account.session.signIn",
});
export const signOutEnvironment = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "otterware:account-sign-out",
  tag: "account.session.signOut",
});
export const connectProvider = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "otterware:provider-connect",
  tag: "account.connections.connect",
});
export const disconnectProvider = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "otterware:provider-disconnect",
  tag: "account.connections.disconnect",
});
export const handAppAccount = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "otterware:account-use-app",
  tag: "account.session.useAppAccount",
});
