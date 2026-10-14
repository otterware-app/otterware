/**
 * The shell's keybindings (ADR 0020): T3's resolved config plus the shell's
 * defaults (app switching, the Otterware Assistant, module commands scoped to
 * their app), the `app.*` when-context, the handler that runs shell and module
 * commands, and the Keybindings page's chips. Upstream's own handlers keep
 * resolving their commands against the server config; this one only acts when
 * the merged config resolves to a shell or module command.
 */
import {
  APP_SWITCH_COMMANDS,
  ASSISTANT_TOGGLE_COMMAND,
  applyKeybindingCommandAliases,
  appWhenContext,
  keybindingCommandApp,
  mergeShellKeybindings,
  moduleKeybindingAliases,
  modulePath,
  shellDefaultKeybindings,
  useShellSelection,
  useModuleCommandContext,
  type WebModuleCommand,
} from "@otterware/module-kit/web";
import { useAtomValue } from "@effect/atom-react";
import type { ResolvedKeybindingsConfig } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { Atom } from "effect/reactivity";
import { useEffect, useState } from "react";

import type {
  KeybindingGroup,
  KeybindingRow,
} from "../components/settings/KeybindingsSettings.logic";
import { Toggle, ToggleGroup } from "../components/ui/toggle-group";
import { resolveShortcutCommand } from "../keybindings";
import { isEditableFocused } from "../lib/editableFocus";
import { isTerminalFocused } from "../lib/terminalFocus";
import { primaryServerKeybindingsAtom } from "../state/server";
import { moduleRegistry } from "./registry";
import { useSwitchApp } from "./ShellRail";
import { SHELL_APPS, SWITCHER_APPS, shellKind, useShellApp, useShellAppStore } from "./shell";

const SHELL_DEFAULT_KEYBINDINGS = shellDefaultKeybindings({
  kind: shellKind,
  modules: moduleRegistry.modules,
});
const COMMAND_ALIASES = moduleKeybindingAliases(moduleRegistry.modules);
const MODULE_COMMANDS = new Map<string, { module: string; command: WebModuleCommand }>(
  moduleRegistry.modules.flatMap((module) =>
    module.commands.map((command) => [command.id, { module: module.id, command }] as const),
  ),
);

/** Aliased commands renamed, shell defaults merged below the user's rules. */
export function withShellKeybindings(
  resolved: ResolvedKeybindingsConfig,
): ResolvedKeybindingsConfig {
  const scoped = applyKeybindingCommandAliases(resolved, COMMAND_ALIASES).map((binding) => {
    const module = moduleRegistry.byId(binding.command.split(".")[0] ?? "");
    if (!module) return binding;
    const app = { type: "identifier", name: `app.${module.id}` } as const;
    return {
      ...binding,
      whenAst: binding.whenAst ? { type: "and" as const, left: app, right: binding.whenAst } : app,
    };
  });
  return mergeShellKeybindings(scoped, SHELL_DEFAULT_KEYBINDINGS);
}

const shellKeybindingsAtom = Atom.make((get) =>
  withShellKeybindings(get(primaryServerKeybindingsAtom)),
).pipe(Atom.withLabel("otterware-shell-keybindings"));

export function useShellKeybindings(): ResolvedKeybindingsConfig {
  return useAtomValue(shellKeybindingsAtom);
}

/** `app.<id>` true for the active app; spread into a shortcut's match context. */
function useAppWhenContext(): Record<string, boolean> {
  return appWhenContext(useShellApp(), SHELL_APPS);
}

const hasModifier = (event: KeyboardEvent) => event.metaKey || event.ctrlKey || event.altKey;

/**
 * Runs shell and module commands from the keyboard. Mount once inside the
 * router. Plain keys (`e`) stay with text fields; chords fire everywhere but
 * the terminal and the keybinding recorder.
 */
export function ShellKeybindings() {
  const keybindings = useShellKeybindings();
  const navigate = useNavigate();
  const switchApp = useSwitchApp();
  const activeApp = useShellApp();

  useEffect(() => {
    let pending: { bindings: ResolvedKeybindingsConfig; at: number } | null = null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("[data-keybinding-capture]")) return;
      if (isTerminalFocused()) return;
      const editableFocus = isEditableFocused(event.target);
      if (editableFocus && !hasModifier(event)) return;
      const options = {
        context: {
          ...appWhenContext(activeApp, SHELL_APPS),
          ...useModuleCommandContext.getState().contexts[activeApp],
          editableFocus,
          dialogOpen: Array.from(
            document.querySelectorAll(
              '[role="dialog"], [role="menu"], [data-slot="popover-popup"]',
            ),
          ).some((element) => !element.closest('[data-slot="toast-viewport"]')),
        },
      };
      const continuation = pending && Date.now() - pending.at < 1500 ? pending.bindings : [];
      pending = null;
      let command =
        resolveShortcutCommand(event, continuation, options) ??
        resolveShortcutCommand(event, keybindings, options);
      if (command === null && !editableFocus) {
        const sequences = keybindings.filter(
          (binding) =>
            MODULE_COMMANDS.has(binding.command) && /^\S+ \S+$/.test(binding.shortcut.key),
        );
        const candidates = sequences.filter(
          (binding) =>
            resolveShortcutCommand(
              event,
              [
                {
                  ...binding,
                  shortcut: { ...binding.shortcut, key: binding.shortcut.key.split(" ")[0]! },
                },
              ],
              options,
            ) !== null,
        );
        if (candidates.length) {
          pending = {
            at: Date.now(),
            bindings: candidates.map((binding) => ({
              ...binding,
              shortcut: { ...binding.shortcut, key: binding.shortcut.key.split(" ")[1]! },
            })),
          };
          event.preventDefault();
          return;
        }
      }

      if (command === null) return;
      const run = shellCommandRunner(command);
      if (run === null) return;
      event.preventDefault();
      event.stopPropagation();
      run();
    };
    const shellCommandRunner = (command: string): (() => void) | null => {
      const switchIndex = (APP_SWITCH_COMMANDS as ReadonlyArray<string>).indexOf(command);
      if (switchIndex !== -1) {
        const app = SWITCHER_APPS[switchIndex];
        return app === undefined ? null : () => switchApp(app);
      }
      if (command === ASSISTANT_TOGGLE_COMMAND) {
        const module = moduleRegistry.byId(useShellAppStore.getState().activeApp);
        if (module === null || !module.sideChat) return null;
        return () => {
          const selection = useShellSelection.getState();
          selection.setAssistantOpen(
            module.id,
            !(selection.assistantOpenByModule[module.id] ?? false),
          );
        };
      }
      if (command === "assistant.newChat" || command === "assistant.previousChat") {
        const module = moduleRegistry.byId(activeApp);
        return module?.sideChat
          ? () =>
              useShellSelection
                .getState()
                .requestAssistant(
                  module.id,
                  command === "assistant.newChat" ? "newChat" : "previousChat",
                )
          : null;
      }
      const entry = MODULE_COMMANDS.get(command);
      if (entry === undefined) {
        const module = moduleRegistry.byId(command.split(".")[0] ?? "");
        return module?.runCommand
          ? () => {
              void module.runCommand?.(command);
            }
          : null;
      }
      return () => void runModuleCommand(entry.module, entry.command, navigate);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeApp, keybindings, navigate, switchApp]);
  return null;
}

