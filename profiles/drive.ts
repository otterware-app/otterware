import { defineProfile, OTTER_CODE_ICONS, OTTERWARE_RELEASE_REPOSITORY } from "./profile.ts";

export const driveProfile = defineProfile({
  id: "drive",
  modules: ["drive"],
  codeVisible: false,
  brand: {
    productName: "Otter Drive",
    devProductName: "Otter Drive (Dev)",
    appId: "dev.otterware.drive",
    devAppId: "dev.otterware.drive.dev",
    urlScheme: "otterdrive",
    devUrlScheme: "otterdrive-dev",
    slug: "otter-drive",
    devSlug: "otter-drive-dev",
    artifactName: "Otter-Drive-${version}-${arch}.${ext}",
    icons: OTTER_CODE_ICONS,
    npm: null,
  },
  dataHome: ".otter-drive",
  updateFeed: { repository: OTTERWARE_RELEASE_REPOSITORY, channelPrefix: "drive" },
  landingRoute: "/drive",
});
