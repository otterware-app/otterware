export interface MailToolDefinition {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly input: {
    readonly type: "object";
    readonly properties: Record<string, unknown>;
    readonly required?: readonly string[] | undefined;
  };
  readonly readOnly?: boolean | undefined;
  readonly permanent?: boolean | undefined;
  readonly needsFiles?: boolean | undefined;
}
/** Portable tool metadata, shared by MCP, browser agents and implementations. */
export const mailToolDefinitions = [
  {
    name: "list_accounts",
    title: "List mailboxes",
    description:
      "The user's mailboxes (Gmail, IMAP, …) in Otter Mail: each one's address, provider, and whether it has a calendar. Every other tool names a mailbox by its address.",
    input: {
      type: "object",
      properties: {},
    },
    readOnly: true,
  },
  {
    name: "list_labels",
    title: "List labels",
    description:
      "A mailbox's labels (IMAP: its folders), with unread and total counts. Tools take a label by name.",
    input: {
      type: "object",
      properties: {
        account: {
          type: "string",
          description: "The mailbox, by address. Optional when there's only one.",
        },
      },
    },
    readOnly: true,
  },
  {
    name: "list_threads",
    title: "List conversations",
    description:
      "The newest conversations in a label (default the inbox), from every mailbox unless one is named. Reads what Otter Mail has on this device, filling in from the server as needed.",
    input: {
      type: "object",
      properties: {
        account: {
          type: "string",
          description: "One mailbox, by address; default every one.",
        },
        label: {
          type: "string",
          description:
            "inbox (default), sent, drafts, starred, spam, trash, all, or a label's name.",
        },
        unreadOnly: {
          type: "boolean",
        },
        limit: {
          type: "number",
          description: "Default 25, at most 100.",
        },
        cursor: {
          type: "string",
          description: "The previous page's cursor, for the next page.",
        },
      },
    },
    readOnly: true,
  },
  {
    name: "search_mail",
    title: "Search mail",
    description:
      "Searches every mailbox (or those named) and answers matching conversations, newest first, up to 50 per mailbox per page. Gmail's search syntax: words, and operators like from:, to:, subject:, has:attachment, is:unread, is:starred, in:inbox, label:, newer_than:7d, older_than:1y, after:2026/01/31, before:, -word. Gmail runs it on the server; mailboxes without server search run the same operators on what's on this device.",
    input: {
      type: "object",
      properties: {
        query: {
          type: "string",
        },
        accounts: {
          type: "array",
          items: {
            type: "string",
          },
          description: "Mailboxes to search, by address; default every one.",
        },
        cursor: {
          type: "string",
          description: "The previous page's cursor, for the next page.",
        },
      },
      required: ["query"],
    },
    readOnly: true,
  },
  {
    name: "get_thread",
    title: "Read a conversation",
    description:
      "A whole conversation: every message's sender, recipients, date, text and attachments (oldest first). Quoted history is left out of each message unless includeQuoted is set, since the earlier messages are there. Reading doesn't mark it read.",
    input: {
      type: "object",
      properties: {
        account: {
          type: "string",
          description: "The mailbox, by address. Optional when there's only one.",
        },
        threadId: {
          type: "string",
        },
        includeQuoted: {
          type: "boolean",
        },
      },
      required: ["threadId"],
    },
    readOnly: true,
  },
  {
    name: "get_attachment",
    title: "Download an attachment",
    description:
      "Saves one of a message's attachments (from get_thread) to a file on this device and answers its path. The connected agent also receives supported file content.",
    input: {
      type: "object",
      properties: {
        account: {
          type: "string",
          description: "The mailbox, by address. Optional when there's only one.",
        },
        messageId: {
          type: "string",
        },
        attachmentId: {
          type: "string",
        },
      },
      required: ["messageId", "attachmentId"],
    },
    readOnly: true,
    needsFiles: true,
  },
  {
    name: "update_threads",
    title: "Update conversations",
    description:
      "Archives, moves back to the inbox, marks read or unread, stars or unstars, and adds or removes labels on conversations of one mailbox. In IMAP mailboxes a message is in one folder: adding a label moves it there.",
    input: {
      type: "object",
      properties: {
        account: {
          type: "string",
          description: "The mailbox, by address. Optional when there's only one.",
        },
        threadIds: {
          type: "array",
          items: {
            type: "string",
          },
        },
        archive: {
          type: "boolean",
          description: "Out of the inbox.",
        },
        moveToInbox: {
          type: "boolean",
        },
        read: {
          type: "boolean",
          description: "true: mark read; false: mark unread.",
        },
        starred: {
          type: "boolean",
        },
        addLabels: {
          type: "array",
          items: {
            type: "string",
          },
          description: "Label names.",
        },
        removeLabels: {
          type: "array",
          items: {
            type: "string",
          },
        },
      },
      required: ["threadIds"],
    },
  },
  {
    name: "trash_threads",
    title: "Move to Trash",
    description:
      "Moves conversations of one mailbox to the Trash (restore_threads brings them back).",
    input: {
      type: "object",
      properties: {
        account: {
          type: "string",
          description: "The mailbox, by address. Optional when there's only one.",
        },
        threadIds: {
          type: "array",
          items: {
            type: "string",
          },
        },
      },
      required: ["threadIds"],
    },
  },
  {
    name: "restore_threads",
    title: "Restore from Trash",
    description: "Takes conversations out of the Trash, back where they were.",
    input: {
      type: "object",
      properties: {
        account: {
          type: "string",
          description: "The mailbox, by address. Optional when there's only one.",
        },
        threadIds: {
          type: "array",
          items: {
            type: "string",
          },
        },
      },
      required: ["threadIds"],
    },
  },
  {
    name: "create_label",
    title: "Create a label",
    description: "Creates a label (IMAP: a folder). Nest with slashes: Projects/Otter.",
    input: {
      type: "object",
      properties: {
        account: {
          type: "string",
          description: "The mailbox, by address. Optional when there's only one.",
        },
        name: {
          type: "string",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "save_draft",
    title: "Save a draft",
    description:
      "Writes a message into the mailbox's Drafts without sending it, for the user to review and send from Otter Mail. The safe way to prepare mail. With draftId, replaces that draft.",
    input: {
      type: "object",
      properties: {
        account: {
          type: "string",
          description: "The mailbox the draft is in (its address).",
        },
        to: {
          type: "string",
          description: "Recipients, comma-separated. Replies fill it in when left out.",
        },
        cc: {
          type: "string",
        },
        bcc: {
          type: "string",
        },
        subject: {
          type: "string",
          description: "Replies and forwards fill it in when left out.",
        },
        body: {
          type: "string",
          description:
            "Plain text. The mailbox's signature and, for replies and forwards, the original message are added below it.",
        },
        replyTo: {
          type: "string",
          description:
            "A messageId to reply to: the reply joins its conversation, goes to its sender (with replyAll, everyone on it) and quotes it.",
        },
        replyAll: {
          type: "boolean",
        },
        forward: {
          type: "string",
          description: "A messageId to forward, with its attachments. Needs `to`.",
        },
        attachments: {
          type: "array",
          items: {
            type: "string",
          },
          description: "Paths of files on this Mac to attach.",
        },
        draftId: {
          type: "string",
          description: "The draft to replace.",
        },
      },
    },
  },
  {
    name: "delete_draft",
    title: "Delete a draft",
    permanent: true,
    description: "Deletes a draft (its draftId is in get_thread).",
    input: {
      type: "object",
      properties: {
        account: {
          type: "string",
          description: "The mailbox, by address. Optional when there's only one.",
        },
        draftId: {
          type: "string",
        },
      },
      required: ["draftId"],
    },
  },
  {
    name: "send_email",
    title: "Send email",
    permanent: true,
    description:
      "Sends a message: new, a reply (replyTo) or a forward (forward). Only when the user asked for it to be sent; otherwise use save_draft. With draftId, that draft is deleted once it's sent.",
    input: {
      type: "object",
      properties: {
        account: {
          type: "string",
          description: "The mailbox to send from (its address).",
        },
        to: {
          type: "string",
          description: "Recipients, comma-separated. Replies fill it in when left out.",
        },
        cc: {
          type: "string",
        },
        bcc: {
          type: "string",
        },
        subject: {
          type: "string",
          description: "Replies and forwards fill it in when left out.",
        },
        body: {
          type: "string",
          description:
            "Plain text. The mailbox's signature and, for replies and forwards, the original message are added below it.",
        },
        replyTo: {
          type: "string",
          description:
            "A messageId to reply to: the reply joins its conversation, goes to its sender (with replyAll, everyone on it) and quotes it.",
        },
        replyAll: {
          type: "boolean",
        },
        forward: {
          type: "string",
          description: "A messageId to forward, with its attachments. Needs `to`.",
        },
        attachments: {
          type: "array",
          items: {
            type: "string",
          },
          description: "Paths of files on this Mac to attach.",
        },
        draftId: {
          type: "string",
          description: "A draft this message replaces.",
        },
      },
    },
  },
  {
    name: "list_events",
    title: "List events",
    description:
      "Events in the calendars of every mailbox that has one (or those named), soonest first; recurring events as their occurrences. Default: the next 7 days.",
    input: {
      type: "object",
      properties: {
        accounts: {
          type: "array",
          items: {
            type: "string",
          },
          description: "By address.",
        },
        from: {
          type: "string",
          description: "ISO date or date-time; default now.",
        },
        to: {
          type: "string",
          description: "Default 7 days after `from`.",
        },
        query: {
          type: "string",
          description: "Words to find in the events.",
        },
        limit: {
          type: "number",
          description: "Per calendar; default 50, at most 250.",
        },
      },
    },
    readOnly: true,
  },
  {
    name: "get_event",
    title: "Read an event",
    description: "One event, whole: its time, place, description, attendees and their answers.",
    input: {
      type: "object",
      properties: {
        account: {
          type: "string",
          description:
            "The mailbox whose calendar it is, by address. Optional when there's only one.",
        },
        eventId: {
          type: "string",
        },
      },
      required: ["eventId"],
    },
    readOnly: true,
  },
  {
    name: "create_event",
    title: "Add an event",
    permanent: true,
    description: "Adds an event to the mailbox's calendar, inviting any attendees.",
    input: {
      type: "object",
      properties: {
        account: {
          type: "string",
          description:
            "The mailbox whose calendar it is, by address. Optional when there's only one.",
        },
        title: {
          type: "string",
        },
        start: {
          type: "string",
          description:
            "ISO date-time (2026-10-01T14:00, this device's time zone unless it has an offset), or a date for all-day events.",
        },
        end: {
          type: "string",
          description:
            "Same form as start. All-day events end the day after their last day. Left out: an hour (or a day) after the start; when moving an event, its length stays.",
        },
        allDay: {
          type: "boolean",
        },
        timeZone: {
          type: "string",
          description: "IANA zone for the times (Europe/Paris).",
        },
        location: {
          type: "string",
        },
        description: {
          type: "string",
        },
        attendees: {
          type: "array",
          items: {
            type: "string",
          },
          description: "Every attendee's address (replaces the list when changing an event).",
        },
        videoCall: {
          type: "boolean",
          description: "Adds a video call link (Google Meet).",
        },
        notify: {
          type: "boolean",
          description: "Email the attendees about it (default true).",
        },
      },
      required: ["title", "start"],
    },
  },
  {
    name: "update_event",
    title: "Change an event",
    permanent: true,
    description: "Changes an event: only the fields given change.",
    input: {
      type: "object",
      properties: {
        account: {
          type: "string",
          description:
            "The mailbox whose calendar it is, by address. Optional when there's only one.",
        },
        eventId: {
          type: "string",
        },
        title: {
          type: "string",
        },
        start: {
          type: "string",
          description:
            "ISO date-time (2026-10-01T14:00, this device's time zone unless it has an offset), or a date for all-day events.",
        },
        end: {
          type: "string",
          description:
            "Same form as start. All-day events end the day after their last day. Left out: an hour (or a day) after the start; when moving an event, its length stays.",
        },
        allDay: {
          type: "boolean",
        },
        timeZone: {
          type: "string",
          description: "IANA zone for the times (Europe/Paris).",
        },
        location: {
          type: "string",
        },
        description: {
          type: "string",
        },
        attendees: {
          type: "array",
          items: {
            type: "string",
          },
          description: "Every attendee's address (replaces the list when changing an event).",
        },
        videoCall: {
          type: "boolean",
          description: "Adds a video call link (Google Meet).",
        },
        notify: {
          type: "boolean",
          description: "Email the attendees about it (default true).",
        },
      },
      required: ["eventId"],
    },
  },
  {
    name: "delete_event",
    title: "Delete an event",
    permanent: true,
    description:
      "Deletes an event from the mailbox's calendar (for an invitation, decline it instead).",
    input: {
      type: "object",
      properties: {
        account: {
          type: "string",
          description:
            "The mailbox whose calendar it is, by address. Optional when there's only one.",
        },
        eventId: {
          type: "string",
        },
        notify: {
          type: "boolean",
          description: "Email the attendees about it (default true).",
        },
      },
      required: ["eventId"],
    },
  },
  {
    name: "respond_to_event",
    title: "Answer an invitation",
    permanent: true,
    description: "Accepts, declines or tentatively accepts an invitation; the organizer is told.",
    input: {
      type: "object",
      properties: {
        account: {
          type: "string",
          description:
            "The mailbox whose calendar it is, by address. Optional when there's only one.",
        },
        eventId: {
          type: "string",
        },
        response: {
          type: "string",
          enum: ["accepted", "declined", "tentative"],
        },
      },
      required: ["eventId", "response"],
    },
  },
  {
    name: "list_themes",
    title: "List themes",
    description:
      "The app's color themes (built-in, and the user's own), and which one each appearance (light, dark) wears now, plus the color scheme (system, light or dark).",
    input: {
      type: "object",
      properties: {},
    },
    readOnly: true,
  },
  {
    name: "get_theme",
    title: "Get theme",
    description:
      "A theme's colors for each appearance it has, by role (the roles the app paints). Roles: canvas (the app's background), chrome (the window's top bar), text (text), surface (cards), surfaceRaised (raised surfaces and the composer), surfaceOverlay (menus and popovers), messageAction (buttons, unread dots and other accents (the primary color)), messageActionForeground (text and icons on buttons), secondary (secondary buttons), secondaryForeground (text on secondary buttons), muted (quiet backgrounds), mutedForeground (muted text), placeholder (placeholders in fields), secondaryLabel (secondary labels), iconMuted (muted icons), accentSurface (hovered and selected rows), accentSurfaceForeground (text on hovered and selected rows), messageSurface (your messages in the agent chat), messageForeground (text of your messages in the agent chat), codeBackground (code blocks), codeForeground (code text), border (borders and dividers), input (field borders), focus (focus rings), error (errors), errorForeground (error text), errorSurface (error backgrounds), warning (warnings), warningForeground (warning text), warningSurface (warning backgrounds), sidebar (the sidebar's background), sidebarForeground (the sidebar's text), sidebarMutedForeground (the sidebar's muted text), sidebarControlSurface (controls in the sidebar), sidebarRowHover (hovered rows in the sidebar), sidebarRowActive (pressed rows in the sidebar), sidebarRowSelected (the selected row in the sidebar), sidebarBorder (the sidebar's lines).",
    input: {
      type: "object",
      properties: {
        theme: {
          type: "string",
          description: "Its id (from list_themes).",
        },
      },
      required: ["theme"],
    },
    readOnly: true,
  },
  {
    name: "save_theme",
    title: "Save theme",
    description:
      "Makes a theme of the user's own, or changes one, setting the colors given (every other color stays). Changing a built-in (like the one worn now) makes a copy (\"<name> copy\" unless `name` is given) and wears it in its place, as built-ins never change. A new theme starts from `from` (default: the theme the dark appearance wears) and is worn at once unless `wear` is false. Roles: canvas (the app's background), chrome (the window's top bar), text (text), surface (cards), surfaceRaised (raised surfaces and the composer), surfaceOverlay (menus and popovers), messageAction (buttons, unread dots and other accents (the primary color)), messageActionForeground (text and icons on buttons), secondary (secondary buttons), secondaryForeground (text on secondary buttons), muted (quiet backgrounds), mutedForeground (muted text), placeholder (placeholders in fields), secondaryLabel (secondary labels), iconMuted (muted icons), accentSurface (hovered and selected rows), accentSurfaceForeground (text on hovered and selected rows), messageSurface (your messages in the agent chat), messageForeground (text of your messages in the agent chat), codeBackground (code blocks), codeForeground (code text), border (borders and dividers), input (field borders), focus (focus rings), error (errors), errorForeground (error text), errorSurface (error backgrounds), warning (warnings), warningForeground (warning text), warningSurface (warning backgrounds), sidebar (the sidebar's background), sidebarForeground (the sidebar's text), sidebarMutedForeground (the sidebar's muted text), sidebarControlSurface (controls in the sidebar), sidebarRowHover (hovered rows in the sidebar), sidebarRowActive (pressed rows in the sidebar), sidebarRowSelected (the selected row in the sidebar), sidebarBorder (the sidebar's lines). Contrast matters: keep text readable on its background.",
    input: {
      type: "object",
      properties: {
        theme: {
          type: "string",
          description: "The theme to change, by id. Leave out to make a new one.",
        },
        name: {
          type: "string",
          description: "A new theme's name, or a new name for `theme`.",
        },
        from: {
          type: "string",
          description: "The theme a new one starts from, by id.",
        },
        light: {
          type: "object",
          additionalProperties: {
            type: "string",
          },
          description:
            'Colors to set in the light palette, role → "#rrggbb" or "oklch(L C H)". Only these change.',
        },
        dark: {
          type: "object",
          additionalProperties: {
            type: "string",
          },
          description:
            'Colors to set in the dark palette, role → "#rrggbb" or "oklch(L C H)". Only these change.',
        },
        wear: {
          type: "boolean",
          description: "Wear a new theme now (default true).",
        },
      },
    },
  },
  {
    name: "use_theme",
    title: "Use theme",
    description:
      "Wears a theme: for the appearances it has, or only the one given (light or dark).",
    input: {
      type: "object",
      properties: {
        theme: {
          type: "string",
          description: "Its id (from list_themes).",
        },
        appearance: {
          type: "string",
          enum: ["light", "dark"],
          description: "Default: both.",
        },
      },
      required: ["theme"],
    },
  },
  {
    name: "list_views",
    title: "List views",
    description:
      "The user's views: saved filters across their mailboxes, each a space in the app's rail. Each with its rules (per mailbox, labels it must and must not have) and how many conversations it finds now.",
    input: {
      type: "object",
      properties: {},
    },
    readOnly: true,
  },
  {
    name: "save_view",
    title: "Save view",
    description:
      "Makes a view, or changes one (by `view`, its id; what's left out stays). A view only filters by labels: to gather mail by sender or subject, label it first. It can wear an icon (star, bookmark, heart, flag, zap, asterisk, bell, layers, inbox, archive, folder, tag, mail, at, message, users, check, tasks, clipboard, calendar, briefcase, building, receipt, money, card, shopping, gift, plane, home, coffee, news, book, school, code, quote, search, idea, sparkles, music, sun) or an emoji, in a color (gray, red, orange, yellow, green, teal, blue, indigo, purple, pink). Answers what it finds, to check the rules are right.",
    input: {
      type: "object",
      properties: {
        view: {
          type: "string",
          description: "The view to change, by id. Leave out to make one.",
        },
        name: {
          type: "string",
        },
        rules: {
          type: "array",
          description:
            "For each mailbox the view draws on: the labels its mail must have (all of them) and must not have (any). The mailboxes' matches are combined. Labels by name (list_labels), or inbox, starred, sent, drafts, important, unread.",
          items: {
            type: "object",
            properties: {
              account: {
                type: "string",
                description: "The mailbox, by address.",
              },
              mustHave: {
                type: "array",
                items: {
                  type: "string",
                },
              },
              mustNotHave: {
                type: "array",
                items: {
                  type: "string",
                },
              },
            },
            required: ["account"],
          },
        },
        icon: {
          type: "string",
          description: "An icon's key or an emoji; null for its initial.",
        },
        color: {
          type: "string",
          description: "A color's name; null for none.",
        },
      },
    },
  },
  {
    name: "delete_view",
    title: "Delete view",
    permanent: true,
    description: "Deletes a view. The mail and its labels stay as they are.",
    input: {
      type: "object",
      properties: {
        view: {
          type: "string",
          description: "Its id (from list_views).",
        },
      },
      required: ["view"],
    },
  },
] as const;
export const mailToolDefinition = (name: string): MailToolDefinition => {
  const found = mailToolDefinitions.find((tool) => tool.name === name);
  if (!found) throw new Error(`Unknown Mail tool: ${name}`);
  return found;
};
