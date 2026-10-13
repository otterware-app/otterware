import { DEFAULT_CALENDAR_SHORTCUTS } from "@otterware/calendar-contracts";
import { expect, it } from "vite-plus/test";
import { shortcutAction } from "./shortcuts.ts";
const key = (value: string, extra = {}) => ({
  key: value,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...extra,
});
it("honors configured modifiers, disabled bindings and reserved browser combinations", () => {
  expect(shortcutAction(key("w"), DEFAULT_CALENDAR_SHORTCUTS)).toBe("week");
  expect(shortcutAction(key("w", { ctrlKey: true }), DEFAULT_CALENDAR_SHORTCUTS)).toBeNull();
  const customized = { ...DEFAULT_CALENDAR_SHORTCUTS, week: "Mod+Shift+2", create: "" };
  expect(shortcutAction(key("2", { metaKey: true, shiftKey: true }), customized)).toBe("week");
  expect(shortcutAction(key("2", { ctrlKey: true, shiftKey: true }), customized)).toBe("week");
  expect(shortcutAction(key("2", { metaKey: true }), customized)).toBeNull();
  expect(shortcutAction(key("c"), customized)).toBeNull();
});
