import { defineModuleSettings } from "@otterware/module-kit/contracts";
import * as Schema from "effect/Schema";
import { DEFAULT_SETTINGS } from "./settings.ts";

export const MailSettings = defineModuleSettings({
  syncIntervalSeconds: {
    scope: "account",
    schema: Schema.Number,
    default: DEFAULT_SETTINGS.syncIntervalSeconds,
    label: "Sync interval",
  },
  notificationsMode: {
    scope: "account",
    schema: Schema.Literals(["off", "inbox", "all"]),
    default: DEFAULT_SETTINGS.notificationsMode,
    label: "Notifications",
  },
  readLanguages: {
    scope: "account",
    schema: Schema.Array(Schema.String),
    default: DEFAULT_SETTINGS.readLanguages,
    label: "Reading languages",
  },
  autoTranslate: {
    scope: "account",
    schema: Schema.Boolean,
    default: false,
    label: "Translate incoming mail",
  },
  appearance: {
    scope: "account",
    schema: Schema.Record(Schema.String, Schema.String),
    default: {},
    label: "Mail appearance",
  },
  keybindings: {
    scope: "account",
    schema: Schema.Array(
      Schema.Struct({
        key: Schema.String,
        command: Schema.String,
        when: Schema.optional(Schema.String),
      }),
    ),
    default: [],
    label: "Mail keybindings",
  },
  launchAtLogin: {
    scope: "environment",
    schema: Schema.Boolean,
    default: false,
    label: "Launch at login",
  },
  dockBadgeEnabled: {
    scope: "environment",
    schema: Schema.Boolean,
    default: false,
    label: "Dock badge",
  },
});
