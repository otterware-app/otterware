import { activeProfile } from "@otterware/profiles/active";
/**
 * What modules add to the one Settings screen: the Modules page (live on/off
 * toggles) and one section per module that declares `settings`, at
 * `/settings/<module id>`. `settingsSearch.ts` and `SettingsSidebarNav.tsx`
 * spread these tables into their own; nothing else in Settings knows about
 * modules.
 */
import { PuzzleIcon } from "lucide-react";
import type { ComponentType } from "react";

import type {
  SettingsSearchItem,
  SettingsSearchScope,
} from "../components/settings/settingsSearch";
import { type KnownWebModuleId, moduleRegistry } from "./registry";

export const MODULES_SETTINGS_PATH = "/settings/modules";

export type OtterwareSettingsPath = typeof MODULES_SETTINGS_PATH | `/settings/${KnownWebModuleId}`;

type SettingsIcon = ComponentType<{ className?: string }>;

const sections = moduleRegistry.settings.map((module) => ({
  module,
  // Module ids in the registry are known ids; the path type follows.
  path: `/settings/${module.id as KnownWebModuleId}` as const,
}));

export const OTTERWARE_SETTINGS_SECTION_LABELS = {
  [MODULES_SETTINGS_PATH]: "Modules",
  ...Object.fromEntries(sections.map(({ module, path }) => [path, module.settings.label])),
} as Readonly<Record<OtterwareSettingsPath, string>>;

export const OTTERWARE_SETTINGS_SECTION_ICONS = Object.fromEntries([
  [MODULES_SETTINGS_PATH, PuzzleIcon],
  ...sections.map(({ module, path }) => [path, module.settings.icon]),
]) as Readonly<Record<OtterwareSettingsPath, SettingsIcon>>;

/** Module sections render at any selection; their rows explain their own scope (ADR 0011). */
export const OTTERWARE_SETTINGS_CATEGORY_SCOPES = {
  [MODULES_SETTINGS_PATH]: null,
  ...Object.fromEntries(sections.map(({ path }) => [path, null])),
} as Readonly<Record<OtterwareSettingsPath, SettingsSearchScope | null>>;

export const OTTERWARE_SETTINGS_SEARCH_ITEMS = [
  {
    id: "modules",
    title: "Modules",
    to: MODULES_SETTINGS_PATH,
    searchTerms: [
      "module turn on off enable disable environment",
      ...moduleRegistry.modules.map((module) => module.label.toLowerCase()),
    ],
  },
  ...sections.map(({ module, path }) => ({
    id: `module-${module.id as KnownWebModuleId}` as const,
    title: module.settings.label,
    to: path,
    searchTerms: module.settings.searchTerms,
  })),
] as const satisfies ReadonlyArray<SettingsSearchItem>;

/** Code is hidden in standalone profiles; the shared agents and connections stay. */
export function isProfileSettingsPathVisible(path: string): boolean {
  return (
    activeProfile.codeVisible ||
    ![
      "/settings/projects",
      "/settings/project-groups",
      "/settings/source-control",
      "/settings/code-intelligence",
      "/settings/archived",
      "/settings/snap-shot",
    ].includes(path)
  );
}
