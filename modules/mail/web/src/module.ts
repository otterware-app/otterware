import { defineWebModule, type WebModule } from "@otterware/module-kit/web";
import { MailIcon } from "lucide-react";

export function createMailWebModule(
  page: WebModule["page"],
  settings: NonNullable<WebModule["settings"]>["component"],
): WebModule {
  return defineWebModule({
    id: "mail",
    label: "Mail",
    icon: MailIcon,
    rail: { position: "start", order: 20 },
    page,
    serverModule: "mail",
    sideChat: true,
    searchTerms: ["email", "inbox", "gmail", "outlook", "imap"],
    settings: {
      label: "Mail",
      icon: MailIcon,
      component: settings,
      searchTerms: [
        "mailbox",
        "appearance",
        "sync",
        "signature",
        "notifications",
        "keybindings",
        "todoist",
      ],
    },
    commands: [
      { id: "inbox", title: "Open Mail", subpath: "", searchTerms: ["email", "inbox"] },
      {
        id: "compose",
        title: "Compose email",
        subpath: "?compose=1",
        searchTerms: ["new", "send", "draft"],
      },
    ],
  });
}
