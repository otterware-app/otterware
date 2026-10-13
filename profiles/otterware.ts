import { defineProfile, OTTER_CODE_ICONS, OTTERWARE_RELEASE_REPOSITORY } from "./profile.ts";

/** Every module, Code shown, on the Otter Code data home (ADR 0012). */
export const otterwareProfile = defineProfile({
  id: "otterware",
  modules: ["home", "mail", "calendar", "drive"],
  codeVisible: true,
  brand: {
    productName: "Otterware",
    devProductName: "Otterware (Dev)",
    appId: "dev.otterware.suite",
    devAppId: "dev.otterware.suite.dev",
    urlScheme: "otterware",
    devUrlScheme: "otterware-dev",
    slug: "otterware",
    devSlug: "otterware-dev",
    artifactName: "Otterware-${version}-${arch}.${ext}",
    icons: OTTER_CODE_ICONS,
    npm: null,
  },
  dataHome: ".otter-code",
  clientDataHome: ".otterware",
  updateFeed: { repository: OTTERWARE_RELEASE_REPOSITORY, channelPrefix: "otterware" },
  landingRoute: "/home",
});
