import { activeProfile } from "@otterware/profiles/active";
import { profileIconPath } from "@otterware/profiles";
// Otterware seam: build identity comes from the active app profile.
export const BRAND_ASSET_PATHS = {
  developmentIconComposerProject: profileIconPath(activeProfile, "development", "app-icon.icon"),
  developmentIosIconPng: profileIconPath(activeProfile, "development", "ios-1024.png"),
  developmentUniversalIconPng: profileIconPath(activeProfile, "development", "universal-1024.png"),

  productionIconComposerProject: profileIconPath(activeProfile, "production", "app-icon.icon"),
  productionIosIconPng: profileIconPath(activeProfile, "production", "ios-1024.png"),
  productionMacIconPng: profileIconPath(activeProfile, "production", "macos-1024.png"),
  productionLinuxIconPng: profileIconPath(activeProfile, "production", "universal-1024.png"),
  productionWindowsIconIco: profileIconPath(activeProfile, "production", "windows.ico"),
  productionWebFaviconIco: profileIconPath(activeProfile, "production", "web-favicon.ico"),
  productionWebFavicon16Png: profileIconPath(activeProfile, "production", "web-favicon-16x16.png"),
  productionWebFavicon32Png: profileIconPath(activeProfile, "production", "web-favicon-32x32.png"),
  productionWebAppleTouchIconPng: profileIconPath(
    activeProfile,
    "production",
    "web-apple-touch-180.png",
  ),
  productionWebFaviconSvg: profileIconPath(activeProfile, "production", "web-favicon.svg"),

  nightlyIconComposerProject: profileIconPath(activeProfile, "nightly", "app-icon.icon"),
  nightlyIosIconPng: profileIconPath(activeProfile, "nightly", "ios-1024.png"),
  nightlyMacIconPng: profileIconPath(activeProfile, "nightly", "macos-1024.png"),
  nightlyLinuxIconPng: profileIconPath(activeProfile, "nightly", "universal-1024.png"),
  nightlyWindowsIconIco: profileIconPath(activeProfile, "nightly", "windows.ico"),
  nightlyWebFaviconIco: profileIconPath(activeProfile, "nightly", "web-favicon.ico"),
  nightlyWebFavicon16Png: profileIconPath(activeProfile, "nightly", "web-favicon-16x16.png"),
  nightlyWebFavicon32Png: profileIconPath(activeProfile, "nightly", "web-favicon-32x32.png"),
  nightlyWebAppleTouchIconPng: profileIconPath(activeProfile, "nightly", "web-apple-touch-180.png"),
  nightlyWebFaviconSvg: profileIconPath(activeProfile, "nightly", "web-favicon.svg"),

  developmentDesktopIconPng: profileIconPath(activeProfile, "development", "macos-1024.png"),
  developmentWindowsIconIco: profileIconPath(activeProfile, "development", "windows.ico"),
  developmentWebFaviconIco: profileIconPath(activeProfile, "development", "web-favicon.ico"),
  developmentWebFavicon16Png: profileIconPath(
    activeProfile,
    "development",
    "web-favicon-16x16.png",
  ),
  developmentWebFavicon32Png: profileIconPath(
    activeProfile,
    "development",
    "web-favicon-32x32.png",
  ),
  developmentWebAppleTouchIconPng: profileIconPath(
    activeProfile,
    "development",
    "web-apple-touch-180.png",
  ),
  developmentWebFaviconSvg: profileIconPath(activeProfile, "development", "web-favicon.svg"),
} as const;

export type WebAssetBrand = "development" | "nightly" | "production";

export const WEB_ASSET_CHANNELS = ["latest", "nightly"] as const;

export type WebAssetChannel = (typeof WEB_ASSET_CHANNELS)[number];

export function resolveWebAssetBrandForChannel(channel: WebAssetChannel): WebAssetBrand {
  return channel === "nightly" ? "nightly" : "production";
}

