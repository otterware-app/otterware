import { PROFILES } from "@otterware/profiles";
import { describe, expect, it } from "vite-plus/test";

import {
  composeContracts,
  OTTERWARE_RPC_AGGREGATES,
  OTTERWARE_RPC_SUPERSET_SCOPES,
} from "./contracts.ts";

describe("composeContracts", () => {
  it("serves only the active profile's modules while the host RPCs stay", () => {
    const code = composeContracts(PROFILES.code);
    expect(code.moduleIds).toEqual([]);
    expect([...code.group.requests.keys()]).toEqual([
      "modules.list",
      "modules.setEnabled",
      "assistant.ensureProject",
    ]);

    const otterware = composeContracts(PROFILES.otterware);
    expect(otterware.moduleIds).toEqual(["home"]);
    expect([...otterware.group.requests.keys()]).toContain("home.overview");
    expect(otterware.scopes["home.overview"]).toBe("orchestration:read");
  });

  it("labels every known method for instrumentation and authorization", () => {
    for (const tag of Object.keys(OTTERWARE_RPC_SUPERSET_SCOPES)) {
      expect(OTTERWARE_RPC_AGGREGATES[tag as keyof typeof OTTERWARE_RPC_AGGREGATES]).toBe(
        tag.startsWith("home.") ? "module.home" : "host",
      );
    }
  });
});
