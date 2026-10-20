/**
 * Fails when a change touches an upstream-owned file that is not an approved
 * seam (ADR 0013). Ownership follows source-baseline.json when present, otherwise
 * the `upstream-base` tree. The authorized protected sync records exact source/overlay
 * content against one base main; those exceptions do not apply to subsequent PRs.
 * Upstream-owned means present in the source tree;
 * the seams are listed in `upstream-seams.txt`. Compares the working tree and
 * the commits since the merge base with `--base` (default `origin/main`)
 * against `--upstream` (default the recorded source baseline, otherwise
 * `upstream-base` / `origin/upstream-base`). CI fetches the pinned source object if absent.
 *
 *   node scripts/otterware/check-upstream-seams.ts [--base <ref>] [--upstream <ref>]
 */
// @effect-diagnostics nodeBuiltinImport:off globalConsole:off - CI check script; no Effect runtime.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

const here = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
export const SEAMS_FILE = NodePath.join(here, "upstream-seams.txt");
const BASELINE_PATH = "scripts/otterware/source-baseline.json";

interface SourceBaseline {
  readonly upstream: string;
  readonly preservedUpstreamBase: string;
  readonly protectedSync: {
    readonly baseMain: string;
    readonly preparedCandidate: string;
    readonly overlay: Readonly<Record<string, string | null>>;
  };
}

/** A sync exception records exact tree entries, never a path permission for later PRs. */
export function filterSyncChanges(input: {
  readonly changed: ReadonlyArray<string>;
  readonly active: boolean;
  readonly current: ReadonlyMap<string, string>;
  readonly incoming: ReadonlyMap<string, string>;
  readonly overlay: Readonly<Record<string, string | null>>;
  readonly unstaged: ReadonlySet<string>;
}): ReadonlyArray<string> {
  if (!input.active) return input.changed;
  return input.changed.filter((file) => {
    if (input.unstaged.has(file)) return true;
    const entry = input.current.get(file) ?? null;
    if (entry === (input.incoming.get(file) ?? null)) return false;
    return !Object.hasOwn(input.overlay, file) || input.overlay[file] !== entry;
  });
}

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

const GIT_OPTIONS = { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 } as const;

function git(args: ReadonlyArray<string>, cwd: string): string {
  const result = NodeChildProcess.spawnSync("git", args, { cwd, ...GIT_OPTIONS });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout;
}

const gitQuietly = (args: ReadonlyArray<string>, cwd: string): boolean =>
  NodeChildProcess.spawnSync("git", args, { cwd, stdio: "ignore" }).status === 0;

const refExists = (ref: string, cwd: string) =>
  gitQuietly(["rev-parse", "--verify", "--quiet", ref], cwd);

/** Fetches a remote branch with enough history for a merge base; no-op when it exists. */
function fetchBranch(name: string, cwd: string): void {
  gitQuietly(
    [
      "fetch",
      "--quiet",
      "--no-tags",
      "--deepen=2000",
      "origin",
      `+refs/heads/${name}:refs/remotes/origin/${name}`,
    ],
    cwd,
  );
}

/**
 * The first candidate that resolves. A CI checkout is shallow and has no
 * remote branches, so a missing `origin/<name>` is fetched before giving up.
 */
