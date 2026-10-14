import { useAtomValue } from "@effect/atom-react";
import { EnvironmentId } from "@t3tools/contracts";
import { useAtomCommand } from "~/state/use-atom-command";
import { primaryServerKeybindingsAtom, serverEnvironment } from "~/state/server";
import {
  shortcutToKeybindingInput,
  whenAstToExpression,
} from "~/components/settings/KeybindingsSettings.logic";
import { renamedLabelCommand } from "./mailCommands";
import { mailHost } from "./content/host/bridge";

/** Label renames update the user's host binding, including shortcuts for nested labels. */
export function useRenameLabelShortcuts() {
  const bindings = useAtomValue(primaryServerKeybindingsAtom);
  const upsert = useAtomCommand(serverEnvironment.upsertKeybinding);
  return async (from: string, to: string) => {
    const environmentId = mailHost().environmentId;
    if (environmentId.startsWith("browser:") || from === to) return;
    for (const binding of bindings) {
      const command = renamedLabelCommand(binding.command, from, to);
      if (command === null) continue;
      const key = shortcutToKeybindingInput(binding.shortcut);
      const when = whenAstToExpression(binding.whenAst);
      const original = { command: binding.command, key, ...(when ? { when } : {}) };
      await upsert({
        environmentId: EnvironmentId.make(environmentId),
        input: { ...original, command, replace: original },
      });
    }
  };
}
