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
export const attachAccount = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "otterware:account-attach",
  tag: "account.session.attach",
});
export const detachAccount = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "otterware:account-detach",
  tag: "account.session.detach",
});
export const connectProvider = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "otterware:provider-connect",
  tag: "account.connections.connect",
});
export const disconnectProvider = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "otterware:provider-disconnect",
  tag: "account.connections.disconnect",
});
