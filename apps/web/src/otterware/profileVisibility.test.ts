import { describe, expect, it } from "vite-plus/test";
import { codeSurfaceItems, profilePaletteItems } from "./profileVisibility";

describe("standalone module navigation", () => {
  it("hides coding commands and project search while keeping host controls and module navigation", () => {
    const items = [
      "action:new-project",
      "action:open-file-picker",
      "action:settings",
      "action:restart-agent-session",
      "action:module:mail",
      "action:change-theme",
    ].map((value) => ({ value }));
    expect(profilePaletteItems(items, false).map((item) => item.value)).toEqual([
      "action:settings",
      "action:restart-agent-session",
      "action:module:mail",
      "action:change-theme",
    ]);
    expect(codeSurfaceItems(items, false)).toEqual([]);
    expect(profilePaletteItems(items, true)).toEqual(items);
  });
});
