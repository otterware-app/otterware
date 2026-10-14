import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

export function readWorkspace(root) {
  const yaml = NodeFS.readFileSync(NodePath.join(root, "pnpm-workspace.yaml"), "utf8");
  const section = yaml.match(/^packages:\s*\n((?:[ \t]+.*\n|\n)*)/m)?.[1];
  if (!section) throw new Error("Cannot resolve workspace packages");
  const patterns = section.split("\n").flatMap((line) => {
    if (!line.trim() || line.trim().startsWith("#")) return [];
    const match = line.match(/^\s+-\s+(["']?)([^"'#]+)\1\s*(?:#.*)?$/);
    if (!match) throw new Error(`Unsupported workspace pattern: ${line}`);
    return [match[2].trim()];
  });
  const excluded = patterns
    .filter((p) => p.startsWith("!"))
    .map((p) => `${p.slice(1)}/package.json`);
  const manifests = new Set(
    patterns
      .filter((p) => !p.startsWith("!"))
      .flatMap((p) =>
        NodeFS.globSync(`${p}/package.json`, {
          cwd: root,
          exclude: ["**/node_modules/**", ...excluded],
        }),
      ),
  );
  const packages = [...manifests].sort().map((file) => {
    const manifest = JSON.parse(NodeFS.readFileSync(NodePath.join(root, file), "utf8"));
    if (!manifest.name) throw new Error(`Unnamed package: ${file}`);
    return {
      name: manifest.name,
      dir: NodePath.dirname(file).replaceAll("\\", "/"),
      scripts: manifest.scripts ?? {},
      dependencies: Object.keys({
        ...manifest.dependencies,
        ...manifest.devDependencies,
        ...manifest.optionalDependencies,
        ...manifest.peerDependencies,
      }),
    };
  });
  if (!packages.length || new Set(packages.map((p) => p.name)).size !== packages.length)
    throw new Error("Empty or ambiguous workspace graph");
  return packages;
}

const isDocumentation = (file) =>
  /\.(md|mdx)$/.test(file) && !file.startsWith("scripts/") && !file.startsWith(".github/");
const isGlobal = (file) =>
  file.startsWith(".github/") ||
  file.startsWith("scripts/otterware/") ||
  file.startsWith("patches/") ||
  file.startsWith("profiles/") ||
  file.startsWith("oxlint-plugin-t3code/") ||
  file.startsWith("packages/contracts/") ||
  file.startsWith("packages/module-kit/") ||
  (!file.includes("/") && !isDocumentation(file));

export function planAffected(packages, files, { all = false, seams = false } = {}) {
  let full = all || files.some(isGlobal);
  const affected = new Set();
  for (const file of files) {
    if (isDocumentation(file)) continue;
    const owner = packages
      .filter((p) => file.startsWith(`${p.dir}/`))
      .sort((a, b) => b.dir.length - a.dir.length)[0];
    if (owner) affected.add(owner.name);
    // Non-workspace runtime/build inputs must not silently disappear from the gate.
    else if (!file.startsWith("native/")) full = true;
  }
  if (full) packages.forEach((p) => affected.add(p.name));
  let previousSize;
  do {
    previousSize = affected.size;
    for (const pkg of packages)
      if (pkg.dependencies.some((dep) => affected.has(dep))) affected.add(pkg.name);
  } while (previousSize !== affected.size);
  const selected = packages.filter((p) => affected.has(p.name));
  const typecheck = selected.filter((p) => p.scripts.typecheck).map((p) => p.name);
  const tests = selected.filter((p) => p.scripts.test).map((p) => p.name);
  // The desktop's Vite task consumes the server and web builds, outside its manifest graph.
  const build =
    full ||
    ["@t3tools/desktop", "t3", "@t3tools/web", "@t3tools/scripts"].some((p) => affected.has(p)) ||
    files.some((f) => f.startsWith("assets/") || f.startsWith("native/"));
  const otherTests = tests.filter((p) => p !== "t3" && p !== "@t3tools/web");
  const jobs = {
    lint: files.length > 0 || all,
    typecheck: typecheck.length > 0,
    build,
    test: otherTests.length > 0 || full,
    test_web: tests.includes("@t3tools/web"),
    test_server: tests.includes("t3"),
    "transfer-report": tests.includes("t3"),
    rust: full || files.some((f) => f.startsWith("native/")),
    mobile_native_static_analysis:
      full ||
      files.some(
        (f) =>
          /^apps\/mobile\/.*\.(swift|kt|kts)$/.test(f) ||
          /^apps\/mobile\/(\.swiftlint\.yml|detekt\.yml|\.editorconfig|Brewfile)$/.test(f) ||
          f === "scripts/mobile-native-static-check.ts",
      ),
    release_smoke: full || affected.has("@t3tools/scripts") || affected.has("@t3tools/desktop"),
    seams,
  };
  return { full, files, affected: selected.map((p) => p.name), typecheck, tests: otherTests, jobs };
}

export function gitFiles(root, base, workingTree) {
  const git = (...args) =>
    NodeChildProcess.execFileSync("git", args, { cwd: root, encoding: "utf8" })
      .split("\0")
      .filter(Boolean);
  const files = git("diff", "--name-only", "--no-renames", "-z", `${base}...HEAD`);
  if (workingTree)
    files.push(
      ...git("diff", "--name-only", "--no-renames", "-z", "HEAD"),
      ...git("ls-files", "--others", "--exclude-standard", "-z"),
    );
  return [...new Set(files)].sort();
}

export function createPlan(root, { base = "origin/main", all = false, workingTree = true } = {}) {
  // A missing base or malformed graph fails the planning job; it cannot produce a green skip.
  return planAffected(readWorkspace(root), gitFiles(root, base, workingTree), {
    all,
    seams: NodeFS.existsSync(NodePath.join(root, "scripts/otterware/check-upstream-seams.ts")),
  });
}

if (
  process.argv[1] &&
  NodePath.resolve(process.argv[1]) === NodeURL.fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  const baseIndex = args.indexOf("--base");
  const plan = createPlan(process.cwd(), {
    base: baseIndex < 0 ? "origin/main" : args[baseIndex + 1],
    all: args.includes("--all"),
    workingTree: !args.includes("--committed"),
  });
  NodeFS.writeFileSync(".otterware-ci-plan.json", `${JSON.stringify(plan, null, 2)}\n`);
  if (process.env.GITHUB_OUTPUT) {
    NodeFS.appendFileSync(
      process.env.GITHUB_OUTPUT,
      Object.entries(plan.jobs)
        .map(([key, value]) => `${key}=${value}\n`)
        .join(""),
    );
    NodeFS.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `jobs=${JSON.stringify(plan.jobs)}\naffected=${JSON.stringify(plan.affected)}\n`,
    );
  }
  const summary =
    `Full gate: ${plan.full}\nAffected packages: ${plan.affected.join(", ") || "none"}\n` +
    Object.entries(plan.jobs)
      .map(([job, planned]) => `${job}: ${planned ? "run" : "skip"}`)
      .join("\n");
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY)
    NodeFS.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n\`\`\`text\n${summary}\n\`\`\`\n`);
}
