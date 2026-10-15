import { useEffect } from "react";
import { useAtomValue } from "@effect/atom-react";
import { DEFAULT_CALENDAR_SHORTCUTS, type CalendarShortcuts } from "@otterware/calendar-contracts";
import { useModuleTarget } from "../browser/runtime";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";

/** Preserve existing Calendar custom keys once, without replacing host bindings. */
export function useCalendarKeybindingMigration(shortcuts: CalendarShortcuts | undefined) {
  const target = useModuleTarget();
  const environmentId = target._tag === "environment" ? target.environmentId : null;
  const config = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  const allowed = useAtomValue(serverEnvironment.upsertKeybinding.permissionAtom(environmentId));
  const upsert = useAtomCommand(serverEnvironment.upsertKeybinding, { reportFailure: false });
  useEffect(() => {
    if (!environmentId || !config || !allowed || !shortcuts) return;
    const marker = `otterware.calendar.keybindings-migrated:${environmentId}`;
    if (localStorage.getItem(marker)) return;
    let stopped = false;
    void (async () => {
      for (const id of Object.keys(DEFAULT_CALENDAR_SHORTCUTS) as (keyof CalendarShortcuts)[]) {
        if (stopped) return;
        const key = shortcuts[id].trim();
        const command = `calendar.${id}` as const;
        if (
          !key ||
          key === DEFAULT_CALENDAR_SHORTCUTS[id] ||
          config.keybindings.some((rule) => rule.command === command)
        )
          continue;
        const result = await upsert({
          environmentId,
          input: { command, key, when: "app.calendar && !editableFocus" },
        });
        if (result._tag === "Failure") return;
      }
      if (!stopped) localStorage.setItem(marker, "true");
    })();
    return () => {
      stopped = true;
    };
  }, [environmentId, config, allowed, shortcuts, upsert]);
}