export function resolveWebAssetBrandForPackageVersion(version: string): WebAssetBrand {
  return /^[^-+]+-(?:nightly|preview)\./.test(version) ? "nightly" : "production";
}

export interface IconOverride {
  readonly sourceRelativePath: string;
  readonly targetRelativePath: string;
}

const WEB_ICON_TARGET_FILENAMES = {
  faviconIco: "favicon.ico",
  favicon16Png: "favicon-16x16.png",
  favicon32Png: "favicon-32x32.png",
  appleTouchIconPng: "apple-touch-icon.png",
  faviconSvg: "favicon.svg",
} as const;

const WEB_ICON_SOURCE_PATHS_BY_BRAND = {
  development: {
    faviconIco: BRAND_ASSET_PATHS.developmentWebFaviconIco,
    favicon16Png: BRAND_ASSET_PATHS.developmentWebFavicon16Png,
    favicon32Png: BRAND_ASSET_PATHS.developmentWebFavicon32Png,
    appleTouchIconPng: BRAND_ASSET_PATHS.developmentWebAppleTouchIconPng,
    faviconSvg: BRAND_ASSET_PATHS.developmentWebFaviconSvg,
  },
  nightly: {
    faviconIco: BRAND_ASSET_PATHS.nightlyWebFaviconIco,
    favicon16Png: BRAND_ASSET_PATHS.nightlyWebFavicon16Png,
    favicon32Png: BRAND_ASSET_PATHS.nightlyWebFavicon32Png,
    appleTouchIconPng: BRAND_ASSET_PATHS.nightlyWebAppleTouchIconPng,
    faviconSvg: BRAND_ASSET_PATHS.nightlyWebFaviconSvg,
  },
  production: {
    faviconIco: BRAND_ASSET_PATHS.productionWebFaviconIco,
    favicon16Png: BRAND_ASSET_PATHS.productionWebFavicon16Png,
    favicon32Png: BRAND_ASSET_PATHS.productionWebFavicon32Png,
    appleTouchIconPng: BRAND_ASSET_PATHS.productionWebAppleTouchIconPng,
    faviconSvg: BRAND_ASSET_PATHS.productionWebFaviconSvg,
  },
} as const satisfies Record<WebAssetBrand, Record<keyof typeof WEB_ICON_TARGET_FILENAMES, string>>;

export function resolveWebIconOverrides(
  brand: WebAssetBrand,
  targetDirectory: string,
): ReadonlyArray<IconOverride> {
  const sourcePaths = WEB_ICON_SOURCE_PATHS_BY_BRAND[brand];
  return [
    {
      sourceRelativePath: sourcePaths.faviconIco,
      targetRelativePath: `${targetDirectory}/${WEB_ICON_TARGET_FILENAMES.faviconIco}`,
    },
    {
      sourceRelativePath: sourcePaths.favicon16Png,
      targetRelativePath: `${targetDirectory}/${WEB_ICON_TARGET_FILENAMES.favicon16Png}`,
    },
    {
      sourceRelativePath: sourcePaths.favicon32Png,
      targetRelativePath: `${targetDirectory}/${WEB_ICON_TARGET_FILENAMES.favicon32Png}`,
    },
    {
      sourceRelativePath: sourcePaths.appleTouchIconPng,
      targetRelativePath: `${targetDirectory}/${WEB_ICON_TARGET_FILENAMES.appleTouchIconPng}`,
    },
    {
      sourceRelativePath: sourcePaths.faviconSvg,
      targetRelativePath: `${targetDirectory}/${WEB_ICON_TARGET_FILENAMES.faviconSvg}`,
    },
  ];
}

export const DEVELOPMENT_ICON_OVERRIDES = resolveWebIconOverrides("development", "dist/client");

export const DEVELOPMENT_PUBLIC_ICON_OVERRIDES = resolveWebIconOverrides(
  "development",
  "apps/web/public",
);
