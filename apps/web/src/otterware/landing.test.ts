// @vitest-environment jsdom
import { type AppProfile, PROFILES } from "@otterware/profiles";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

let profile: AppProfile = PROFILES.calendar;
vi.mock("@otterware/profiles/active", () => ({
  get activeProfile() {
    return profile;
  },
}));

afterEach(() => {
  vi.resetModules();
  window.history.replaceState(null, "", "/");
});

describe("profile landing", () => {
  it("keeps standalone Calendar at its landing route on returning from settings", async () => {
    profile = PROFILES.calendar;
    window.history.replaceState(null, "", "/");
    const { consumeProfileLanding } = await import("./landing");
    expect(consumeProfileLanding()).toBe("/calendar");
    expect(consumeProfileLanding()).toBe("/calendar");
  });

  it("returns to Calendar after opening a desktop event deep link", async () => {
    profile = PROFILES.calendar;
    window.history.replaceState(null, "", "/#/calendar?event=e1");
    const { consumeProfileLanding } = await import("./landing");
    // This is only called on the root route, leaving the initial event deep link untouched.
    expect(consumeProfileLanding()).toBe("/calendar");
  });

  it("lets combined Otterware use the Code root after its first landing", async () => {
    profile = PROFILES.otterware;
    window.history.replaceState(null, "", "/");
    const { consumeProfileLanding } = await import("./landing");
    expect(consumeProfileLanding()).toBe("/home");
    expect(consumeProfileLanding()).toBeNull();
  });

  it("keeps combined-app desktop deep links instead of redirecting to Home", async () => {
    profile = PROFILES.otterware;
    window.history.replaceState(null, "", "/#/calendar?event=e1");
    const { consumeProfileLanding } = await import("./landing");
    expect(consumeProfileLanding()).toBeNull();
  });
});
