/**
 * Command palette entries from the registry: "Go to <module>" for every
 * module page, plus each module's own commands (navigated to below its page).
 * `CommandPalette` adds them with one call.
 */
import { modulePath } from "@otterware/module-kit/web";
import type { useNavigate } from "@tanstack/react-router";

import type { CommandPaletteActionItem } from "../components/CommandPalette.logic";
import { ITEM_ICON_CLASS } from "../components/CommandPalette.logic";
import { moduleRegistry } from "./registry";

export function moduleCommandPaletteItems(
  navigate: ReturnType<typeof useNavigate>,
): Array<CommandPaletteActionItem> {
  return moduleRegistry.modules.flatMap((module): Array<CommandPaletteActionItem> => {
    const Icon = module.icon;
    const path = modulePath(module.id);
    return [
      {
        kind: "action",
        value: `action:module:${module.id}`,
        searchTerms: ["go to", "open", ...module.searchTerms],
        title: `Go to ${module.label}`,
        icon: <Icon className={ITEM_ICON_CLASS} />,
        run: async () => {
          await navigate({ href: path });
        },
      },
      ...module.commands.map((command): CommandPaletteActionItem => ({
        kind: "action",
        value: `action:module:${module.id}:${command.id}`,
        searchTerms: [module.label.toLowerCase(), ...command.searchTerms],
        title: command.title,
        icon: <Icon className={ITEM_ICON_CLASS} />,
        run: async () => {
          await navigate({ href: command.subpath ? `${path}/${command.subpath}` : path });
        },
      })),
    ];
  });
}
