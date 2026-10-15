import { createMailWebModule } from "@otterware/mail-web/module";
import { lazy } from "react";
import { MailIcon, BookOpenIcon, LanguagesIcon, SettingsIcon, PlugIcon } from "lucide-react";
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
      id: "mailboxes",
      label: "Mailboxes",
      icon: MailIcon,
      component: lazy(() =>
        import("./MailSettings").then((m) => ({ default: m.MailboxesSettings })),
      ),
      placement: { grouped: "page", standalone: "page" },
      searchTerms: ["signature", "sync", "mailbox", "behavior"],
      rows: MAIL_SETTING_ROWS.mailboxes,
    },
    {
      id: "reading",
      label: "Reading",
      icon: BookOpenIcon,
      component: lazy(() => import("./MailSettings").then((m) => ({ default: m.ReadingSettings }))),
      placement: { grouped: "page", standalone: "appearance" },
      searchTerms: ["layout", "width", "messages", "read"],
      rows: MAIL_SETTING_ROWS.reading,
    },
    {
      id: "translation",
      label: "Translation",
      icon: LanguagesIcon,
      component: lazy(() =>
        import("./MailSettings").then((m) => ({ default: m.TranslationSettings })),
      ),
      placement: { grouped: "page", standalone: "general" },
      searchTerms: ["language", "translate", "OpenRouter"],
      rows: MAIL_SETTING_ROWS.translation,
    },
    {
      id: "general",
      label: "Mail",
      icon: SettingsIcon,
      component: lazy(() => import("./MailSettings").then((m) => ({ default: m.GeneralSettings }))),
      placement: { grouped: "general", standalone: "general" },
      searchTerms: ["notifications", "tour", "setup", "feedback"],
      rows: MAIL_SETTING_ROWS.general,
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
