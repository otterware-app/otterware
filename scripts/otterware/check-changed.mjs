import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { createPlan } from "./affected.mjs";

export function run(command, args, cwd = process.cwd()) {
  console.log(`> ${command} ${args.join(" ")}`);
  const result = NodeChildProcess.spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status ?? result.signal})`);
}

/** Runs one heavy command in a shared machine slot (scripts/otterware/heavy.sh). */
function heavy(command, args, cwd = process.cwd()) {
  run("bash", [NodePath.resolve("scripts/otterware/heavy.sh"), command, ...args], cwd);
}

/** The workspace packages that directly own the changed files (not their dependents). */
function ownedPackages(files) {
  const manifests = NodeChildProcess.execFileSync("git", ["ls-files", "*package.json"], {
    encoding: "utf8",
  })
    .split("\n")
    .filter((f) => f && !f.includes("node_modules") && !f.startsWith(".repos/"));
  const packages = manifests.flatMap((manifest) => {
    const json = JSON.parse(NodeFS.readFileSync(manifest, "utf8"));
    if (!json.name) return [];
    const dir = NodePath.dirname(manifest);
    return [{ name: json.name, dir, typecheck: Boolean(json.scripts?.typecheck) }];
  });
  const owners = new Map();
  for (const file of files) {
    const owner = packages
      .filter((p) => p.dir !== "." && file.startsWith(`${p.dir}/`))
      .sort((a, b) => b.dir.length - a.dir.length)[0];
    if (owner) owners.set(owner.name, owner);
  }
  return [...owners.values()];
}

/** Changed test files plus the test file next to each changed source file, relative to the package. */
function focusedTests(owner, files) {
  const tests = new Set();
  for (const file of files) {
    if (!file.startsWith(`${owner.dir}/`) || !NodeFS.existsSync(file)) continue;
    if (/\.test\.[cm]?[jt]sx?$/.test(file)) tests.add(file);
    else
      for (const ext of [".test.ts", ".test.tsx"]) {
        const sibling = file.replace(/\.[cm]?[jt]sx?$/, ext);
        if (sibling !== file && NodeFS.existsSync(sibling)) tests.add(sibling);
      }
  }
  return [...tests].map((file) => NodePath.relative(owner.dir, file));
}

const args = process.argv.slice(2);
const baseIndex = args.indexOf("--base");
const partIndex = args.indexOf("--part");
const part = partIndex < 0 ? "local" : args[partIndex + 1];
const plan =
  part === "local"
    ? createPlan(process.cwd(), { base: baseIndex < 0 ? "origin/main" : args[baseIndex + 1] })
    : JSON.parse(NodeFS.readFileSync(".otterware-ci-plan.json", "utf8"));
console.log(`Affected: ${plan.affected.join(", ") || "none"}${plan.full ? " (full gate)" : ""}`);

if (part === "lint" || part === "local") {
  const assets = NodeChildProcess.execFileSync("git", ["ls-files", ".github/pr-assets"], {
    encoding: "utf8",
  });
  if (assets.trim()) throw new Error("PR evidence must be uploaded to GitHub, not committed");
  const existing = plan.files.filter((f) => NodeFS.existsSync(f) && NodeFS.statSync(f).isFile());
  if (existing.length)
    run("vp", ["fmt", "--check", "--no-error-on-unmatched-pattern", ...existing]);
  const lintable = existing.filter((f) => /\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/.test(f));
  if (lintable.length) run("vp", ["lint", "--report-unused-disable-directives", ...lintable]);
  // Repo-wide dependency/export analysis belongs on main, not a docs or feature PR.
  if (process.env.GITHUB_EVENT_NAME === "push") run("vp", ["run", "knip:check"]);
}
if (part === "typecheck" || part === "local") {
  if (part === "local") {
    for (const owner of ownedPackages(plan.files).filter((o) => o.typecheck))
      heavy("vp", ["run", "--filter", owner.name, "typecheck"]);
  } else if (plan.typecheck.length) {
    run("vp", [
      "run",
      "--parallel",
      "--concurrency-limit",
      "2",
      ...plan.typecheck.flatMap((pkg) => ["--filter", pkg]),
      "typecheck",
    ]);
  }
}
if (part === "test" || part === "local") {
  if (plan.affected.includes("@t3tools/scripts"))
    run("node", ["--test", "scripts/otterware/fast-loop.node-test.mjs"]);
  if (part === "local") {
    for (const owner of ownedPackages(plan.files)) {
      const tests = focusedTests(owner, plan.files);
      if (tests.length) heavy("vp", ["test", "run", "--maxWorkers=2", ...tests], owner.dir);
    }
  } else if (plan.tests.length) {
    run("vp", [
      "run",
      "--parallel",
      "--concurrency-limit",
      "4",
      ...plan.tests.flatMap((pkg) => ["--filter", pkg]),
      "test",
      "--maxWorkers=2",
    ]);
  }
  if (plan.full && part !== "local") {
    run("python3", ["-B", ".github/scripts/stage-preview-bundle.test.py"]);
    run("node", ["--test", ".github/scripts/check-nightly-release.test.cjs"]);
  }
}
if (part === "local") {
  console.log(
    "Local checks cover the packages and tests you changed. CI runs dependents, full suites, " +
      "seams, Rust, release smoke and desktop builds.",
  );
}
if (!["local", "lint", "typecheck", "test"].includes(part))
  throw new Error(`Unknown part: ${part}`);
