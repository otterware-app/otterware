import * as NodeAssert from "node:assert/strict";
import * as NodeTest from "node:test";
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { planAffected, readWorkspace, gitFiles } from "./affected.mjs";
import { gateFailures } from "./ci-gate.mjs";

const packages = [
  {
    name: "core",
    dir: "packages/core",
    dependencies: [],
    scripts: { typecheck: "tc", test: "test" },
  },
  {
    name: "@t3tools/web",
    dir: "apps/web",
    dependencies: ["core"],
    scripts: { typecheck: "tc", test: "test" },
  },
  {
    name: "t3",
    dir: "apps/server",
    dependencies: ["@t3tools/web"],
    scripts: { typecheck: "tc", test: "test" },
  },
  {
    name: "other",
    dir: "modules/mail/engine",
    dependencies: [],
    scripts: { typecheck: "tc", test: "test" },
  },
];
NodeTest.test("documentation skips runtime checks, including package-local docs", () => {
  const plan = planAffected(packages, ["docs/guide.md", "apps/server/README.md"]);
  NodeAssert.deepEqual(plan.affected, []);
  NodeAssert.deepEqual(
    Object.entries(plan.jobs)
      .filter(([, value]) => value)
      .map(([key]) => key),
    ["lint"],
  );
});
NodeTest.test(
  "workspace reverse dependencies are transitive and include the server's web input",
  () => {
    NodeAssert.deepEqual(planAffected(packages, ["packages/core/src/index.ts"]).affected, [
      "core",
      "@t3tools/web",
      "t3",
    ]);
    const web = planAffected(packages, ["apps/web/src/view.tsx"]);
    NodeAssert.deepEqual(web.affected, ["@t3tools/web", "t3"]);
    NodeAssert.equal(web.jobs.test_server, true);
    NodeAssert.equal(web.jobs.build, true);
    NodeAssert.equal(web.jobs.test, false);
  },
);
NodeTest.test("module changes select only that module; shared seams widen the gate", () => {
  NodeAssert.deepEqual(planAffected(packages, ["modules/mail/engine/src/index.ts"]).affected, [
    "other",
  ]);
  for (const file of [
    "scripts/otterware/affected.mjs",
    "scripts/otterware/upstream-seams.txt",
    "pnpm-lock.yaml",
    "vite.config.ts",
    "package.json",
    "profiles/code.ts",
    "packages/contracts/src/rpc.ts",
    "packages/module-kit/src/index.ts",
    ".github/workflows/ci.yml",
    "patches/effect.patch",
    "unknown/runtime.ts",
    "packages/deleted/src/index.ts",
  ])
    NodeAssert.equal(planAffected(packages, [file]).full, true, file);
});
NodeTest.test("main runs everything; seam wiring follows file existence", () => {
  NodeAssert.ok(
    Object.values(planAffected(packages, [], { all: true, seams: true }).jobs).every(Boolean),
  );
});
NodeTest.test("aggregate rejects failures, cancellations, unplanned and unexplained skips", () => {
  const jobs = { lint: true, test: false };
  const needs = {
    plan: { result: "success" },
    lint: { result: "success" },
    test: { result: "skipped" },
  };
  NodeAssert.deepEqual(gateFailures(needs, jobs), []);
  for (const result of ["failure", "cancelled", "skipped", undefined])
    NodeAssert.ok(gateFailures({ ...needs, lint: { result } }, jobs).length);
  NodeAssert.ok(gateFailures({ ...needs, plan: { result: "failure" } }, jobs).length);
  NodeAssert.ok(gateFailures({ ...needs, extra: { result: "success" } }, jobs).length);
  NodeAssert.ok(gateFailures({ ...needs, test: { result: "success" } }, jobs).length);
});
NodeTest.test(
  "workspace discovery supports module layers and exclusions; local diff includes deletes and untracked files",
  () => {
    const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "fast-loop-"));
    try {
      NodeFS.writeFileSync(
        NodePath.join(root, "pnpm-workspace.yaml"),
        "packages:\n  - modules/*/*\n  - '!modules/excluded/*'\n\ncatalog:\n",
      );
      NodeFS.mkdirSync(NodePath.join(root, "modules/mail/engine"), { recursive: true });
      NodeFS.writeFileSync(
        NodePath.join(root, "modules/mail/engine/package.json"),
        JSON.stringify({ name: "mail", scripts: { test: "test" } }),
      );
      NodeFS.mkdirSync(NodePath.join(root, "modules/excluded/engine"), { recursive: true });
      NodeFS.writeFileSync(
        NodePath.join(root, "modules/excluded/engine/package.json"),
        JSON.stringify({ name: "excluded" }),
      );
      NodeAssert.deepEqual(
        readWorkspace(root).map((p) => p.name),
        ["mail"],
      );
      const git = (...args) =>
        NodeChildProcess.execFileSync("git", args, { cwd: root, stdio: "pipe" });
      git("init");
      git("add", ".");
      git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "base");
      NodeFS.renameSync(
        NodePath.join(root, "modules/mail/engine/package.json"),
        NodePath.join(root, "new.json"),
      );
      NodeAssert.deepEqual(gitFiles(root, "HEAD", true), [
        "modules/mail/engine/package.json",
        "new.json",
      ]);
    } finally {
      NodeFS.rmSync(root, { recursive: true, force: true });
    }
  },
);
