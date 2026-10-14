import { mailStorage } from "../host/storage";
/** Mail-specific reading preferences, synced with the account. */

/** Mail-specific reading preferences, synced with the account. */
/** Mail-specific reading preferences, synced with the account. */
/** Mail-specific reading preferences, synced with the account. */
/** Mail-specific reading preferences, synced with the account. */
/** Mail-specific reading preferences, synced with the account. */
/** Mail-specific reading preferences, synced with the account. */
/** Mail-specific reading preferences, synced with the account. */
import { useSyncExternalStore } from "react";
import { setSyncedPreference, type SyncedKey } from "./synced-preferences";

export type InterfaceSetting = Readonly<{
  key: SyncedKey;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
}>;

export type InterfaceToggle = Readonly<{
  key: SyncedKey;
  defaultValue: boolean;
}>;

export const GROUP_MESSAGES_BY_DAY: InterfaceToggle = {
  key: "otter:group-messages-by-day",
  defaultValue: true,
};

export const DIM_READ_MESSAGES: InterfaceToggle = {
  key: "otter:dim-read-messages",
  defaultValue: true,
};

export const OPEN_MESSAGES_WITH_ARROWS: InterfaceToggle = {
  key: "otter:open-messages-with-arrows",
  defaultValue: false,
};

const TOGGLES = [GROUP_MESSAGES_BY_DAY, DIM_READ_MESSAGES, OPEN_MESSAGES_WITH_ARROWS];

/** How long an email opened by keyboard navigation stays visible before being read. */
export const MARK_READ_DELAY: InterfaceSetting = {
  key: "otter:mark-read-delay",
  min: 0,
  max: 5000,
  step: 250,
  defaultValue: 2000,
};

const SETTINGS = [MARK_READ_DELAY];
const CHANGE_EVENT = "otter:interface-settings-change";

/** How wide an open thread grows on a large window: its max-width. */
export const READING_WIDTHS = {
  normal: { label: "Normal", maxWidth: "48rem" },
  wide: { label: "Wide", maxWidth: "64rem" },
  full: { label: "Full width", maxWidth: "none" },
} as const;
export type ReadingWidth = keyof typeof READING_WIDTHS;
const DEFAULT_READING_WIDTH: ReadingWidth = "full";
const READING_WIDTH_KEY = "otter:reading-width";

export const MESSAGE_LIST_STYLES = {
  classic: { label: "Classic", description: "A compact, quiet list." },
  dividers: { label: "With dividers", description: "A compact list with full-width separators." },
} as const;
export type MessageListStyle = keyof typeof MESSAGE_LIST_STYLES;
const DEFAULT_MESSAGE_LIST_STYLE: MessageListStyle = "classic";
const MESSAGE_LIST_STYLE_KEY = "otter:message-list-style";

export const MAIL_LAYOUTS = {
  split: { label: "Split view", description: "Keep the message list beside the conversation." },
  full: { label: "Full inbox", description: "A wide inbox. Open a message to read it in full." },
  floating: {
    label: "Floating",
    description: "Open mail in a bottom-right panel. Keep browsing your inbox.",
  },
} as const;
export type MailLayout = keyof typeof MAIL_LAYOUTS;
const DEFAULT_MAIL_LAYOUT: MailLayout = "split";
const MAIL_LAYOUT_KEY = "otter:mail-layout";

function getMailLayout(): MailLayout {
  const value = mailStorage.getItem(MAIL_LAYOUT_KEY);
  if (value === "flow" || value === "popup") return "floating";
  return value !== null && Object.hasOwn(MAIL_LAYOUTS, value)
    ? (value as MailLayout)
    : DEFAULT_MAIL_LAYOUT;
}

export function setMailLayout(layout: MailLayout): void {
  setSyncedPreference(MAIL_LAYOUT_KEY, layout);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function getMessageListStyle(): MessageListStyle {
  const value = mailStorage.getItem(MESSAGE_LIST_STYLE_KEY);
  return value !== null && Object.hasOwn(MESSAGE_LIST_STYLES, value)
    ? (value as MessageListStyle)
    : DEFAULT_MESSAGE_LIST_STYLE;
}

export function setMessageListStyle(style: MessageListStyle): void {
  setSyncedPreference(MESSAGE_LIST_STYLE_KEY, style);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function isReadingWidth(value: string | null): value is ReadingWidth {
  return value !== null && Object.hasOwn(READING_WIDTHS, value);
}

function getReadingWidth(): ReadingWidth {
  const value = mailStorage.getItem(READING_WIDTH_KEY);
  return isReadingWidth(value) ? value : DEFAULT_READING_WIDTH;
}

export function setReadingWidth(width: ReadingWidth): void {
  setSyncedPreference(READING_WIDTH_KEY, width);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function isValid(setting: InterfaceSetting, value: number): boolean {
  return Number.isInteger(value) && value >= setting.min && value <= setting.max;
}

function getInterfaceSetting(setting: InterfaceSetting): number {
  const raw = mailStorage.getItem(setting.key);
  const value = raw === null ? NaN : Number(raw);
  return isValid(setting, value) ? value : setting.defaultValue;
}

export function setInterfaceSetting(setting: InterfaceSetting, value: number): void {
  if (!isValid(setting, value)) return;
  setSyncedPreference(setting.key, String(value));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function getInterfaceToggle(setting: InterfaceToggle): boolean {
  const value = mailStorage.getItem(setting.key);
  return value === "true" ? true : value === "false" ? false : setting.defaultValue;
}

export function setInterfaceToggle(setting: InterfaceToggle, value: boolean): void {
  setSyncedPreference(setting.key, String(value));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (
      e.key === READING_WIDTH_KEY ||
      e.key === MESSAGE_LIST_STYLE_KEY ||
      e.key === MAIL_LAYOUT_KEY ||
      TOGGLES.some((setting) => setting.key === e.key) ||
      SETTINGS.some((setting) => setting.key === e.key)
    ) {
      onChange();
    }
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function useInterfaceSetting(setting: InterfaceSetting): number {
  return useSyncExternalStore(subscribe, () => getInterfaceSetting(setting));
}

export function useInterfaceToggle(setting: InterfaceToggle): boolean {
  return useSyncExternalStore(subscribe, () => getInterfaceToggle(setting));
}

export function useReadingWidth(): ReadingWidth {
  return useSyncExternalStore(subscribe, getReadingWidth);
}

export function useMessageListStyle(): MessageListStyle {
  return useSyncExternalStore(subscribe, getMessageListStyle);
}

export function useMailLayout(): MailLayout {
  return useSyncExternalStore(subscribe, getMailLayout);
}
