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
    for (const pkg of plan.typecheck) run("vp", ["run", "--filter", pkg, "typecheck"]);
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
    for (const pkg of plan.tests) run("vp", ["run", "--filter", pkg, "test", "--maxWorkers=2"]);
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
  if (plan.full) {
    run("python3", ["-B", ".github/scripts/stage-preview-bundle.test.py"]);
    run("node", ["--test", ".github/scripts/check-nightly-release.test.cjs"]);
  }
}
if (part === "local") {
  if (plan.jobs.test_web) run("vp", ["run", "--filter", "@t3tools/web", "test", "--maxWorkers=2"]);
  if (plan.jobs.test_server) run("vp", ["run", "--filter", "t3", "test", "--maxWorkers=2"]);
  if (plan.jobs.seams) run("node", ["scripts/otterware/check-upstream-seams.ts"]);
  if (plan.jobs.rust) {
    for (const crate of ["resource-monitor", "kde-snap-shot", "hyprland-snap-shot"]) {
      const manifest = NodePath.join("native", crate, "Cargo.toml");
      run("cargo", ["fmt", "--manifest-path", manifest, "--", "--check"]);
      run("cargo", ["test", "--locked", "--manifest-path", manifest]);
    }
  }
  if (plan.jobs.release_smoke) run("node", ["scripts/release-smoke.ts"]);
  if (plan.jobs.mobile_native_static_analysis) {
    // oxlint-disable-next-line t3code/no-global-process-runtime -- This dependency-free CLI runs outside the host Effect runtime.
    if (process.platform === "darwin") run("vp", ["run", "lint:mobile"]);
    else console.log("Native mobile static analysis requires macOS; CI will run it.");
  }
  // Desktop packaging is exercised by CI; the local loop stops at source checks.
}
if (!["local", "lint", "typecheck", "test"].includes(part))
  throw new Error(`Unknown part: ${part}`);
