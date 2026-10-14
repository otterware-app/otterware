import type { WebModuleCommand } from "@otterware/module-kit/web";
import {
  KEYBINDING_COMMANDS,
  DEFAULT_KEYBINDINGS,
  commandLabel,
} from "./content/main/keybindings/commands";
import { activeProfile } from "@otterware/profiles/active";

const shared: Readonly<Record<string, string>> = {
  "agent.toggle": "assistant.toggle",
  "agent.newTab": "assistant.newChat",
  "agent.newChat": "assistant.newChat",
  "agent.previousTab": "assistant.previousChat",
  "agent.sendQueuedNow": "thread.steerQueuedMessage",
  "agent.editQueued": "thread.editQueuedMessage",
  "sidebar.toggle": "sidebar.toggle",
  "commandPalette.toggle": "commandPalette.toggle",
  "modelPicker.toggle": "modelPicker.toggle",
  "composer.mode": "composer.mode",
};
export const mailCommandId = (id: string): `${string}.${string}` =>
  (shared[id] ??
    (id.startsWith("modelPicker.")
      ? id
      : id.startsWith("mail.")
        ? id
        : `mail.${id}`)) as `${string}.${string}`;
export const mailKeybindingAliases = Object.fromEntries(
  KEYBINDING_COMMANDS.map((id) => [id, mailCommandId(id)]),
);
export const mailCommands: ReadonlyArray<WebModuleCommand> = KEYBINDING_COMMANDS.filter((id) =>
  mailCommandId(id).startsWith("mail."),
).map((id) => {
  const bindings = DEFAULT_KEYBINDINGS.filter((rule) => rule.command === id);
  const binding = bindings[0];
  // The combined shell reserves Mod+1…4 for switching apps.
  const defaultKey =
    id.startsWith("mailbox.jump.") && activeProfile.codeVisible
      ? binding?.key.replace("mod+", "mod+alt+")
      : binding?.key;
  return {
    id: mailCommandId(id),
    title: commandLabel(id),
    searchTerms: ["mail", id],
    ...(defaultKey
      ? {
          defaultKey,
          defaultKeys: bindings.map((rule) =>
            id.startsWith("mailbox.jump.") && activeProfile.codeVisible
              ? rule.key.replace("mod+", "mod+alt+")
              : rule.key,
          ),
        }
      : {}),
    ...(binding?.when ? { when: binding.when } : {}),
    run: async () => {
      const { runMailCommand } = await import("./content/main/keybindings/dispatch");
      runMailCommand(id);
    },
  };
});

export function encodeLabelCommand(name: string) {
  return `mail.label.move.${Array.from(new TextEncoder().encode(name), (byte) => byte.toString(16).padStart(2, "0")).join("")}` as const;
}
export function decodeLabelCommand(command: string): string | null {
  const encoded = command.replace(/^mail\.label\.move\./, "");
  if (encoded === command || !/^(?:[0-9a-f]{2})+$/.test(encoded)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(encoded.match(/../g) ?? [], (hex) => parseInt(hex, 16)),
    );
  } catch {
    return null;
  }
}
export function renamedLabelCommand(command: string, from: string, to: string) {
  const label = decodeLabelCommand(command);
  return label !== null && (label === from || label.startsWith(`${from}/`))
    ? encodeLabelCommand(`${to}${label.slice(from.length)}`)
    : null;
}
export async function runDynamicMailCommand(command: string): Promise<void> {
  const label = decodeLabelCommand(command);
  if (label === null) return;
  const { runMailCommand } = await import("./content/main/keybindings/dispatch");
  runMailCommand(`label.move:${label}`);
}
