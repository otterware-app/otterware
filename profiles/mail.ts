import { defineProfile, profileArtwork, OTTERWARE_RELEASE_REPOSITORY } from "./profile.ts";

export const mailProfile = defineProfile({
  id: "mail",
  modules: ["mail"],
  codeVisible: false,
  brand: {
    productName: "Otter Mail",
    devProductName: "Otter Mail (Dev)",
    appId: "dev.otterware.mail",
    devAppId: "dev.otterware.mail.dev",
    urlScheme: "ottermail",
    devUrlScheme: "ottermail-dev",
    slug: "otter-mail",
    devSlug: "otter-mail-dev",
    artifactName: "Otter-Mail-${version}-${arch}.${ext}",
    icons: profileArtwork("mail"),
    npm: null,
  },
  dataHome: ".otter-mail",
  clientDataHome: ".otter-mail",
  updateFeed: { repository: OTTERWARE_RELEASE_REPOSITORY, channelPrefix: "mail" },
  landingRoute: "/mail",
});
