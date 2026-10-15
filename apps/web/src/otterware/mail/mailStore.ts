import type { SearchTab } from "./content/main/gmail/search-tabs";
import { createClientStore } from "@otterware/module-kit/web";
import type { MailWebHost, MailPageSelection } from "./content/host/bridge";
import type { MailSession } from "./content/host/session";
import type { GmailAccount, GmailLabel, MailView } from "./content/main/gmail/types";
import type { Project } from "./content/main/gmail/projects";

export interface MailSnapshot {
  host: MailWebHost;
  session: MailSession;
  accounts: GmailAccount[];
  combined: boolean;
  views: MailView[];
  projects: Project[];
  labels: Record<string, GmailLabel[]>;
  unread: Record<string, number>;
  dots: boolean;
}
export const useMailStore = createClientStore(() => ({
  current: null as MailSnapshot | null,
  searches: [] as SearchTab[],
  activeSearchId: null as string | null,
  selection: null as MailPageSelection | null,
}));
export function mailAction(command: string, arg?: string) {
  window.dispatchEvent(new CustomEvent("mail:shell-action", { detail: { command, arg } }));
}
