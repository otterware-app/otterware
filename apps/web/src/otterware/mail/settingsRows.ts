const rows = (entries: Record<string, string>) =>
  Object.entries(entries).map(([id, title]) => ({ id, title }));
export const MAIL_SETTING_ROWS = {
  mailboxes: rows({
    "mailbox-status": "Mailbox status",
    "mailbox-display-name": "Display name",
    "mailbox-color": "Mailbox color",
    signature: "Signature",
    "remove-mailbox": "Remove mailbox",
    "all-mailboxes": "All mailboxes",
    mailboxes: "Mailboxes",
    "sync-interval": "Check for new mail",
    "advance-direction": "After archive, delete, or move",
    "rail-unread-dots": "Unread dots in rail",
    "dock-badge": "Dock unread count",
    "default-mail-app": "Default email app",
  }),
  reading: rows({
    "mail-layout": "Mail layout",
    "message-list-style": "Message list style",
    "reading-width": "Reading width",
    "group-messages-by-day": "Group by day",
    "dim-read-messages": "Dim read messages",
    "open-messages-with-arrows": "Arrow keys open messages",
    "mark-read-delay": "Mark as read delay",
  }),
  translation: rows({
    "read-languages": "Languages I read",
    "auto-translate": "Translate automatically",
    openrouter: "OpenRouter",
  }),
  general: rows({
    "launch-at-login": "Launch at login",
    notifications: "Mail notifications",
    tour: "Tour",
    setup: "Setup",
    "send-feedback": "Send feedback",
  }),
};
