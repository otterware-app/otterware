/**
 * Preferences that follow the Otter account to every device (the relay's
 * `/v1/preferences`): app settings, views, keybindings, the renderer's UI choices (`ui`, which it
 * mirrors from localStorage), and the signatures of mailboxes whose server
 * keeps none (IMAP; Gmail keeps its own). Each section is replaced whole; the last write
 * wins.
 *
 * On connecting (and on the relay's `preferences` event) this device takes
 * the account's sections. A section the account doesn't have yet (a new
 * account, or one from before the section existed) is seeded from here.
 * Local changes are pushed when they differ from what was last synced, which
 * also keeps an applied remote section from echoing back.
 */

import type { PreferencesResponse } from "@otterware/mail-contracts/relay";

import { broadcast } from "../ipc.js";
import { readJson, writeJson } from "../json-file.js";
import { logger } from "../logger.js";
import { platform } from "../platform.js";
import { readKeybindings, writeKeybindings } from "./keybindings-store.js";
import { configureAutoSync, followMailboxArrangement } from "./mail-sync.js";
import { getOtterUser, relayRequest } from "./otter-account.js";
import { listAccounts, updateAccount } from "./account-store.js";
import { getSettings, updateSettings, type AppSettings } from "./settings-store.js";
import { listViews, writeViews } from "./views-store.js";
import type { MailView } from "../types.js";

// ── UI preferences (the renderer's, kept here so every device can have them) ─

const UI_FILE = "ui-preferences.json";
export type UiPreferences = Record<string, string>;

export async function getUiPreferences(initialize = false): Promise<UiPreferences> {
  const cached = (await readJson<UiPreferences>(UI_FILE)) ?? {};
  // A new browser has no palette yet. Fetch it before its first render instead
  // of waiting for the event stream; returning browsers keep the local fast path.
  if (
    initialize &&
    platform().relaySession === "cookie" &&
    getOtterUser() &&
    Object.keys(cached).length === 0
  ) {
    await pullPreferences().catch((err: unknown) =>
      logger.info("preferences", `Couldn't load initial appearance: ${String(err)}`),
    );
    return (await readJson<UiPreferences>(UI_FILE)) ?? cached;
  }
  return cached;
}

async function writeUiPreferences(ui: UiPreferences): Promise<void> {
  await writeJson(UI_FILE, ui);
  followMailboxArrangement(ui["mail:mailboxes"]);
  broadcast("preferences:uiChanged", ui);
}

let uiWrites: Promise<void> = Promise.resolve();

/** One at a time, so two choices made together don't lose one another. */
export function setUiPreference(key: string, value: string): Promise<void> {
  const write = uiWrites.then(async () => {
    const ui = await getUiPreferences();
    if (ui[key] === value) return;
    await writeUiPreferences({ ...ui, [key]: value });
    preferenceChanged("ui");
  });
  uiWrites = write.catch(() => {});
  return write;
}

// ── Sections ────────────────────────────────────────────────────────────────

/** App settings that follow the account (launch at login and the Dock badge stay per computer). */
import { SYNCED_SETTINGS } from "../syncedSettings.ts";

type Section = {
  /** This device's value; undefined when it has none worth sharing. */
  read(): Promise<unknown>;
  apply(value: unknown): Promise<void>;
};

