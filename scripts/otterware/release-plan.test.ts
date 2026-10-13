import { describe, expect, it } from "vite-plus/test";
import { PROFILE_IDS } from "../../profiles/index.ts";
import { releaseFeed } from "../../profiles/release-feed.ts";
import { releaseBranch, releaseProfiles } from "./release-plan.ts";

describe("profile releases", () => {
  it("builds the profile catalog by default and preserves each app identity", () => {
    expect(releaseProfiles("").map((profile) => profile.id)).toEqual(PROFILE_IDS);
    expect(releaseProfiles("code,mail").map((profile) => profile.brand.appId)).toEqual([
      "dev.otterware.code",
      "dev.otterware.mail",
    ]);
  });
  it("rejects unknown or duplicated profiles before building", () => {
    expect(() => releaseProfiles("code,code")).toThrow("Duplicate");
    expect(() => releaseProfiles("unknown")).toThrow("Unknown");
  });
  it("isolates branch feeds and keeps main on the base profile channel", () => {
    expect(releaseBranch("main")).toBe("");
    expect(releaseBranch("feature/mail")).toBe("feature-mail");
    expect(() => releaseBranch("!!!")).toThrow("Invalid");
    expect(releaseFeed("code-test")).toEqual({
      provider: "generic",
      url: "https://github.com/otterware-app/otterware/releases/download/channel-code-test/",
      channel: "latest",
    });
    expect(() => releaseFeed("../mail")).toThrow("Invalid");
  });
});
