import { defineProfile, OTTER_CODE_ICONS, OTTERWARE_RELEASE_REPOSITORY } from "./profile.ts";

export const calendarProfile = defineProfile({
  id: "calendar",
  modules: ["calendar"],
  codeVisible: false,
  brand: {
    productName: "Otter Calendar",
    devProductName: "Otter Calendar (Dev)",
    appId: "dev.otterware.calendar",
    devAppId: "dev.otterware.calendar.dev",
    urlScheme: "ottercalendar",
    devUrlScheme: "ottercalendar-dev",
    slug: "otter-calendar",
    devSlug: "otter-calendar-dev",
    artifactName: "Otter-Calendar-${version}-${arch}.${ext}",
    icons: OTTER_CODE_ICONS,
    npm: null,
  },
  dataHome: ".otter-calendar",
  updateFeed: { repository: OTTERWARE_RELEASE_REPOSITORY, channelPrefix: "calendar" },
  landingRoute: "/calendar",
});
