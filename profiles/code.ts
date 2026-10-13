import { defineProfile, OTTER_CODE_ICONS, OTTERWARE_RELEASE_REPOSITORY } from "./profile.ts";

/** Otter Code as it ships today: no modules, bare update channels, the `otter-code` CLI. */
export const codeProfile = defineProfile({
  id: "code",
  modules: [],
  codeVisible: true,
  brand: {
    productName: "Otter Code",
    devProductName: "Otter Code (Dev)",
    appId: "dev.otterware.code",
    devAppId: "dev.otterware.code.dev",
    urlScheme: "ottercode",
    devUrlScheme: "ottercode-dev",
    slug: "otter-code",
    devSlug: "otter-code-dev",
    artifactName: "Otter-Code-${version}-${arch}.${ext}",
    icons: OTTER_CODE_ICONS,
    npm: {
      launcherPackage: "otter-code",
      platformPackageScope: "@otterware",
      platformPackagePrefix: "otter-code-",
    },
  },
  dataHome: ".otter-code",
  updateFeed: { repository: OTTERWARE_RELEASE_REPOSITORY, channelPrefix: null },
  landingRoute: "/",
});
