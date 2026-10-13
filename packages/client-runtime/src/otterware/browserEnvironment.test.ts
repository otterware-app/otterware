import { assert, it as effectIt } from "@effect/vitest";
import { EnvironmentId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { describe, expect, it } from "vite-plus/test";

import type { ConnectionCatalogEntry } from "../connection/catalog.ts";
import { BearerConnectionTarget, PrimaryConnectionTarget } from "../connection/model.ts";
import {
  BrowserEnvironment,
  type EnvironmentLock,
  layer,
  selectModuleTarget,
} from "./browserEnvironment.ts";

const remote = EnvironmentId.make("remote");
const primary = EnvironmentId.make("primary");

const bearer = (enabled = true): ConnectionCatalogEntry => ({
  target: new BearerConnectionTarget({ environmentId: remote, label: "Remote", connectionId: "c" }),
  profile: Option.none(),
  enabled,
});
const served: ConnectionCatalogEntry = {
  target: new PrimaryConnectionTarget({
    environmentId: primary,
    label: "This computer",
    httpBaseUrl: "http://localhost:3773",
    wsBaseUrl: "ws://localhost:3773",
  }),
  profile: Option.none(),
  enabled: true,
};

describe("selectModuleTarget", () => {
  it("waits for the saved connections, then starts on this browser without one", () => {
    expect(selectModuleTarget({ isReady: false, entries: new Map() })).toEqual({ _tag: "pending" });
    expect(selectModuleTarget({ isReady: true, entries: new Map() })).toEqual({ _tag: "browser" });
    // A switched-off environment is not a target.
    expect(
      selectModuleTarget({ isReady: true, entries: new Map([[remote, bearer(false)]]) }),
    ).toEqual({ _tag: "browser" });
  });

  it("moves to a real environment once one is added, preferring the one serving the page", () => {
    expect(selectModuleTarget({ isReady: true, entries: new Map([[remote, bearer()]]) })).toEqual({
      _tag: "environment",
      environmentId: remote,
    });
    expect(
      selectModuleTarget({
        isReady: true,
        entries: new Map([
          [remote, bearer()],
          [primary, served],
        ]),
      }),
    ).toEqual({ _tag: "environment", environmentId: primary });
  });
});

effectIt.effect("a second tab waits for the environment instead of starting a worker", () =>
  Effect.gen(function* () {
    let spawned = 0;
    let closeOtherTab!: () => void;
    const otherTabClosed = new Promise<void>((resolve) => (closeOtherTab = resolve));
    // Another tab holds the environment until it closes.
    const lock: EnvironmentLock = (waiting) => {
      waiting();
      return otherTabClosed.then(() => () => {});
    };
    const context = yield* Layer.build(
      layer(() => {
        spawned += 1;
        // A port nobody answers: the test only needs to see whether the tab spawns.
        return new MessageChannel().port1;
      }, lock),
    );
    const environment = Context.get(context, BrowserEnvironment);
    assert.strictEqual(yield* SubscriptionRef.get(environment.status), "idle");

    yield* Effect.forkScoped(environment.connection);
    yield* Effect.yieldNow;
    assert.strictEqual(yield* SubscriptionRef.get(environment.status), "elsewhere");
    assert.strictEqual(spawned, 0);

    // When the other tab lets go, this one takes over.
    closeOtherTab();
    const next = yield* SubscriptionRef.changes(environment.status).pipe(
      Stream.filter((status) => status !== "elsewhere"),
      Stream.runHead,
    );
    assert.deepStrictEqual(next, Option.some("starting"));
  }).pipe(Effect.scoped),
);
