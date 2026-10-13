// @effect-diagnostics nodeBuiltinImport:off - Actions preflight runs before workspace dependencies are installed.
import * as NodeFS from "node:fs";
import { PROFILE_IDS, PROFILES, isProfileId } from "../../profiles/index.ts";

/** Resolve the requested profiles once; every build and publisher uses this matrix. */
export function releaseProfiles(input: string) {
  const ids = input.trim() ? input.split(/[,\s]+/).filter(Boolean) : [...PROFILE_IDS];
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate release profile");
  return ids.map((id) => {
    if (!isProfileId(id)) throw new Error(`Unknown release profile: ${id}`);
    return PROFILES[id];
  });
}

export function releaseBranch(input: string) {
  if (!input.trim() || input === "main") return "";
  const branch = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!branch || branch.length > 64) throw new Error("Invalid release branch/channel");
  return branch;
}

if (process.argv[1]?.endsWith("release-plan.ts")) {
  const profiles = releaseProfiles(process.env.RELEASE_PROFILES ?? "");
  const branch = releaseBranch(process.env.RELEASE_BRANCH ?? "");
  const core = JSON.parse(NodeFS.readFileSync("apps/desktop/package.json", "utf8")).version.split(
    /[-+]/,
  )[0];
  const [major, minor, patch] = core.split(".").map(Number);
  const date = process.env.RELEASE_DATE;
  if (!date || !/^\d{8}$/.test(date)) throw new Error("Missing UTC release date");
  const run = process.env.GITHUB_RUN_NUMBER;
  if (!run || !/^\d+$/.test(run)) throw new Error("Missing release run number");
  // Mail already shipped 0.13.10: every migration build must be newer than incumbent installs.
  const nextCore = major === 0 && minor < 14 ? "0.14.0" : `${major}.${minor}.${patch + 1}`;
  const version = `${nextCore}-otterware.${date}.${run}`;
  const matrix = profiles.map((profile) => ({
    profile: profile.id,
    productName: profile.brand.productName,
    channel: `${profile.id}${branch ? `-${branch}` : ""}`,
    tag: `otterware-${profile.id}-v${version}`,
  }));
  const output = `matrix=${JSON.stringify({ include: matrix })}\nversion=${version}\n`;
  NodeFS.appendFileSync(process.env.GITHUB_OUTPUT ?? "/dev/stdout", output);
}
