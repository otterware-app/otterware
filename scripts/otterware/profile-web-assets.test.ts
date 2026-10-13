import { describe, expect, it } from "vite-plus/test";
import { PROFILES } from "@otterware/profiles";
import { profileWebManifest } from "./profile-web-assets.ts";

describe("profile web install metadata", () => {
  it("uses each profile's product and landing route while preserving installed-app identity and icons", () => {
    const base = { id: "/", icons: [{ src: "/favicon.ico" }], display: "standalone" };
    for (const profile of Object.values(PROFILES)) {
      expect(profileWebManifest(base, profile)).toEqual({
        ...base,
        name: profile.brand.productName,
        short_name: profile.brand.productName,
        start_url: profile.landingRoute,
      });
    }
  });
});
