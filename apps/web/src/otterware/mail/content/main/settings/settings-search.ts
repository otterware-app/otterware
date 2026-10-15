import { MAIL_SETTING_ROWS } from "../../../settingsRows";
const titles: Record<string, string> = {
  "sync-interval": "Check for new mail",
  "message-list-style": "Message list style",
  "reading-width": "Reading width",
  "auto-translate": "Translate automatically",
  "mark-read-delay": "Mark as read delay",
  "mailbox-status": "Mailbox status",
  "dock-badge": "Show unread count on Dock icon",
  "mail-layout": "Mail layout",
  "mailbox-color": "Mailbox color",
  setup: "Setup",
  "mailbox-display-name": "Display name",
  "remove-mailbox": "Remove account",
  "launch-at-login": "Launch at login",
  "rail-unread-dots": "Show unread dots in the rail",
  todoist: "Todoist",
  mailboxes: "Mailboxes",
  "advance-direction": "After archive, delete, or move",
  signature: "Signature",
  tour: "Tour",
  "read-languages": "Languages I read",
  "all-mailboxes": "All mailboxes",
  "send-feedback": "Send feedback",
  "dim-read-messages": "Dim read messages",
  "group-messages-by-day": "Group messages by day",
  "open-messages-with-arrows": "Open messages with arrow keys",
  notifications: "Notifications",
  "default-mail-app": "Default email app",
};
for (const row of Object.values(MAIL_SETTING_ROWS).flat()) titles[row.id] = row.title;
/** Row anchors and titles used by the host settings search. */
export function searchableSetting(id: string) {
  return { id, title: titles[id] ?? id };
}
