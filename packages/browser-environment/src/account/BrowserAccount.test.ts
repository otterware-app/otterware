import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import * as BrowserInstallation from "../BrowserInstallation.ts";
import { BrowserPlatform } from "../BrowserPlatform.ts";
import { ACCOUNTS_URL, CLOUD_ORIGIN, makeFakeCloud } from "../test/fakeCloud.ts";
import { layerSuiteMemory } from "../test/suiteMemory.ts";
import { BrowserAccount, layer } from "./BrowserAccount.ts";

const cloud = makeFakeCloud();

const layerAccount = layer.pipe(
  Layer.provideMerge(BrowserInstallation.layer),
  Layer.provide(layerSuiteMemory),
  Layer.provide(Layer.succeed(BrowserPlatform, cloud.platform)),
  Layer.provide(NodeServices.layer),
);

const credential = (accessToken: string) => ({
  accessToken,
  accountsUrl: ACCOUNTS_URL,
  cloudOrigin: CLOUD_ORIGIN,
});

/** The `index`th channel socket, once Otter Cloud accepted it. */
const socket = (index: number) => Effect.promise(() => cloud.socket(index));

it.layer(layerAccount)("BrowserAccount", (it) => {
  it.effect("keeps one Cloud channel per sign-in and reconnects it when it drops", () =>
    Effect.gen(function* () {
      const account = yield* BrowserAccount;
      const events = yield* account.events.pipe(
        Stream.take(2),
        Stream.runCollect,
        Effect.forkScoped,
      );
      yield* Effect.yieldNow;

      yield* account.attach(credential("oauth-ada"));
      const first = yield* socket(0);
      assert.include(first.url, "wss://cloud.otterware.app/v1/cloud/channel?ticket=");
      const client = (yield* account.cloud).client;

      // A fresh token for the same account keeps the client and its channel.
      yield* account.attach(credential("oauth-ada"));
      assert.strictEqual((yield* account.cloud).client, client);
      assert.strictEqual(cloud.sockets.length, 1);

      first.push({ type: "sync.changed" });
      first.close();
      // The reconnect waits out its backoff on the test clock.
      const reconnected = yield* Effect.forkScoped(socket(1));
      for (let step = 0; step < 10 && cloud.sockets.length < 2; step += 1)
        yield* TestClock.adjust("1 second");
      const second = yield* Fiber.join(reconnected);
      second.push({ type: "connections.changed" });

      assert.deepStrictEqual(
        [...(yield* Fiber.join(events))].map((event) => event.type),
        ["sync.changed", "connections.changed"],
      );

      yield* account.detach;
      assert.strictEqual(cloud.sockets[1]!.readyState, 3);
      assert.deepStrictEqual(yield* account.state, {
        status: "signed-out",
        userId: null,
        message: null,
      });
      assert.strictEqual((yield* Effect.flip(account.cloud)).reason, "signed-out");
    }),
  );
});
