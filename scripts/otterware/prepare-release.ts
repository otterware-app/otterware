// @effect-diagnostics nodeBuiltinImport:off - Actions preflight runs before workspace dependencies are installed.
import * as NodeFS from "node:fs";
import { resolveProfile } from "../../profiles/index.ts";
import { releaseBranch } from "./release-plan.ts";

const profile = resolveProfile(process.env.OTTERWARE_PROFILE);
const channel = process.env.OTTERWARE_RELEASE_CHANNEL ?? "";
if (
  releaseBranch(channel) !== channel ||
  !(channel === profile.id || channel.startsWith(`${profile.id}-`))
) {
  throw new Error(`Invalid release channel for ${profile.id}: ${channel}`);
}
NodeFS.writeFileSync(
  "profiles/release-channel.ts",
  `export const RELEASE_CHANNEL: string | undefined = ${JSON.stringify(channel)};\n`,
);
