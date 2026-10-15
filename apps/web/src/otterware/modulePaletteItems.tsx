/**
 * Command palette entries from the registry: "Go to <module>" for every
 * module page (with its app-switch shortcut in the combined profile), each
 * module's own commands, and the Otterware Assistant toggle. `CommandPalette`
 * adds them with one call.
 */
import {
  APP_SWITCH_COMMANDS,
  ASSISTANT_TOGGLE_COMMAND,
  modulePath,
  useShellSelection,
} from "@otterware/module-kit/web";
import type { KeybindingCommand } from "@t3tools/contracts";
import type { useNavigate } from "@tanstack/react-router";
import { MessagesSquareIcon } from "lucide-react";

import type { CommandPaletteActionItem } from "../components/CommandPalette.logic";
import { ITEM_ICON_CLASS } from "../components/CommandPalette.logic";
import { ASSISTANT_LABEL } from "./ModulePageLayout";
import { moduleRegistry } from "./registry";
import { shellKind, SWITCHER_APPS, useShellAppStore } from "./shell";
import { runModuleCommand } from "./shellKeybindings";

const switchCommandFor = (moduleId: string): KeybindingCommand | undefined => {
  if (shellKind !== "combined") return undefined;
  const index = SWITCHER_APPS.indexOf(moduleId);
  return index === -1 ? undefined : APP_SWITCH_COMMANDS[index];
};

export function moduleCommandPaletteItems(
  navigate: ReturnType<typeof useNavigate>,
): Array<CommandPaletteActionItem> {
  const items = moduleRegistry.modules.flatMap((module): Array<CommandPaletteActionItem> => {
    const Icon = module.icon;
    const shortcutCommand = switchCommandFor(module.id);
    return [
      {
        kind: "action",
        value: `action:module:${module.id}`,
        searchTerms: ["go to", "open", "switch", ...module.searchTerms],
        title: `Go to ${module.label}`,
        icon: <Icon className={ITEM_ICON_CLASS} />,
        ...(shortcutCommand === undefined ? {} : { shortcutCommand }),
        run: async () => {
          await navigate({ href: modulePath(module.id) });
        },
      },
      ...[...module.commands, ...(module.paletteCommands?.() ?? [])].map(
        (command): CommandPaletteActionItem => ({
          kind: "action",
          value: `action:module:${command.id}`,
          searchTerms: [module.label.toLowerCase(), ...command.searchTerms],
          title: command.title,
          icon: <Icon className={ITEM_ICON_CLASS} />,
          shortcutCommand: command.id as KeybindingCommand,
          run: () => runModuleCommand(module.id, command, navigate),
        }),
      ),
    ];
  });
  if (shellKind !== "code") {
    items.push({
      kind: "action",
      value: "action:module:assistant.toggle",
      searchTerms: ["assistant", "otterware", "chat", "side chat", "agent"],
      title: `Toggle ${ASSISTANT_LABEL}`,
      icon: <MessagesSquareIcon className={ITEM_ICON_CLASS} />,
      shortcutCommand: ASSISTANT_TOGGLE_COMMAND,
      run: async () => {
        const module = moduleRegistry.byId(useShellAppStore.getState().activeApp);
        if (module === null || !module.sideChat) return;
        const selection = useShellSelection.getState();
        selection.setAssistantOpen(
          module.id,
          !(selection.assistantOpenByModule[module.id] ?? false),
        );
      },
    });
  }
  if (shellKind !== "code")
    for (const command of ["newChat", "previousChat"] as const)
      items.push({
        kind: "action",
        value: `action:module:assistant.${command}`,
        searchTerms: ["assistant", "otterware", "agent", "chat"],
        title: `${command === "newChat" ? "New" : "Previous"} Otterware Assistant chat`,
        icon: <MessagesSquareIcon className={ITEM_ICON_CLASS} />,
        shortcutCommand: `assistant.${command}`,
        run: async () => {
          const module = moduleRegistry.byId(useShellAppStore.getState().activeApp);
          if (module?.sideChat) useShellSelection.getState().requestAssistant(module.id, command);
        },
      });
  return items;
}
