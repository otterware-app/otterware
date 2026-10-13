import { PROFILES } from "@otterware/profiles";
import { moduleSettingsPath } from "@otterware/module-kit/web";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("@otterware/profiles/active", () => ({ activeProfile: PROFILES.calendar }));
vi.mock("./calendar/rpc", () => ({ CalendarEnvironmentProvider: () => null }));
vi.mock("./home/HomeWebModule", async () => {
  const { defineWebModule } = await import("@otterware/module-kit/web");
  const { HouseIcon } = await import("lucide-react");
  const { lazy } = await import("react");
  return {
    HomeWebModule: defineWebModule({
      id: "home",
      label: "Home",
      icon: HouseIcon,
      rail: { position: "start", order: 0 },
      page: lazy(async () => ({ default: () => null })),
      settings: null,
      commands: [],
      searchTerms: [],
      serverModule: "home",
      sideChat: false,
    }),
  };
});

describe("standalone Calendar registry", () => {
  it("resolves the landing route, exposes only Calendar in the rail and includes its settings and runtime", async () => {
    const { moduleRegistry } = await import("./registry");
    const { OTTERWARE_SETTINGS_SEARCH_ITEMS, isProfileSettingsPathVisible } =
      await import("./settingsRegistry");
    expect(moduleRegistry.modules.map((module) => module.id)).toEqual(["calendar"]);
    expect(moduleRegistry.forPath(PROFILES.calendar.landingRoute)?.module.id).toBe("calendar");
    expect(
      [...moduleRegistry.rail("start"), ...moduleRegistry.rail("end")].map((module) => module.id),
    ).toEqual(["calendar"]);
    expect(moduleRegistry.byId("home")).toBeNull();
    expect(moduleRegistry.byId("calendar")?.backgroundRuntime).toBeDefined();
    expect(moduleRegistry.settings.map((module) => moduleSettingsPath(module.id))).toEqual([
      "/settings/calendar",
    ]);
    expect(OTTERWARE_SETTINGS_SEARCH_ITEMS.some((item) => item.to === "/settings/calendar")).toBe(
      true,
    );
    expect(isProfileSettingsPathVisible("/settings/calendar")).toBe(true);
    expect(isProfileSettingsPathVisible("/settings/projects")).toBe(false);
    expect(PROFILES.calendar.codeVisible).toBe(false);
  });
});
