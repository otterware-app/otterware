// @effect-diagnostics nodeBuiltinImport:off -- Fixture manifests model the bundle resolver boundary.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { describe, expect, it } from "vite-plus/test";
import {
  assertServerBundleRegions,
  assertServerExecutableImports,
  assertServerRuntimeDependencies,
  missingServerBundleDependencies,
} from "./server-runtime-dependencies.ts";

describe("server runtime dependencies", () => {
  it("rejects file-backed SEA imports even when the regular server declares them", () => {
    expect(() => assertServerExecutableImports(['import { z } from "zod";'])).toThrow(/zod/);
    expect(() =>
      assertServerExecutableImports(['const load = () => import("future-module");']),
    ).toThrow(/future-module/);
    expect(() =>
      assertServerExecutableImports([
        'import { createRequire } from "node:module"; const load = createRequire(import.meta.url); load("zod");',
      ]),
    ).not.toThrow();
  });
  it("rejects unsafe host inlining but permits self-contained embedded workers", () => {
    const region = (name: string) => `//#region ../../node_modules/${name}/index.js\n`;
    expect(() => assertServerBundleRegions([region("effect") + region("zod")])).toThrow(/zod/);
    expect(() => assertServerBundleRegions([region("effect") + region("node-pty")])).toThrow(
      /node-pty/,
    );
    expect(() => assertServerBundleRegions(["const x = 1;"])).toThrow(/no module regions/);
    expect(() => assertServerBundleRegions([region("yaml")])).toThrow(/externalized effect/);
    expect(() =>
      assertServerBundleRegions([
        region("effect") + `const worker = ${JSON.stringify(region("zod"))};`,
      ]),
    ).not.toThrow();
  });
  it("catches an external introduced by workspace contracts before building", () => {
    const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "server-externals-"));
    const write = (path: string, value: unknown) => {
      NodeFS.mkdirSync(NodePath.dirname(NodePath.join(root, path)), { recursive: true });
      NodeFS.writeFileSync(NodePath.join(root, path), JSON.stringify(value));
    };
    try {
      NodeFS.writeFileSync(
        NodePath.join(root, "pnpm-workspace.yaml"),
        "packages:\n  - apps/*\n  - modules/*/*\n",
      );
      write("package.json", { name: "root" });
      write("apps/server/package.json", {
        name: "server",
        dependencies: { contracts: "workspace:*" },
      });
      write("modules/mail/contracts/package.json", {
        name: "contracts",
        dependencies: { zod: "4.6.5", effect: "catalog:" },
      });
      expect(() => assertServerRuntimeDependencies(root)).toThrow(/zod.*modules\/mail\/contracts/);
      write("apps/server/package.json", {
        name: "server",
        dependencies: { contracts: "workspace:*", zod: "4.6.5" },
      });
      expect(() => assertServerRuntimeDependencies(root)).not.toThrow();
    } finally {
      NodeFS.rmSync(root, { recursive: true, force: true });
    }
  });
  it("checks emitted imports including subpaths while ignoring local chunks, builtins and source examples", () => {
    const source = `import { z } from "zod/v4"; import "@connectrpc/connect";
      const lazy = () => import("unexpected-package/subpath");
      import fs from "node:fs"; import "./local.mjs";
      const example = 'import "example-only";';
      const load = createRequire(import.meta.url);
      load("native-helper"); __require("bufferutil"); __require("utf-8-validate");`;
    expect(missingServerBundleDependencies([source], { zod: "4.6.5" })).toEqual([
      "@connectrpc/connect",
      "native-helper",
      "unexpected-package",
    ]);
  });
});
