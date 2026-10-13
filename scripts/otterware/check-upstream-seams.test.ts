import * as NodeFS from "node:fs";
import { describe, expect, it } from "vite-plus/test";

import { findViolations, parseSeams, SEAMS_FILE, seamMatches } from "./check-upstream-seams.ts";

describe("check-upstream-seams", () => {
  it("matches literal paths and globs", () => {
    expect(seamMatches("apps/server/src/ws.ts", "apps/server/src/ws.ts")).toBe(true);
    expect(seamMatches("apps/server/src/ws.ts", "apps/server/src/ws.test.ts")).toBe(false);
    expect(seamMatches("**/package.json", "package.json")).toBe(true);
    expect(seamMatches("**/package.json", "apps/web/package.json")).toBe(true);
    expect(seamMatches("**/package.json", "apps/web/package.jsonc")).toBe(false);
    expect(seamMatches("**/vite.config.ts", "apps/server/vite.config.ts")).toBe(true);
    expect(seamMatches("apps/*/src/index.ts", "apps/web/src/index.ts")).toBe(true);
    expect(seamMatches("apps/*/src/index.ts", "apps/web/nested/src/index.ts")).toBe(false);
  });

  it("flags only upstream-owned files outside the list", () => {
    const seams = parseSeams("# comment\n\napps/server/src/ws.ts\n**/package.json\n");
    const upstreamOwned = new Set([
      "apps/server/src/ws.ts",
      "apps/server/src/server.ts",
      "apps/web/package.json",
    ]);
    expect(
      findViolations({
        changed: [
          "apps/server/src/ws.ts",
          "apps/server/src/server.ts",
          "apps/web/package.json",
          "packages/module-kit/src/server/index.ts",
        ],
        upstreamOwned,
        seams,
      }),
    ).toEqual(["apps/server/src/server.ts"]);
  });

  it("keeps the committed list short and parseable", () => {
    const seams = parseSeams(NodeFS.readFileSync(SEAMS_FILE, "utf8"));
    const files = seams.filter((seam) => !seam.includes("*"));
    expect(files.length).toBeLessThan(50);
    expect(new Set(seams).size).toBe(seams.length);
  });
});
