// @effect-diagnostics nodeBuiltinImport:off - Reads the committed seam list; no Effect runtime.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeChildProcess from "node:child_process";
import { describe, expect, it } from "vite-plus/test";

import {
  main,
  filterSyncChanges,
  findViolations,
  parseSeams,
  SEAMS_FILE,
  seamMatches,
} from "./check-upstream-seams.ts";

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

  it("limits the sync exception to exact source/overlay tree entries at the approved base", () => {
    const source = "100644 blob " + "a".repeat(40);
    const overlay = "100644 blob " + "b".repeat(40);
    const changed = [
      "import.ts",
      "resolved.ts",
      "deleted.ts",
      "edited.ts",
      "chmod.ts",
      "unstaged.ts",
    ];
    const input = {
      changed,
      active: true,
      current: new Map([
        ["import.ts", source],
        ["resolved.ts", overlay],
        ["edited.ts", source],
        ["chmod.ts", "100755 blob " + "b".repeat(40)],
        ["unstaged.ts", overlay],
      ]),
      incoming: new Map([
        ["import.ts", source],
        ["resolved.ts", source],
        ["edited.ts", overlay],
        ["chmod.ts", source],
        ["unstaged.ts", source],
      ]),
      overlay: {
        "resolved.ts": overlay,
        "deleted.ts": null,
        "edited.ts": overlay,
        "chmod.ts": overlay,
        "unstaged.ts": overlay,
      },
      unstaged: new Set(["unstaged.ts"]),
    };
    expect(filterSyncChanges(input)).toEqual(["edited.ts", "chmod.ts", "unstaged.ts"]);
    // Even the identical frozen overlay grants no permission on the next PR.
    expect(filterSyncChanges({ ...input, active: false })).toEqual(changed);
  });

  it("checks a protected sync against a real Git index and expires the exception after merging", () => {
    const cwd = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "otter-seams-"));
    const git = (...args: Array<string>) =>
      NodeChildProcess.execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
    const commit = () =>
      git(
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.test",
        "commit",
        "-qm",
        "fixture",
      );
    const write = (content: string) => NodeFS.writeFileSync(NodePath.join(cwd, "host.ts"), content);
    try {
      git("init", "-q", "-b", "main");
      write("original");
      git("add", ".");
      commit();
      const base = git("rev-parse", "HEAD");
      write("upstream");
      git("add", ".");
      commit();
      const upstream = git("rev-parse", "HEAD");
      git("checkout", "-qb", "integration", base);
      write("resolved overlay");
      git("add", ".");
      const overlay = "100644 blob " + git("hash-object", "host.ts");
      NodeFS.mkdirSync(NodePath.join(cwd, "scripts/otterware"), { recursive: true });
      NodeFS.writeFileSync(
        NodePath.join(cwd, "scripts/otterware/source-baseline.json"),
        JSON.stringify({
          upstream,
          preservedUpstreamBase: base,
          protectedSync: {
            baseMain: base,
            preparedCandidate: upstream,
            overlay: { "host.ts": overlay },
          },
        }),
      );
      git("add", ".");
      expect(main(["--base", base], cwd)).toBe(0);
      write("unreviewed unstaged edit");
      expect(main(["--base", base], cwd)).toBe(1);
      write("resolved overlay");
      git("add", ".");
      commit();
      write("next feature edit");
      git("add", ".");
      expect(main(["--base", "HEAD"], cwd)).toBe(1);
    } finally {
      NodeFS.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("keeps the committed list short and parseable", () => {
    const seams = parseSeams(NodeFS.readFileSync(SEAMS_FILE, "utf8"));
    const files = seams.filter((seam) => !seam.includes("*"));
    // The list is a rebase-cost budget: every entry is an upstream file each sync may have to
    // re-merge by hand. Mechanical entries fold into globs; one-off edits are not listed.
    expect(files.length).toBeLessThan(40);
    expect(new Set(seams).size).toBe(seams.length);
  });
});
