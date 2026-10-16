const rows = (entries: Record<string, string>) =>
  Object.entries(entries).map(([id, title]) => ({ id, title }));
export const MAIL_SETTING_ROWS = {
  mailboxes: rows({
    mailboxes: "Mailboxes",
    "all-mailboxes": "All mailboxes",
    "mailbox-status": "Mailbox status",
    "mailbox-display-name": "Display name",
    "mailbox-color": "Mailbox color",
    signature: "Signature",
    "remove-mailbox": "Remove mailbox",
  }),
  appearance: rows({
    "mail-layout": "Mail layout",
    "message-list-style": "Message list style",
    "group-messages-by-day": "Group messages by day",
    "dim-read-messages": "Dim read messages",
    "open-messages-with-arrows": "Open messages with arrow keys",
    "mark-read-delay": "Mark as read delay",
    "reading-width": "Reading width",
  }),
  general: rows({
    "launch-at-login": "Launch at login",
    "dock-badge": "Dock unread count",
    "sync-interval": "Check for new mail",
    notifications: "Notifications",
    "advance-direction": "After archive, delete, or move",
    "rail-unread-dots": "Unread dots in rail",
    "read-languages": "Languages I read",
    "auto-translate": "Translate automatically",
    "default-mail-app": "Default email app",
    tour: "Tour",
    setup: "Setup",
    "send-feedback": "Send feedback",
  }),
};
