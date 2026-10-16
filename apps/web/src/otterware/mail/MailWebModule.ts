import { createMailWebModule } from "@otterware/mail-web/module";
import { lazy } from "react";
import { MailIcon, PaletteIcon, SettingsIcon, PlugIcon } from "lucide-react";
import {
  mailPaletteCommands,
  useMailSpaces,
  useMailSidebar,
  useMailHeaderActions,
} from "./mailSpaces";
import { mailCommands, mailKeybindingAliases, runDynamicMailCommand } from "./mailCommands";
import { MAIL_SETTING_ROWS } from "./settingsRows";

export const MailWebModule = createMailWebModule({
  page: lazy(() => import("./MailPage")),
  useSpaces: useMailSpaces,
  useSidebar: useMailSidebar,
  useHeaderActions: useMailHeaderActions,
  stores: [{ id: "mail.data", runtime: lazy(() => import("./MailRuntime")) }],
  commands: mailCommands,
  paletteCommands: mailPaletteCommands,
  runCommand: runDynamicMailCommand,
  keybindingAliases: mailKeybindingAliases,
  settings: [
    {
      id: "general",
      label: "General",
      icon: SettingsIcon,
      component: lazy(() => import("./MailSettings").then((m) => ({ default: m.GeneralSettings }))),
      placement: { grouped: "page", standalone: "general" },
      searchTerms: ["notifications", "sync", "translate", "language", "tour", "setup", "feedback"],
      rows: MAIL_SETTING_ROWS.general,
    },
    {
      id: "appearance",
      label: "Appearance",
      icon: PaletteIcon,
      component: lazy(() =>
        import("./MailSettings").then((m) => ({ default: m.AppearanceSettings })),
      ),
      placement: { grouped: "page", standalone: "appearance" },
      searchTerms: ["layout", "reading", "width", "messages", "read"],
      rows: MAIL_SETTING_ROWS.appearance,
    },
    {
      id: "mailboxes",
      label: "Mailboxes",
      icon: MailIcon,
      component: lazy(() =>
        import("./MailSettings").then((m) => ({ default: m.MailboxesSettings })),
      ),
      placement: { grouped: "page", standalone: "page" },
      searchTerms: ["signature", "mailbox", "account"],
      rows: MAIL_SETTING_ROWS.mailboxes,
    },
    {
      id: "integrations",
      label: "Todoist",
      icon: PlugIcon,
      component: lazy(() =>
        import("./MailSettings").then((m) => ({ default: m.IntegrationsSettings })),
      ),
      placement: { grouped: "integrations", standalone: "integrations" },
      searchTerms: ["todoist", "tasks"],
      rows: [{ id: "todoist", title: "Todoist" }],
    },
  ],
});
