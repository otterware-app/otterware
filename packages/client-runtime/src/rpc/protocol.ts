import { OtterwareWsRpcGroup } from "@otterware/composition/contracts";
import * as Effect from "effect/Effect";
import { RpcClient } from "effect/rpc";

// Otterware seam: the upstream group plus this build's host and module RPCs.
export const makeWsRpcProtocolClient = RpcClient.make(OtterwareWsRpcGroup);
type RpcClientFactory = typeof makeWsRpcProtocolClient;
export type WsRpcProtocolClient =
  RpcClientFactory extends Effect.Effect<infer Client, any, any> ? Client : never;

// Pings go out every 5 seconds, and a server busy for a few seconds stops
// answering them. Allow 15 seconds without any frame before dropping the socket.
export const PING_TIMEOUT = "15 seconds";
