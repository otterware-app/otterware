/**
 * What the user is looking at on a module page, published for the side chat
 * (and Home's thread starters) to send along as a `module-page` context
 * record. A page calls `useModulePageContext(...)` with its current
 * selection; the chat reads `useCurrentModulePageContext()`.
 */
import { useEffect } from "react";
import { create } from "zustand";

/** The composer context record kind every module page context is sent as. */
export const MODULE_PAGE_CONTEXT_KIND = "module-page";

/** One thing on screen the agent can be told about, e.g. a mail thread or an event. */
export interface ModulePageRef {
  /** Module-defined, e.g. `mail.thread`, `calendar.event`, `drive.file`. */
  readonly kind: string;
  readonly id: string;
  readonly label?: string;
  /** A URL or route the agent or user can follow back to it. */
  readonly href?: string;
}

export interface ModulePageContext {
  readonly module: string;
  readonly title: string;
  readonly refs: ReadonlyArray<ModulePageRef>;
}

interface ModulePageContextState {
  readonly context: ModulePageContext | null;
  readonly publish: (context: ModulePageContext | null) => void;
}

const useStore = create<ModulePageContextState>((set) => ({
  context: null,
  publish: (context) => set({ context }),
}));

/**
 * Publishes `context` while the calling page is mounted and `active`; pass
 * null to clear it. Compared by value, so pages can build it inline.
 */
export function useModulePageContext(context: ModulePageContext | null, active = true): void {
  const publish = useStore((state) => state.publish);
  const key = context === null ? null : JSON.stringify(context);
  useEffect(() => {
    if (!active) return;
    const published: ModulePageContext | null = key === null ? null : JSON.parse(key);
    publish(published);
    return () => {
      if (useStore.getState().context === published) publish(null);
    };
  }, [active, key, publish]);
}

export function useCurrentModulePageContext(): ModulePageContext | null {
  return useStore((state) => state.context);
}
