import { EnvironmentId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { describe, expect, it } from "vite-plus/test";

import type { ConnectionCatalogEntry } from "../connection/catalog.ts";
import { BearerConnectionTarget, PrimaryConnectionTarget } from "../connection/model.ts";
import { selectModuleTarget } from "./browserEnvironment.ts";

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
