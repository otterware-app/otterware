import {
  parseKeybindingShortcut,
  matchesKeybindingShortcut,
  isMacPlatform as isMac,
} from "@t3tools/shared/keybindings";
import { formatShortcutLabel, matchesWhenClause } from "~/keybindings";
import type { KeybindingShortcut, KeybindingWhenNode } from "@t3tools/contracts";
export type KeyStroke = KeybindingShortcut;
export type Shortcut = KeyStroke[];
export type WhenContext = Record<string, boolean>;
export type WhenNode = KeybindingWhenNode;
export const isMacPlatform = typeof navigator === "undefined" || isMac(navigator.platform);
export const modKeyName = isMacPlatform ? "⌘" : "Ctrl";
export const isModClick = (event: { metaKey: boolean; ctrlKey: boolean }) =>
  isMacPlatform ? event.metaKey : event.ctrlKey;
export const formatShortcut = (shortcut: Shortcut) =>
  shortcut.map((stroke) => formatShortcutLabel(stroke)).join(" then ");
export const strokeTokens = (stroke: KeyStroke) => [formatShortcutLabel(stroke)];
export const shortcutText = (text: string) => {
  const stroke = parseKeybindingShortcut(text);
  return stroke ? formatShortcutLabel(stroke) : text;
};
export const evaluateWhen = (node: WhenNode | undefined, context: WhenContext) =>
  matchesWhenClause(node, {
    terminalFocus: false,
    terminalOpen: false,
    previewFocus: false,
    previewOpen: false,
    isWeb: true,
    isDesktop: false,
    ...context,
  });
export const matchesStroke = (event: KeyboardEvent, stroke: KeyStroke) =>
  matchesKeybindingShortcut(event, stroke, navigator.platform);
