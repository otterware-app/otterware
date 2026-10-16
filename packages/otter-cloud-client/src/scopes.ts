// Dependency-free, so any host or worker can import it without bundling Effect.
/**
 * The one consent a device asks for, so Mail, Calendar and contacts on it share one sign-in and
 * adding a module never asks again. Google covers Mail (including Gmail IMAP fill, signatures,
 * contacts and invitations) and Calendar. Each device connects Google itself.
 */
export const PROVIDER_SCOPES = {
  google: [
    "https://mail.google.com/",
    "https://www.googleapis.com/auth/gmail.settings.basic",
    "https://www.googleapis.com/auth/contacts.readonly",
    "https://www.googleapis.com/auth/contacts.other.readonly",
    "https://www.googleapis.com/auth/calendar",
  ],
  microsoft: ["User.Read", "Mail.ReadWrite", "Mail.Send", "Contacts.Read", "Calendars.ReadWrite"],
} as const;
