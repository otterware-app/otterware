import { KeybindingCommand, type KeybindingRule } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { mailCommandId, encodeLabelCommand } from "./mailCommands";

/** Existing host choices win; only Mail's legacy commands are imported. */
const isKeybindingCommand = Schema.is(KeybindingCommand);
export function migratedMailKeybindings(
  rules: ReadonlyArray<{ key: string; command: string; when?: string | undefined }>,
  existing: ReadonlySet<string>,
): KeybindingRule[] {
  return rules.flatMap((rule) => {
    const label = /^label\.(?:move|toggle):(.+)$/.exec(rule.command)?.[1];
    const command = label
      ? encodeLabelCommand(label)
      : mailCommandId(rule.command.replace(/^assistant\./, "agent."));
    if (!isKeybindingCommand(command) || existing.has(command)) return [];
    const when = rule.when
      ?.replace(/\b(?:assistantOpen|agentOpen)\b/g, "!terminalFocus")
      .replace(
        /\beditableFocus\b/g,
        command === "thread.editQueuedMessage" ? "composerFocus" : "editableFocus",
      );
    return [
      {
        key: rule.key,
        command,
        ...(command.startsWith("mail.")
          ? { when: when ? `app.mail && (${when})` : "app.mail" }
          : when
            ? { when }
            : {}),
      },
    ];
  });
}
