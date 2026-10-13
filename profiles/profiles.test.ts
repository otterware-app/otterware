import { describe, expect, it } from "vite-plus/test";

import { codeProfile } from "./code.ts";
import { PROFILES, profileAppIdentity, profileUpdateChannel, resolveProfile } from "./index.ts";

describe("profiles", () => {
  it("defaults to the Otterware profile and rejects unknown ids", () => {
    expect(resolveProfile(undefined).id).toBe("otterware");
    expect(resolveProfile("  ").id).toBe("otterware");
    expect(resolveProfile("code")).toBe(codeProfile);
    expect(() => resolveProfile("mial")).toThrow(/Unknown OTTERWARE_PROFILE "mial"/);
  });

  it("keeps Otter Code's identity, data home and bare update channels", () => {
    expect(profileAppIdentity(codeProfile, false)).toEqual({
      displayName: "Otter Code",
      appId: "dev.otterware.code",
      urlScheme: "ottercode",
      slug: "otter-code",
    });
    expect(profileAppIdentity(codeProfile, true).appId).toBe("dev.otterware.code.dev");
    expect(codeProfile.dataHome).toBe(".otter-code");
    expect(codeProfile.brand.npm?.launcherPackage).toBe("otter-code");
    expect(profileUpdateChannel(codeProfile, "nightly")).toBe("nightly");
    expect(profileUpdateChannel(PROFILES.mail, "nightly")).toBe("mail-nightly");
  });

  it("shares the Otter Code home between Otterware and Code, and gives standalone apps their own", () => {
    expect(PROFILES.otterware.dataHome).toBe(".otter-code");
    const homes = new Set(
      [PROFILES.mail, PROFILES.calendar, PROFILES.drive].map((p) => p.dataHome),
    );
    expect(homes.size).toBe(3);
    expect(homes.has(".otter-code")).toBe(false);
    const appIds = new Set(Object.values(PROFILES).map((profile) => profile.brand.appId));
    expect(appIds.size).toBe(5);
  });

  it("hides Code only in the standalone profiles", () => {
    expect(PROFILES.otterware.codeVisible).toBe(true);
    expect(PROFILES.code.codeVisible).toBe(true);
    for (const id of ["mail", "calendar", "drive"] as const) {
      expect(PROFILES[id].codeVisible).toBe(false);
      expect(PROFILES[id].modules).toEqual([id]);
      expect(PROFILES[id].landingRoute).toBe(`/${id}`);
    }
  });
});
