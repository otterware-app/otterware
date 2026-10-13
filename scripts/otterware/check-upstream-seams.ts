/**
 * Fails when a change touches an upstream-owned file that is not an approved
 * seam (ADR 0013). Upstream-owned means present in the `upstream-base` tree;
 * the seams are listed in `upstream-seams.txt`. Compares the working tree and
 * the commits since the merge base with `--base` (default `origin/main`)
 * against `--upstream` (default `upstream-base`, falling back to
 * `origin/upstream-base`).
 *
 *   node scripts/otterware/check-upstream-seams.ts [--base <ref>] [--upstream <ref>]
 */
// @effect-diagnostics nodeBuiltinImport:off - CI check script; no Effect runtime.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

const here = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
export const SEAMS_FILE = NodePath.join(here, "upstream-seams.txt");

export function parseSeams(text: string): ReadonlyArray<string> {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

/** `**` crosses directories, `*` stays within one; everything else is literal. */
export function seamMatches(pattern: string, file: string): boolean {
  if (!pattern.includes("*")) return pattern === file;
  const escaped = pattern
    .split("**/")
    .map((part) =>
      part
        .split("*")
        .map((literal) => literal.replaceAll(/[.+?^${}()|[\]\\]/g, "\\$&"))
        .join("[^/]*"),
    )
    .join("(?:.*/)?");
  return new RegExp(`^${escaped}$`).test(file);
}

export function findViolations(input: {
  readonly changed: ReadonlyArray<string>;
  readonly upstreamOwned: ReadonlySet<string>;
  readonly seams: ReadonlyArray<string>;
}): ReadonlyArray<string> {
  return input.changed.filter(
    (file) => input.upstreamOwned.has(file) && !input.seams.some((seam) => seamMatches(seam, file)),
  );
}

function git(args: ReadonlyArray<string>, cwd: string): string {
  const result = NodeChildProcess.spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout;
}

function resolveRef(candidates: ReadonlyArray<string>, cwd: string): string {
  for (const candidate of candidates) {
    const result = NodeChildProcess.spawnSync(
      "git",
      ["rev-parse", "--verify", "--quiet", candidate],
      {
        cwd,
        encoding: "utf8",
      },
    );
    if (result.status === 0) return candidate;
  }
  throw new Error(`None of ${candidates.join(", ")} resolves; fetch the ref first.`);
}

function readFlag(argv: ReadonlyArray<string>, name: string): string | undefined {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

export function main(argv: ReadonlyArray<string>, cwd = process.cwd()): number {
  const base = readFlag(argv, "--base") ?? resolveRef(["origin/main", "main"], cwd);
  const upstream =
    readFlag(argv, "--upstream") ?? resolveRef(["upstream-base", "origin/upstream-base"], cwd);
  const mergeBase = git(["merge-base", base, "HEAD"], cwd).trim();
  const changed = new Set<string>();
  for (const line of git(["diff", "--name-only", mergeBase], cwd).split("\n")) {
    if (line.trim().length > 0) changed.add(line.trim());
  }
  const upstreamOwned = new Set(
    git(["ls-tree", "-r", "--name-only", upstream], cwd)
      .split("\n")
      .filter((line) => line.length > 0),
  );
  const seams = parseSeams(NodeFS.readFileSync(SEAMS_FILE, "utf8"));
  const violations = findViolations({ changed: [...changed].toSorted(), upstreamOwned, seams });
  if (violations.length === 0) {
    console.log(`Upstream seams: ${changed.size} changed file(s), none outside the list.`);
    return 0;
  }
  console.error(
    [
      "These upstream-owned files are not approved seams (scripts/otterware/upstream-seams.txt):",
      ...violations.map((file) => `  ${file}`),
      "Move the change into an Otter-owned folder, or extend the list and say why in the PR.",
    ].join("\n"),
  );
  return 1;
}

if (
  process.argv[1] &&
  NodePath.resolve(process.argv[1]) === NodeURL.fileURLToPath(import.meta.url)
) {
  process.exit(main(process.argv.slice(2)));
}