/** What a module command does: its own `run`, else navigating below the module's page. */
export async function runModuleCommand(
  moduleId: string,
  command: WebModuleCommand,
  navigate: ReturnType<typeof useNavigate>,
): Promise<void> {
  if (command.run) {
    if (useShellAppStore.getState().activeApp !== moduleId)
      await navigate({ href: modulePath(moduleId) });
    await command.run();
    return;
  }
  const path = modulePath(moduleId);
  await navigate({ href: command.subpath ? `${path}/${command.subpath}` : path });
}

// -- Keybindings page -----------------------------------------------------------

export type KeybindingsChip = "all" | "global" | "code" | (string & {});

// The chip is one shared value read through useState and an effect rather
// than a store hook, so the page still renders under a hook harness that
// replaces React's hooks (KeybindingsSettings.environment.test.tsx).
let keybindingsChip: KeybindingsChip = "all";
const chipListeners = new Set<(chip: KeybindingsChip) => void>();

/** A module's settings group opens the Keybindings page with its chip selected. */
export function setKeybindingsChip(chip: KeybindingsChip): void {
  keybindingsChip = chip;
  for (const listener of chipListeners) listener(chip);
}

export function useKeybindingsChip(): KeybindingsChip {
  const [chip, setChip] = useState(keybindingsChip);
  useEffect(() => {
    chipListeners.add(setChip);
    return () => {
      chipListeners.delete(setChip);
    };
  }, []);
  return chip;
}

const MODULE_IDS = moduleRegistry.modules.map((module) => module.id);

/** Rows the page shows: the chip's app, minus app switching outside the combined profile. */
export function filterShellKeybindingRows(
  rows: ReadonlyArray<KeybindingRow>,
  chip: KeybindingsChip,
): ReadonlyArray<KeybindingRow> {
  return rows.filter((row) => {
    if (
      shellKind !== "combined" &&
      (APP_SWITCH_COMMANDS as ReadonlyArray<string>).includes(row.command)
    ) {
      return false;
    }
    return chip === "all" || keybindingCommandApp(row.command, MODULE_IDS) === chip;
  });
}

/** Module rows leave upstream's "Other" section for one section per module. */
export function shellKeybindingGroups(
  groups: ReadonlyArray<KeybindingGroup>,
): ReadonlyArray<KeybindingGroup> {
  return groups.flatMap((group) => {
    if (group.id !== "other") return [group];
    const rest: Array<KeybindingRow> = [];
    const byModule = new Map<string, Array<KeybindingRow>>();
    for (const row of group.rows) {
      const app = keybindingCommandApp(row.command, MODULE_IDS);
      if (app === "code") rest.push(row);
      else {
        const bucket = byModule.get(app) ?? [];
        bucket.push(row);
        byModule.set(app, bucket);
      }
    }
    return [
      ...(byModule.has("global")
        ? [{ id: "global", title: "Global", rows: byModule.get("global")! }]
        : []),
      ...MODULE_IDS.filter((id) => byModule.has(id)).map((id) => ({
        id,
        title: moduleRegistry.byId(id)?.label ?? id,
        rows: byModule.get(id)!,
      })),
      ...(rest.length > 0 ? [{ ...group, rows: rest }] : []),
    ];
  });
}

/** All / Global / Code / Mail / … ; the combined profile only. */
export function KeybindingsChips() {
  const chip = useKeybindingsChip();
  if (shellKind !== "combined") return null;
  const chips: ReadonlyArray<{ id: KeybindingsChip; label: string }> = [
    { id: "all", label: "All" },
    { id: "global", label: "Global" },
    { id: "code", label: "Code" },
    ...moduleRegistry.modules
      .filter((module) => module.commands.length > 0)
      .map((module) => ({ id: module.id, label: module.label })),
  ];
  return (
    <ToggleGroup
      aria-label="Show keybindings for"
      value={[chip]}
      onValueChange={(value) => {
        const next = value[0];
        if (typeof next === "string") setKeybindingsChip(next);
      }}
    >
      {chips.map((entry) => (
        <Toggle key={entry.id} value={entry.id}>
          {entry.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
