import { createElement, useSyncExternalStore } from "react";
import type { ResolvedKeybindingsConfig } from "@t3tools/contracts";
import { formatShortcut, type Shortcut, type WhenNode } from "./keys";
import { type KeybindingCommand, type KeybindingRule, KEYBINDING_COMMANDS } from "./commands";
import { mailCommandId } from "../../../mailCommands";
export type ResolvedKeybinding = {
  rule: KeybindingRule;
  shortcut: Shortcut;
  whenAst?: WhenNode | undefined;
};
let state = { rules: [] as KeybindingRule[], resolved: [] as ResolvedKeybinding[], loaded: false };
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
/** Read-only view of the host keybindings for Mail's contextual tooltips and editor keys. */
export function setHostKeybindings(config: ResolvedKeybindingsConfig) {
  const resolved: ResolvedKeybinding[] = [];
  for (const binding of config) {
    for (const command of KEYBINDING_COMMANDS.filter((id) => mailCommandId(id) === binding.command))
      resolved.push({
        rule: { key: "", command },
        shortcut: [binding.shortcut],
        ...(binding.whenAst ? { whenAst: binding.whenAst } : {}),
      });
  }
  state = { rules: resolved.map((row) => row.rule), resolved, loaded: true };
  for (const listener of listeners) listener();
}
export const getKeybindings = () => state;
export const useKeybindingsState = () => useSyncExternalStore(subscribe, getKeybindings);
export function shortcutLabelFor(
  resolved: ResolvedKeybinding[],
  command: KeybindingCommand,
): string | null {
  const binding = resolved.find((row) => row.rule.command === command);
  return binding ? formatShortcut(binding.shortcut) : null;
}
export function useShortcutLabel(command: KeybindingCommand | undefined): string | undefined {
  const { resolved } = useKeybindingsState();
  return command ? (shortcutLabelFor(resolved, command) ?? undefined) : undefined;
}
export function ShortcutText({
  command,
  suffix,
  className,
}: {
  command: KeybindingCommand;
  suffix?: string | undefined;
  className?: string | undefined;
}) {
  const label = useShortcutLabel(command);
  return label ? createElement("span", { className }, suffix ? `${label} ${suffix}` : label) : null;
}
