import { activeProfile } from "@otterware/profiles/active";

const HOST_ACTIONS = new Set([
  "action:settings",
  "action:usage",
  "action:change-theme",
  "action:change-appearance",
  "action:theme-editor",
  "action:restart-agent-session",
  "action:copy-prompt-link",
  "action:copy-prompt-link-with-context",
  "action:copy-thread-reference",
]);

/** Keep host agents, appearance and modules available when coding surfaces are hidden. */
export function profilePaletteItems<T extends { readonly value: string }>(
  items: ReadonlyArray<T>,
  codeVisible = activeProfile.codeVisible,
): Array<T> {
  return codeVisible
    ? [...items]
    : items.filter(
        (item) => HOST_ACTIONS.has(item.value) || item.value.startsWith("action:module:"),
      );
}
export function codeSurfaceItems<T>(
  items: ReadonlyArray<T>,
  codeVisible = activeProfile.codeVisible,
): ReadonlyArray<T> {
  return codeVisible ? items : [];
}
