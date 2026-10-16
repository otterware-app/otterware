import { moduleSettingsHref } from "../settingsRegistry";

/** Otter Mail's settings panes that became Mail's own pages, by their page id. */
const MAIL_PAGES: Readonly<Record<string, string>> = {
  general: "general",
  appearance: "appearance",
  accounts: "mailboxes",
};

/** Panes that became shared App pages. */
const APP_PAGES: Readonly<Record<string, string>> = {
  agents: "/settings/providers",
  browser: "/settings/extensions",
  otter: "/settings/account",
};

/** Where one of Otter Mail's settings panes lives in the shell's Settings. */
export function mailSettingsPath(pane: string): string {
  const page = MAIL_PAGES[pane];
  const own = page === undefined ? null : moduleSettingsHref("mail", page);
  return own ?? APP_PAGES[pane] ?? `/settings/${encodeURIComponent(pane || "general")}`;
}
