import { defineWebModule, type WebModule } from "@otterware/module-kit/web";
import { MailIcon } from "lucide-react";

/** Mail contributes content and data to the host shell; it owns no application frame. */
export function createMailWebModule(
  shell: Pick<
    WebModule,
    | "page"
    | "useSpaces"
    | "useSidebar"
    | "useHeaderActions"
    | "stores"
    | "settings"
    | "commands"
    | "keybindingAliases"
    | "runCommand"
    | "paletteCommands"
  >,
): WebModule {
  return defineWebModule({
    id: "mail",
    label: "Mail",
    icon: MailIcon,
    serverModule: "mail",
    sideChat: true,
    searchTerms: ["email", "inbox", "gmail", "outlook", "imap"],
    ...shell,
  });
}
