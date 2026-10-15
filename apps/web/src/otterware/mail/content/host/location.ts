import { COMBINED_ACCOUNT_ID } from "../main/gmail/custom-views";
import { SEARCH_MAILBOX } from "../main/gmail/gmail-query";
import { PROJECTS_SPACE } from "../main/gmail/spaces";

export interface MailLocation {
  mailbox: string;
  label: string;
  messageId: string | null;
  account: string | null;
  focusId: string | null;
}
const builtins = new Set([
  "inbox",
  "starred",
  "sent",
  "drafts",
  "important",
  "allmail",
  "junk",
  "trash",
]);
/** Decode the host's Mail subpath; this does not own history or a router. */
export function parseMailLocation(path: string): MailLocation | null {
  const url = new URL(path, "https://mail.invalid");
  let parts: string[];
  try {
    parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    return null;
  }
  const [space, folder, messageId] = parts;
  if (!space || !folder || space === "settings") return null;
  const mailbox =
    space === "all" ? COMBINED_ACCOUNT_ID : space === "projects" ? PROJECTS_SPACE : space;
  const label =
    folder === "search"
      ? SEARCH_MAILBOX
      : mailbox === COMBINED_ACCOUNT_ID && builtins.has(folder)
        ? `__${folder}__`
        : folder;
  return {
    mailbox,
    label,
    messageId: messageId ?? null,
    account: url.searchParams.get("account"),
    focusId: url.searchParams.get("message"),
  };
}
export function mailLocationPath(loc: MailLocation): string {
  const space =
    loc.mailbox === COMBINED_ACCOUNT_ID
      ? "all"
      : loc.mailbox === PROJECTS_SPACE
        ? "projects"
        : loc.mailbox;
  const label = /^__([a-z]+)__$/.exec(loc.label)?.[1] ?? loc.label;
  const query = new URLSearchParams();
  if (loc.messageId && loc.account && loc.account !== loc.mailbox)
    query.set("account", loc.account);
  if (loc.messageId && loc.focusId) query.set("message", loc.focusId);
  return `/${[space, label, ...(loc.messageId ? [loc.messageId] : [])].map(encodeURIComponent).join("/")}${query.size ? `?${query}` : ""}`;
}
