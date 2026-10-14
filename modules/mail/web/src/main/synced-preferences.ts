import { mailStorage } from "../host/storage";
import { mailBridge, mailHost, isMailHost } from "../host/bridge";
/**
 * UI choices that follow the Otter account to every device. They're kept in
 * localStorage (read synchronously, and shared by this app's windows) and
 * mirrored to the backend, which syncs them with the account (core's
 * services/preferences.ts, section `ui`). Changes from elsewhere land here as
 * `storage` events, which the modules owning these keys already listen to.
 */

import type { ThemeSource } from "@otterware/mail-contracts";

const THEME_SOURCE = "otter:theme-source";

const SYNCED_KEYS = [
  THEME_SOURCE,
  // Before the picks: apply() goes in order, so a theme made elsewhere exists here before it's worn.
  "otter:themes:v1",
  "otter:theme:light",
  "otter:theme:dark",
  "otter:contrast",
  "otter:glass-opacity",
  "otter:interface-font-size",
  "otter:reading-width",
  "otter:message-list-style",
  "otter:group-messages-by-day",
  "otter:dim-read-messages",
  "otter:mail-layout",
  "otter:open-messages-with-arrows",
  "otter:mark-read-delay",
  "gmail:panel-animation-duration",
  "gmail:advance-direction",
  // The agent's, under their old names: other devices sync these keys.
  "assistant:favorite-models",
  "assistant:hidden-models",
  "assistant:follow-up-behavior",
  "mail:mailboxes",
  "gmail:rail-unread-dots",
] as const;

export type SyncedKey = (typeof SYNCED_KEYS)[number];

type UiPreferences = Partial<Record<string, string>>;

/** Keys set since startup: the startup snapshot, answered later, mustn't undo them. */
const byEnvironment = new Map<
  string,
  { settled: Set<string>; initialPreferences?: Promise<void> }
>();
function preferences() {
  const id = mailHost().environmentId;
  let state = byEnvironment.get(id);
  if (!state) {
    state = { settled: new Set() };
    byEnvironment.set(id, state);
  }
  return state;
}

/** Stores a UI choice here and with the account. */
export function setSyncedPreference(key: SyncedKey, value: string): void {
  preferences().settled.add(key);
  mailStorage.setItem(key, value);
  void mailBridge
    .invoke("preferences:setUi", { key, value })
    .catch((error) => console.warn("Could not sync Mail preferences", error));
}

function apply(ui: UiPreferences, skip: ReadonlySet<string> = new Set()): void {
  for (const key of SYNCED_KEYS) {
    const value = ui[key];
    if (value === undefined || skip.has(key)) continue;
    preferences().settled.add(key);
    if (value === mailStorage.getItem(key)) continue;
    mailStorage.setItem(key, value);
    if (key === THEME_SOURCE) void mailBridge.nativeTheme.setThemeSource(value as ThemeSource);
    window.dispatchEvent(new StorageEvent("storage", { key, newValue: value }));
  }
}

/** The browser awaits this before mounting, so its first render uses its saved palette. */
export function loadSyncedPreferences(initialize = false): Promise<void> {
  const state = preferences();
  const host = mailHost();
  return (state.initialPreferences ??= mailBridge
    .invoke<UiPreferences>("preferences:getUi", { initialize })
    .then((ui) => {
      if (!isMailHost(host)) {
        state.initialPreferences = undefined;
        return;
      }
      const newer = new Set(state.settled);
      for (const key of SYNCED_KEYS) {
        const here = mailStorage.getItem(key);
        if (ui[key] === undefined && here !== null && !newer.has(key))
          setSyncedPreference(key, here);
      }
      apply(ui, newer);
    })
    .catch((error) => {
      state.initialPreferences = undefined;
      throw error;
    }));
}

/** Takes the account's UI choices, gives it the ones it lacks, and follows its changes. */
export function startSyncedPreferences(): () => void {
  void loadSyncedPreferences().catch((err) => console.warn("Couldn't load UI preferences", err));
  return mailBridge.on("preferences:uiChanged", (ui) => apply(ui as UiPreferences));
}
