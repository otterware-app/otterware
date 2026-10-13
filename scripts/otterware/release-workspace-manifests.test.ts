// @effect-diagnostics nodeBuiltinImport:off -- Temporary filesystem fixtures test a Node release script.
import { describe, expect, it } from "vite-plus/test";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { collectWorkspaceManifestPaths } from "./release-workspace-manifests.ts";

describe("release workspace fixture", () => {
  it("follows new modules transitively, handles cycles, and excludes unrelated packages", () => {
    const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "otterware-release-"));
    const write = (path: string, name: string, dependencies: Record<string, string> = {}) => {
      NodeFS.mkdirSync(NodePath.dirname(NodePath.join(root, path)), { recursive: true });
      NodeFS.writeFileSync(NodePath.join(root, path), JSON.stringify({ name, dependencies }));
    };
    try {
      NodeFS.writeFileSync(
        NodePath.join(root, "pnpm-workspace.yaml"),
        "packages:\n  - apps/*\n  - packages/*\n  - modules/*/*\n  - profiles\n",
      );
      write("package.json", "root");
      write("apps/server/package.json", "server", { composition: "workspace:*" });
      write("packages/composition/package.json", "composition", {
        calendar: "workspace:*",
        profiles: "workspace:*",
      });
      write("profiles/package.json", "profiles");
      write("modules/calendar/engine/package.json", "calendar", { kit: "workspace:*" });
      write("packages/kit/package.json", "kit", { composition: "workspace:*" });
      write("packages/unrelated/package.json", "unrelated");
      expect(
        collectWorkspaceManifestPaths(root, ["package.json", "apps/server/package.json"]),
      ).toEqual([
        "apps/server/package.json",
        "modules/calendar/engine/package.json",
        "package.json",
        "packages/composition/package.json",
        "packages/kit/package.json",
        "profiles/package.json",
      ]);
    } finally {
      NodeFS.rmSync(root, { recursive: true, force: true });
    }
  });
});
