import type { CalendarShortcuts } from "@otterware/calendar-contracts";

/** Mod means Command on macOS and Control elsewhere; blank bindings are disabled. */
export function shortcutAction(
  event: Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey">,
  bindings: CalendarShortcuts,
): keyof CalendarShortcuts | null {
  for (const [action, binding] of Object.entries(bindings)) {
    const parts = binding
      .toLowerCase()
      .split("+")
      .map((part) => part.trim());
    const key = parts.pop();
    if (!key || key !== event.key.toLowerCase()) continue;
    const modifiers = new Set(parts);
    if (parts.some((part) => !["mod", "ctrl", "meta", "alt", "shift"].includes(part))) continue;
    if (
      modifiers.has("mod")
        ? !(event.metaKey || event.ctrlKey)
        : event.metaKey !== modifiers.has("meta") || event.ctrlKey !== modifiers.has("ctrl")
    )
      continue;
    if (event.altKey !== modifiers.has("alt") || event.shiftKey !== modifiers.has("shift"))
      continue;
    return action as keyof CalendarShortcuts;
  }
  return null;
}
