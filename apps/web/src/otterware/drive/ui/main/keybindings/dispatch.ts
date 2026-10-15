import { useEffect, useEffectEvent } from "react";
import { useDriveHost } from "../../host";
import { useDriveStore } from "../../driveStore";
import type { KeybindingCommand } from "./commands";

export type CommandHandler = () => boolean | void;
/** The shell resolves keys and palette entries; the content registers only actions. */
export function useCommandHandlers(map: Partial<Record<KeybindingCommand, CommandHandler>>) {
  const { active } = useDriveHost();
  const command = useDriveStore((state) => state.pendingCommand);
  const run = useEffectEvent((id: string) => {
    const handler = map[id as KeybindingCommand];
    if (handler) {
      handler();
      useDriveStore.setState({ pendingCommand: null });
    }
  });
  useEffect(() => {
    if (active && command) run(command);
  }, [active, command]);
}

export function isOverlayOpen() {
  return (
    document.querySelector(
      '[data-slot="dialog-popup"], [aria-modal="true"], [role="alertdialog"], [role="menu"], [role="listbox"]:not([aria-label="Results"])',
    ) !== null
  );
}
