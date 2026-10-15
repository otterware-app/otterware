/**
 * The shell's view of this build (ADR 0020): which profile kind it runs as,
 * which apps the rail's switcher offers, and which app owns the shell for a
 * location. Code is the host, not a module, so it appears here as the app
 * `code`; everything else is a module id from the registry.
 */
import { HOME_MODULE_ID, type ModuleLocation, type ShellKind } from "@otterware/module-kit/web";
import { activeProfile } from "@otterware/profiles/active";
import { useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { create } from "zustand";

import { isSidebarUtilityPage } from "../components/sidebar/mainAppLocation";
import { moduleRegistry } from "./registry";

export const shellKind: ShellKind =
  moduleRegistry.modules.length === 0
    ? "code"
    : activeProfile.codeVisible
      ? "combined"
      : "standalone";

export type ShellApp = "code" | (string & {});

/** Home sits above the switcher in the combined rail; absent in other profiles. */
export const homeModule = shellKind === "combined" ? moduleRegistry.byId(HOME_MODULE_ID) : null;

/** The switcher's apps in order: Code, then the profile's modules other than Home. */
export const SWITCHER_APPS: ReadonlyArray<ShellApp> = [
  ...(activeProfile.codeVisible ? ["code" as const] : []),
  ...moduleRegistry.modules.filter((module) => module.id !== HOME_MODULE_ID).map((m) => m.id),
];

/** Every app a keybinding can be scoped to, including Home. */
export const SHELL_APPS: ReadonlyArray<ShellApp> = [
  ...(activeProfile.codeVisible ? ["code" as const] : []),
  ...moduleRegistry.modules.map((module) => module.id),
];

/** The app that owns the shell at `location`: Home inside a cross-app project. */
export function shellOwner(location: ModuleLocation): ShellApp {
  return location.projectId === null ? location.module.id : HOME_MODULE_ID;
}

/** The app for a pathname, or null on utility pages (Settings, Usage), which keep the last one. */
function shellAppForPath(pathname: string): ShellApp | null {
  const location = moduleRegistry.forPath(pathname);
  if (location !== null) return shellOwner(location);
  if (isSidebarUtilityPage(pathname)) return null;
  return activeProfile.codeVisible ? "code" : (moduleRegistry.modules[0]?.id ?? "code");
}

interface ShellAppState {
  readonly activeApp: ShellApp;
  /** Code's last main-app URL, so the switcher returns to the thread the user left. */
  readonly codeHref: string;
  readonly track: (pathname: string, href: string) => void;
}

export const useShellAppStore = create<ShellAppState>((set) => ({
  activeApp: activeProfile.codeVisible ? "code" : (moduleRegistry.modules[0]?.id ?? "code"),
  codeHref: "/",
  track: (pathname, href) => {
    const app = shellAppForPath(pathname);
    if (app === null) return;
    set((state) => ({
      activeApp: app,
      codeHref: app === "code" ? href : state.codeHref,
    }));
  },
}));

/** Mount once in the shell: follows the router so `useShellApp` and the `app.*` key context are current. */
export function ShellAppTracker() {
  const { pathname, href } = useLocation({
    select: (location) => ({ pathname: location.pathname, href: location.href }),
  });
  const track = useShellAppStore((state) => state.track);
  useEffect(() => track(pathname, href), [track, pathname, href]);
  return null;
}

export function useShellApp(): ShellApp {
  return useShellAppStore((state) => state.activeApp);
}

function appLabel(app: ShellApp): string {
  return app === "code" ? "Code" : (moduleRegistry.byId(app)?.label ?? app);
}