function resolveRef(candidates: ReadonlyArray<string>, cwd: string): string {
  for (const candidate of candidates) if (refExists(candidate, cwd)) return candidate;
  for (const candidate of candidates) {
    const name = candidate.replace(/^origin\//, "");
    if (name === candidate) continue;
    fetchBranch(name, cwd);
    if (refExists(candidate, cwd)) return candidate;
  }
  throw new Error(`None of ${candidates.join(", ")} resolves; fetch the ref first.`);
}

function mergeBase(base: string, cwd: string): string {
  if (gitQuietly(["merge-base", base, "HEAD"], cwd))
    return git(["merge-base", base, "HEAD"], cwd).trim();
  // A shallow PR checkout: deepen until the branch point is reachable. HEAD is often a
  // detached merge commit whose own history deepening origin's refs does not reach, so
  // fall back to the full history.
  gitQuietly(["fetch", "--quiet", "--no-tags", "--deepen=2000", "origin"], cwd);
  if (gitQuietly(["merge-base", base, "HEAD"], cwd))
    return git(["merge-base", base, "HEAD"], cwd).trim();
  gitQuietly(["fetch", "--quiet", "--no-tags", "--unshallow", "origin"], cwd);
  return git(["merge-base", base, "HEAD"], cwd).trim();
}

function readFlag(argv: ReadonlyArray<string>, name: string): string | undefined {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

function readBaseline(cwd: string): SourceBaseline | null {
  const path = NodePath.join(cwd, BASELINE_PATH);
  if (!NodeFS.existsSync(path)) return null;
  const value: SourceBaseline = JSON.parse(NodeFS.readFileSync(path, "utf8"));
  for (const sha of [
    value.upstream,
    value.preservedUpstreamBase,
    value.protectedSync?.baseMain,
    value.protectedSync?.preparedCandidate,
  ]) {
    if (typeof sha !== "string" || !/^[a-f0-9]{40}$/.test(sha)) {
      throw new Error("Source baseline must contain exact commit SHAs.");
    }
  }
  for (const entry of Object.values(value.protectedSync.overlay)) {
    if (
      entry !== null &&
      !/^100(644|755) blob [a-f0-9]{40}$/.test(entry) &&
      !/^120000 blob [a-f0-9]{40}$/.test(entry)
    ) {
      throw new Error("Sync overlay must contain exact Git tree entries or null deletions.");
    }
  }
  return value;
}

function ensureUpstream(sha: string, cwd: string): void {
  if (refExists(`${sha}^{commit}`, cwd)) return;
  // A squash merge does not retain the imported source ancestry. Fetch the immutable
  // object from its authoritative repository, never a movable checkout or arbitrary URL.
  git(["fetch", "--quiet", "--no-tags", "https://github.com/pingdotgg/t3code.git", sha], cwd);
}

function tree(ref: string, cwd: string): Map<string, string> {
  return new Map(
    git(["ls-tree", "-r", "-z", ref], cwd)
      .split("\0")
      .filter(Boolean)
      .map((line) => {
        const index = line.indexOf("\t");
        return [line.slice(index + 1), line.slice(0, index)];
      }),
  );
}

export function main(argv: ReadonlyArray<string>, cwd = process.cwd()): number {
  const base = readFlag(argv, "--base") ?? resolveRef(["origin/main", "main"], cwd);
  const baseline = readBaseline(cwd);
  const upstream =
    readFlag(argv, "--upstream") ??
    baseline?.upstream ??
    resolveRef(["upstream-base", "origin/upstream-base"], cwd);
  if (baseline) ensureUpstream(upstream, cwd);
  const branchPoint = mergeBase(base, cwd);
  const activeSync = baseline !== null && branchPoint === baseline.protectedSync.baseMain;
  if (
    activeSync &&
    !gitQuietly(["merge-base", "--is-ancestor", baseline.preservedUpstreamBase, upstream], cwd)
  ) {
    throw new Error(
      "Integrated upstream does not descend from the preserved reconstruction baseline.",
    );
  }
  const changed = new Set<string>();
  for (const line of [
    ...git(["diff", "--name-only", "-z", branchPoint], cwd).split("\0"),
    ...git(["ls-files", "--others", "--exclude-standard", "-z"], cwd).split("\0"),
  ]) {
    if (line.length > 0) changed.add(line);
  }
  const upstreamOwned = new Set(
    git(["ls-tree", "-r", "--name-only", upstream], cwd)
      .split("\n")
      .filter((line) => line.length > 0),
  );
  // Keep ownership of upstream files removed in the imported revision as well.
  if (baseline) {
    for (const file of tree(baseline.preservedUpstreamBase, cwd).keys()) upstreamOwned.add(file);
  }
  const seams = parseSeams(NodeFS.readFileSync(SEAMS_FILE, "utf8"));
  const allChanged = [...changed].toSorted();
  const current = activeSync
    ? tree(git(["write-tree"], cwd).trim(), cwd)
    : new Map<string, string>();
  const incoming = activeSync ? tree(upstream, cwd) : new Map<string, string>();
  const unstaged = new Set([
    ...git(["diff", "--name-only", "-z"], cwd).split("\0"),
    ...git(["ls-files", "--others", "--exclude-standard", "-z"], cwd).split("\0"),
  ]);
  if (argv.includes("--record-sync-overlay")) {
    if (!activeSync || !baseline)
      throw new Error("Overlay recording requires the exact approved base main.");
    if (!gitQuietly(["diff", "--quiet"], cwd))
      throw new Error("Stage the integration before recording its overlay.");
    const overlay = Object.fromEntries(
      findViolations({ changed: allChanged, upstreamOwned, seams })
        .filter((file) => (current.get(file) ?? null) !== (incoming.get(file) ?? null))
        .map((file) => [file, current.get(file) ?? null]),
    );
    NodeFS.writeFileSync(
      NodePath.join(cwd, BASELINE_PATH),
      JSON.stringify(
        { ...baseline, protectedSync: { ...baseline.protectedSync, overlay } },
        null,
        2,
      ) + "\n",
    );
    console.log(
      `Recorded ${Object.keys(overlay).length} exact overlay entries for the one-time protected sync.`,
    );
    return 0;
  }
  const pending = filterSyncChanges({
    changed: allChanged,
    active: activeSync,
    current,
    incoming,
    overlay: baseline?.protectedSync.overlay ?? {},
    unstaged,
  });
  const violations = findViolations({ changed: pending, upstreamOwned, seams });
  if (activeSync)
    console.log(
      `Protected sync: ${allChanged.length - pending.length} verified source/overlay entries; exceptions expire after this base main.`,
    );
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
