// @effect-diagnostics nodeBuiltinImport:off -- The page and its worker meet over a MessageChannel, Node's stand-in for a worker's port.
/**
 * The worker's server on one end of a channel and the page's client protocol
 * on the other, as in the browser: everything crosses the port as the worker
 * protocol's messages. Otter Cloud and agent servers are `cloud`'s fakes.
 */
import * as NodeWorkerThreads from "node:worker_threads";

import * as BrowserWorkerRunner from "@effect/platform-browser/BrowserWorkerRunner";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { selectBrowserModules } from "@otterware/composition/browser";
import { PROFILES } from "@otterware/profiles";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as RpcServer from "effect/rpc/RpcServer";

import { BrowserPlatform } from "../BrowserPlatform.ts";
import { layerProtocol } from "../client.ts";
import { BrowserEnvironmentRpcGroup } from "../contracts.ts";
import { layerHost } from "../host.ts";
import type { FakeCloud } from "./fakeCloud.ts";
import { layerSuiteMemory } from "./suiteMemory.ts";

export const layerConnected = (cloud: FakeCloud) =>
  Layer.unwrap(
    Effect.sync(() => {
      const channel = new NodeWorkerThreads.MessageChannel();
      const server = RpcServer.layer(BrowserEnvironmentRpcGroup).pipe(
        Layer.provide(layerHost()(selectBrowserModules(PROFILES.otterware))),
        Layer.provide(RpcServer.layerProtocolWorkerRunner),
        Layer.provide(
          BrowserWorkerRunner.layerMessagePort(channel.port1 as unknown as MessagePort),
        ),
        Layer.provide(layerSuiteMemory),
        Layer.provide(
          Layer.mergeAll(NodeServices.layer, Layer.succeed(BrowserPlatform, cloud.platform)),
        ),
      );
      return Layer.merge(
        server,
        layerProtocol(() => channel.port2 as unknown as MessagePort),
      );
    }),
  );
