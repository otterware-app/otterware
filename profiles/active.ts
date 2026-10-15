/**
 * The profile this build runs as. Bundles bake it in through Vite's `define`
 * (`__OTTERWARE_PROFILE__`, set from `OTTERWARE_PROFILE` in the server, web and
 * desktop configs); unbundled code, such as a dev server or a script, reads
 * the variable directly. Nothing set means the Otterware profile.
 */
import { type AppProfile, resolveProfile } from "./index.ts";

declare const __OTTERWARE_PROFILE__: string | undefined;

function readConfiguredProfileId(): string | undefined {
  if (typeof __OTTERWARE_PROFILE__ === "string" && __OTTERWARE_PROFILE__.length > 0) {
    return __OTTERWARE_PROFILE__;
  }
  // Read through globalThis: the web and client packages compile without Node types.
  const env = (
    globalThis as { readonly process?: { readonly env?: Record<string, string | undefined> } }
  ).process?.env;
  return env?.OTTERWARE_PROFILE;
}

export const activeProfile: AppProfile = resolveProfile(readConfiguredProfileId());
