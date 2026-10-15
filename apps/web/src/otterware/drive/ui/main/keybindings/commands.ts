import { appAtomRegistry } from "~/rpc/atomRegistry";
import { shellKeybindingsAtom } from "~/otterware/shellKeybindings";
import { formatShortcutLabel, effectiveShortcutsForCommand } from "~/keybindings";
export type KeybindingCommand =
  | "commandPalette.toggle"
  | "list.sort"
  | "document.actions"
  | "document.versions"
  | "document.share"
  | "document.copyLink"
  | "document.copyPrompt"
  | "document.download"
  | "document.move"
  | "document.archive"
  | "document.delete"
  | "document.expand"
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
    command === "commandPalette.toggle" ? command : `drive.${command}`,
  )[0];
  return shortcut ? formatShortcutLabel(shortcut) : undefined;
}