const SECTIONS = {
  settings: {
    async read() {
      const settings = await getSettings();
      return Object.fromEntries(SYNCED_SETTINGS.map((key) => [key, settings[key]]));
    },
    async apply(value) {
      const patch = Object.fromEntries(
        Object.entries(value as Partial<AppSettings>).filter(([key]) =>
          (SYNCED_SETTINGS as readonly string[]).includes(key),
        ),
      );
      const settings = await updateSettings(patch);
      configureAutoSync(settings.syncIntervalSeconds);
      broadcast("settings:changed", settings);
      broadcast("translation:settingsChanged");
    },
  },
  views: {
    read: () => listViews(),
    async apply(value) {
      if (!Array.isArray(value)) return;
      await writeViews(value as MailView[]);
      broadcast("gmail:views-changed");
    },
  },
  keybindings: {
    // None saved yet: the defaults, nothing to share.
    read: async () => (await readKeybindings()).rules ?? undefined,
    async apply(value) {
      await writeKeybindings(value);
      broadcast("keybindings:updated");
    },
  },
  ui: {
    read: () => getUiPreferences(),
    async apply(value) {
      if (value && typeof value === "object") await writeUiPreferences(value as UiPreferences);
    },
  },
  // By address, lower-cased. Keeps the mailboxes this device doesn't have, so
  // it never drops another device's.
  signatures: {
    async read() {
      const signatures = syncedSignatures();
      for (const account of await listAccounts()) {
        if (account.provider !== "imap") continue;
        signatures[account.email.toLowerCase()] = account.signature ?? "";
      }
      return signatures;
    },
    async apply(value) {
      if (!value || typeof value !== "object") return;
      const signatures = value as Record<string, string>;
      let changed = false;
      for (const account of await listAccounts()) {
        const signature = signatures[account.email.toLowerCase()];
        if (account.provider !== "imap" || signature === undefined) continue;
        if ((account.signature ?? "") === signature) continue;
        await updateAccount(account.id, { signature });
        changed = true;
      }
      if (changed) broadcast("gmail:accounts-changed");
    },
  },
} satisfies Record<string, Section>;

export type SectionName = keyof typeof SECTIONS;
const SECTION_NAMES = Object.keys(SECTIONS) as SectionName[];

/** What each section was when last synced, as JSON. */
const synced = new Map<SectionName, string>();

function syncedSignatures(): Record<string, string> {
  try {
    return JSON.parse(synced.get("signatures") ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

/** The account's signature for an IMAP mailbox new to this device, as last synced. */
export function syncedSignature(email: string): string | undefined {
  return syncedSignatures()[email.toLowerCase()] || undefined;
}

// ── Sync ────────────────────────────────────────────────────────────────────

/** Takes the account's preferences, and seeds the ones it doesn't have from here. */
export async function pullPreferences(): Promise<void> {
  if (!getOtterUser()) return;
  const remote = await relayRequest<PreferencesResponse>("GET", "/v1/preferences");
  for (const name of SECTION_NAMES) {
    const value = remote.preferences[name];
    if (value === undefined) {
      preferenceChanged(name);
      continue;
    }
    const json = JSON.stringify(value);
    synced.set(name, json);
    if (JSON.stringify(await SECTIONS[name].read()) === json) continue;
    try {
      await SECTIONS[name].apply(value);
    } catch (err) {
      logger.warn("preferences", `Couldn't apply ${name}: ${String(err)}`);
    }
  }
}

const pending = new Set<SectionName>();
let pushTimer: ReturnType<typeof setTimeout> | null = null;

/** A section changed on this device: push it (debounced) if it differs from the account's. */
export function preferenceChanged(name: SectionName): void {
  if (!getOtterUser()) return;
  pending.add(name);
  pushTimer ??= setTimeout(() => void push(), 500);
}

const RETRY_MS = 30_000;

async function push(): Promise<void> {
  pushTimer = null;
  const userId = getOtterUser()?.id;
  if (!userId) return;
  const names = [...pending];
  pending.clear();
  const sending = new Map<SectionName, string>();
  const preferences: Record<string, unknown> = {};
  for (const name of names) {
    const value = await SECTIONS[name].read();
    if (value === undefined) continue;
    const json = JSON.stringify(value);
    if (synced.get(name) === json) continue;
    sending.set(name, json);
    preferences[name] = value;
  }
  if (sending.size === 0) return;
  try {
    await relayRequest("PUT", "/v1/preferences", { preferences });
    for (const [name, json] of sending) synced.set(name, json);
  } catch (err) {
    logger.info("preferences", `Couldn't save preferences, retrying: ${String(err)}`);
    for (const name of sending.keys()) pending.add(name);
    pushTimer ??= setTimeout(() => void push(), RETRY_MS);
  }
}

/** Signed out: the next account starts from what it has, and Mail never reads host agent credentials. */
export async function forgetSyncedPreferences(): Promise<void> {
  synced.clear();
  pending.clear();
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = null;
}
