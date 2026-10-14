/**
 * What the shell has selected per module: the active space (rail item) and
 * whether the Otterware Assistant is open beside the page. Modules read the
 * active space with `useActiveSpaceId`; the host writes it from the rail.
 * Selections are client scope, like Code's own rail space.
 */
import * as Schema from "effect/Schema";

import { createClientStore } from "./clientStore.ts";

interface ShellSelectionState {
  readonly assistantRequest: { moduleId: string; command: "newChat" | "previousChat" } | null;
  readonly requestAssistant: (moduleId: string, command: "newChat" | "previousChat") => void;
  readonly activeSpaceByModule: Readonly<Record<string, string>>;
  readonly assistantOpenByModule: Readonly<Record<string, boolean>>;
  readonly selectSpace: (moduleId: string, spaceId: string | null) => void;
  readonly setAssistantOpen: (moduleId: string, open: boolean) => void;
}

const PersistedSelection = Schema.Struct({
  activeSpaceByModule: Schema.Record(Schema.String, Schema.String),
});

export const useShellSelection = createClientStore<
  ShellSelectionState,
  typeof PersistedSelection.Type
>(
  (set) => ({
    assistantRequest: null,
    requestAssistant: (moduleId, command) =>
      set((state) => ({
        assistantRequest: { moduleId, command },
        assistantOpenByModule: { ...state.assistantOpenByModule, [moduleId]: true },
      })),
    activeSpaceByModule: {},
    assistantOpenByModule: {},
    selectSpace: (moduleId, spaceId) =>
      set((state) => {
        const { [moduleId]: _previous, ...rest } = state.activeSpaceByModule;
        return {
          activeSpaceByModule: spaceId === null ? rest : { ...rest, [moduleId]: spaceId },
        };
      }),
    setAssistantOpen: (moduleId, open) =>
      set((state) => ({
        assistantOpenByModule: { ...state.assistantOpenByModule, [moduleId]: open },
      })),
  }),
  {
    key: "otterware:shell:selection:v1",
    scope: "client",
    schema: PersistedSelection,
    pick: (state) => ({ activeSpaceByModule: state.activeSpaceByModule }),
    restore: (slice) => ({ activeSpaceByModule: slice.activeSpaceByModule }),
  },
);

/** The module's active space id, or null when none is selected (its default). */
export function useActiveSpaceId(moduleId: string): string | null {
  return useShellSelection((state) => state.activeSpaceByModule[moduleId] ?? null);
}

export function useAssistantOpen(moduleId: string): boolean {
  return useShellSelection((state) => state.assistantOpenByModule[moduleId] ?? false);
}
