import { calendarProfile } from "./calendar.ts";
import { codeProfile } from "./code.ts";
import { driveProfile } from "./drive.ts";
import { mailProfile } from "./mail.ts";
import { otterwareProfile } from "./otterware.ts";
import { type AppProfile, PROFILE_IDS, type ProfileId } from "./profile.ts";

export type {
  AppProfile,
  ModuleId,
  ProfileBrand,
  ProfileId,
  ProfileUpdateFeed,
} from "./profile.ts";
export { MODULE_IDS, OTTERWARE_RELEASE_REPOSITORY, PROFILE_IDS } from "./profile.ts";

export const PROFILES: { readonly [Id in ProfileId]: AppProfile & { readonly id: Id } } = {
  otterware: otterwareProfile,
  code: codeProfile,
  mail: mailProfile,
  calendar: calendarProfile,
  drive: driveProfile,
};

/** The default where nothing chose a profile: dev servers and local builds. */
export const DEFAULT_PROFILE_ID: ProfileId = "otterware";

export const isProfileId = (value: string): value is ProfileId =>
  (PROFILE_IDS as ReadonlyArray<string>).includes(value);

/** Resolves `OTTERWARE_PROFILE`; an unknown value is a build misconfiguration, not a fallback. */
export function resolveProfile(id: string | undefined): AppProfile {
  const trimmed = id?.trim();
  if (trimmed === undefined || trimmed.length === 0) return PROFILES[DEFAULT_PROFILE_ID];
  if (!isProfileId(trimmed)) {
    throw new Error(
      `Unknown OTTERWARE_PROFILE "${trimmed}". Expected one of: ${PROFILE_IDS.join(", ")}.`,
    );
  }
  return PROFILES[trimmed];
}

/** The desktop app's identity for one profile, by build kind. */
export function profileAppIdentity(profile: AppProfile, isDevelopment: boolean) {
  const { brand } = profile;
  return isDevelopment
    ? {
        displayName: brand.devProductName,
        appId: brand.devAppId,
        urlScheme: brand.devUrlScheme,
        slug: brand.devSlug,
      }
    : {
        displayName: brand.productName,
        appId: brand.appId,
        urlScheme: brand.urlScheme,
        slug: brand.slug,
      };
}

/** `nightly` / `latest` for Otter Code; `<prefix>-nightly` / `<prefix>-latest` elsewhere. */
export function profileUpdateChannel(profile: AppProfile, channel: "latest" | "nightly"): string {
  const prefix = profile.updateFeed.channelPrefix;
  return prefix === null ? channel : `${prefix}-${channel}`;
}

/** Channel artwork follows the exported brand kit's filename convention. */
export function profileIconPath(
  profile: AppProfile,
  channel: "production" | "nightly" | "development",
  filename: string,
): string {
  const icons = profile.brand.icons;
  if (filename === "app-icon.icon") return `${icons[channel]}/${filename}`;
  const suffix =
    icons[channel] === icons.production ? "" : channel === "development" ? "-dev" : "-nightly";
  const prefix =
    channel === "development" && icons.developmentFilePrefix
      ? icons.developmentFilePrefix
      : `${icons.filePrefix}${suffix}`;
  return `${icons[channel]}/${prefix}-${filename}`;
}
