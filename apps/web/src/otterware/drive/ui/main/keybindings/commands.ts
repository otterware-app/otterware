import { appAtomRegistry } from "~/rpc/atomRegistry";
import { shellKeybindingsAtom } from "~/otterware/shellKeybindings";
import { formatShortcutLabel, effectiveShortcutsForCommand } from "~/keybindings";
export type KeybindingCommand =
  | "commandPalette.toggle"
  | "sidebar.toggle"
  | "folder.new"
  | "search.focus"
  | "document.upload"
  | "list.next"
  | "list.previous"
  | "document.close"
  | `folder.jump.${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;

export function shortcutLabel(command: KeybindingCommand): string | undefined {
  const shortcut = effectiveShortcutsForCommand(
    appAtomRegistry.get(shellKeybindingsAtom),
    `drive.${command}`,
  )[0];
  return shortcut ? formatShortcutLabel(shortcut) : undefined;
}
