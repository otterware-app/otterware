import { mailDocument } from "../../host/dom";

import { useLatest } from "../use-latest";
import { useEffect } from "react";
import { labelMoveName, type CommandHandlerKey, type KeybindingCommand } from "./commands";
import { evaluateWhen, matchesStroke, type WhenContext } from "./keys";
import { getKeybindings, setHostKeybindings } from "./store";
import { useShellKeybindings } from "../../../../shellKeybindings";
import { useModuleCommandContext } from "@otterware/module-kit/web";
import { isOverlayOpen } from "../gmail/keyboard";

/**
 * One window-level dispatcher resolves every keydown against the live
 * keybindings, and components register what each command does. Resolution
 * walks rules last → first (custom rules win over defaults); a handler that
 * returns `false` passes, so the next matching rule gets a chance.
 *
 * Context keys come from the event (editableFocus, dialogOpen) plus values
 * components publish with `useKeybindingContext` (settingsOpen, messageOpen).
 */

/** Return `false` when the command doesn't apply right now. `arg` is the
    label name for `label.move:<name>` rules. */
export type CommandHandler = (event: KeyboardEvent, arg?: string) => boolean | void;

let pendingCommand: KeybindingCommand | null = null;
const handlers = new Map<CommandHandlerKey, { run: CommandHandler }[]>();

/** Where a rule's command is handled, plus its argument (label moves). */
function handlerFor(command: KeybindingCommand): {
  key: CommandHandlerKey;
  arg?: string | undefined;
} {
  const labelName = labelMoveName(command);
  if (labelName !== null) return { key: "label.move", arg: labelName };
  return { key: command as CommandHandlerKey };
}

const published = new Map<string, boolean>();

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]') !==
      null
  );
}

export function keybindingContext(event?: KeyboardEvent): WhenContext {
  const context: WhenContext = {
    editableFocus: isEditable(
      event?.composedPath()[0] ?? event?.target ?? mailDocument.activeElement,
    ),
    dialogOpen: isOverlayOpen(),
  };
  context["app.mail"] = true;
  for (const [key, value] of published) context[key] = value;
  return context;
}

function run(command: KeybindingCommand, event: KeyboardEvent): boolean {
  const { key, arg } = handlerFor(command);
  const list = handlers.get(key);
  if (!list?.length) return false;
  // The most recently mounted owner handles it.
  return list[list.length - 1]!.run(event, arg) !== false;
}

/** The host resolves keys; this bridge only invokes the mounted content handlers. */
export function runMailCommand(command: KeybindingCommand): boolean {
  const handled = run(command, new KeyboardEvent("keydown"));
  if (!handled && handlers.size === 0) pendingCommand = command;
  return handled;
}
export function useKeybindingDispatcher(): void {
  const bindings = useShellKeybindings();
  useEffect(() => {
    setHostKeybindings(bindings);
  }, [bindings]);
}

/** Registers what commands do while the calling component is mounted. */
export function useCommandHandlers(map: Partial<Record<CommandHandlerKey, CommandHandler>>): void {
  const ref = useLatest(map);
  const commands = (Object.keys(map) as CommandHandlerKey[]).sort().join(",");
  useEffect(() => {
    const entries = (commands ? commands.split(",") : []).map((c) => {
      const command = c as CommandHandlerKey;
      const entry = { run: (e: KeyboardEvent, arg?: string) => ref.current[command]?.(e, arg) };
      handlers.set(command, [...(handlers.get(command) ?? []), entry]);
      return [command, entry] as const;
    });
    if (pendingCommand !== null && run(pendingCommand, new KeyboardEvent("keydown")))
      pendingCommand = null;
    return () => {
      for (const [command, entry] of entries) {
        handlers.set(
          command,
          (handlers.get(command) ?? []).filter((e) => e !== entry),
        );
      }
    };
  }, [commands, ref]);
}

/** Publishes a `when` context key (e.g. messageOpen) while mounted. */
export function useKeybindingContext(name: string, value: boolean): void {
  useEffect(() => {
    published.set(name, value);
    useModuleCommandContext.setState((s) => ({
      contexts: { ...s.contexts, mail: { ...s.contexts.mail, [name]: value } },
    }));
    return () => {
      published.delete(name);
      useModuleCommandContext.setState((s) => ({
        contexts: { ...s.contexts, mail: { ...s.contexts.mail, [name]: false } },
      }));
    };
  }, [name, value]);
}

/** For element-local keys (e.g. ⌘↩ inside a composer): does the event trigger `command`? */
export function matchesCommand(event: KeyboardEvent, command: KeybindingCommand): boolean {
  const context = keybindingContext(event);
  return getKeybindings().resolved.some(
    (r) =>
      r.rule.command === command &&
      r.shortcut.length === 1 &&
      matchesStroke(event, r.shortcut[0]!) &&
      evaluateWhen(r.whenAst, context),
  );
}
