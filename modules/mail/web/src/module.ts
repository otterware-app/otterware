import { defineWebModule, type WebModule } from "@otterware/module-kit/web";
import { MailIcon } from "lucide-react";

/**
 * Mail's registration. The host supplies the page (content only), the
 * settings page and the shell hooks; chunk 2 of the rebuild fills in the
 * spaces (accounts and views), sidebar rows, header actions, stores and the
 * settings pages per docs/adr/0011, and renames Mail's own command ids with
 * `keybindingAliases`.
 */
export function createMailWebModule(
  shell: Pick<WebModule, "page" | "useSpaces" | "useSidebar" | "useHeaderActions" | "stores"> & {
    readonly settings: WebModule["settings"][number]["component"];
  },
): WebModule {
  const { settings, ...rest } = shell;
  return defineWebModule({
    id: "mail",
    label: "Mail",
    icon: MailIcon,
    ...rest,
    serverModule: "mail",
    sideChat: true,
    searchTerms: ["email", "inbox", "gmail", "outlook", "imap"],
    settings: [
      {
        id: "mail",
        label: "Mail",
        icon: MailIcon,
        component: settings,
        searchTerms: ["mailbox", "appearance", "sync", "signature", "notifications", "todoist"],
        placement: { grouped: "page", standalone: "page" },
      },
    ],
    commands: [
      { id: "mail.inbox", title: "Open Mail", subpath: "", searchTerms: ["email", "inbox"] },
      {
        id: "mail.compose",
        title: "Compose email",
        subpath: "?compose=1",
        searchTerms: ["new", "send", "draft"],
      },
    ],
  });
}
