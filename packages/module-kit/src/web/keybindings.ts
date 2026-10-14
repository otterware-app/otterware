/**
 * Module and shell commands in T3 Code's keybindings model (ADR 0020): one
 * `keybindings.json`, commands named `<module>.<command>`, and an `app.<id>`
 * when-context the host sets to the active app so `e` can archive in Mail and
 * edit in Drive. Global commands (switch app, toggle the Otterware Assistant)
 * fire everywhere; the command palette's toggle is T3's own.
 */
import {
  KeybindingCommand,
  type KeybindingRule,
  type ResolvedKeybindingsConfig,
} from "@t3tools/contracts";
import { compileResolvedKeybindingsConfig } from "@t3tools/shared/keybindings";
import * as Schema from "effect/Schema";

import type { WebModule } from "./registry.ts";

/** How this build composes its modules (ADR 0020). */
export type ShellKind =
  /** Otterware: Code plus every module, the rail has Home and the switcher. */
  | "combined"
  /** One module on, Code hidden: the module's original rail and flat settings. */
  | "standalone"
  /** Otter Code: no modules, upstream's shell. */
  | "code";

export const APP_SWITCH_COMMANDS = [
  "app.switch.1",
  "app.switch.2",
  "app.switch.3",
  "app.switch.4",
] as const;
export const ASSISTANT_TOGGLE_COMMAND = "assistant.toggle";
/** Fire in every app; a conflict with any other binding is flagged. */
export const SHELL_GLOBAL_COMMANDS: ReadonlyArray<string> = [
  "commandPalette.toggle",
  ...APP_SWITCH_COMMANDS,
  ASSISTANT_TOGGLE_COMMAND,
];
export const ASSISTANT_TOGGLE_DEFAULT_KEY = "mod+shift+.";

const isKeybindingCommand = Schema.is(KeybindingCommand);

/** The when-variable that is true while `appId` is the active app. */
export const appWhenVariable = (appId: string): string => `app.${appId}`;

/** The when-context for `activeApp`: every app's variable, one of them true. */
export function appWhenContext(
  activeApp: string,
  apps: ReadonlyArray<string>,
): Record<string, boolean> {
  return Object.fromEntries(
    [...new Set([...apps, activeApp])].map((app) => [appWhenVariable(app), app === activeApp]),
  );
}

/** The when-variables the shell defines, for the Keybindings page's editor. */
export function shellWhenVariables(apps: ReadonlyArray<string>): ReadonlyArray<string> {
  return apps.map(appWhenVariable);
}

/**
 * Default rules the shell adds to T3's: app switching (combined profile only),
 * the assistant toggle, and each module command's default key scoped to its
 * app. A user's own rule for the same command replaces the default.
 */
export function shellDefaultKeybindings(input: {
  readonly kind: ShellKind;
  readonly modules: ReadonlyArray<Pick<WebModule, "id" | "commands">>;
}): ReadonlyArray<KeybindingRule> {
  const rules: Array<KeybindingRule> = [];
  if (input.kind === "combined") {
    APP_SWITCH_COMMANDS.forEach((command, index) => {
      rules.push({ key: `mod+${index + 1}`, command });
    });
  }
  if (input.kind !== "code") {
    rules.push({ key: ASSISTANT_TOGGLE_DEFAULT_KEY, command: ASSISTANT_TOGGLE_COMMAND });
  }
  for (const module of input.modules) {
    for (const command of module.commands) {
      if (command.defaultKey === undefined || !isKeybindingCommand(command.id)) continue;
      const app = appWhenVariable(module.id);
      rules.push({
        key: command.defaultKey,
        command: command.id,
        when: command.when ? `${app} && (${command.when})` : app,
      });
    }
  }
  return rules;
}

/** Shell defaults join a resolved config below it: a custom rule for the same command wins. */
export function mergeShellKeybindings(
  resolved: ResolvedKeybindingsConfig,
  defaults: ReadonlyArray<KeybindingRule>,
): ResolvedKeybindingsConfig {
  const overridden = new Set<string>(resolved.map((binding) => binding.command));
  const retained = compileResolvedKeybindingsConfig(
    defaults.filter((rule) => !overridden.has(rule.command)),
  );
  return retained.length === 0 ? resolved : [...retained, ...resolved];
}

/**
 * Renames commands a module used to call differently, so a prefix change
 * (`go.inbox` → `mail.go.inbox`) keeps users' custom bindings. Rules whose
 * renamed command is not a known command are dropped.
 */
export function applyKeybindingCommandAliases<Rule extends { readonly command: string }>(
  rules: ReadonlyArray<Rule>,
  aliases: Readonly<Record<string, string>>,
): ReadonlyArray<Rule> {
  return rules.flatMap((rule) => {
    const renamed = aliases[rule.command];
    if (renamed === undefined) return [rule];
    return isKeybindingCommand(renamed) ? [{ ...rule, command: renamed }] : [];
  });
}

export function moduleKeybindingAliases(
  modules: ReadonlyArray<Pick<WebModule, "keybindingAliases">>,
): Readonly<Record<string, string>> {
  return Object.assign({}, ...modules.map((module) => module.keybindingAliases ?? {}));
}

/** Which Keybindings chip a command belongs to: `global`, `code` (T3's own), or a module id. */
export function keybindingCommandApp(
  command: string,
  moduleIds: ReadonlyArray<string>,
): "global" | "code" | string {
  if (SHELL_GLOBAL_COMMANDS.includes(command)) return "global";
  const prefix = command.split(".")[0] ?? "";
  return moduleIds.includes(prefix) ? prefix : "code";
}
