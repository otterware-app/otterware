/**
 * What modules add to the one Settings screen (ADR 0011, 0020): their pages,
 * each placed for the running profile (its own page under the module's group,
 * or rows merged into an App page), the Account and Modules pages, and the
 * order the sidebar lists everything in. `settingsSearch.ts`,
 * `SettingsSidebarNav.tsx` and `settingsLayout.tsx` read these tables through
 * their seams; nothing else in Settings knows about modules.
 */
import {
  moduleSettingsPath,
  type HostSettingsPage,
  type SettingsPlacement,
  type WebModule,
  type WebModuleSettingsPage,
} from "@otterware/module-kit/web";
import { activeProfile } from "@otterware/profiles/active";
import { PuzzleIcon, UserRoundIcon } from "lucide-react";
import type { ComponentType } from "react";

import type {
  SettingsSearchItem,
  SettingsSearchScope,
} from "../components/settings/settingsSearch";
import { type KnownWebModuleId, moduleRegistry } from "./registry";
import { shellKind } from "./shell";

export const MODULES_SETTINGS_PATH = "/settings/modules";
export const ACCOUNT_SETTINGS_PATH = "/settings/account";

/**
 * Page ids modules may declare, so `SettingsPath` stays a finite union the
 * host's tables are keyed by. A new module page adds its id here.
 */
export type ModuleSettingsPageId =
  | "mail"
  | "general"
  | "integrations"
  | "calendar"
  | "drive"
  | "reading"
  | "mailboxes"
  | "translation"
  | "calendars"
  | "drives"
  | "access";
export type ModuleSettingsPagePath = `/settings/${KnownWebModuleId}/${ModuleSettingsPageId}`;
export type OtterwareSettingsPath =
  | typeof MODULES_SETTINGS_PATH
  | typeof ACCOUNT_SETTINGS_PATH
  | ModuleSettingsPagePath;

type SettingsIcon = ComponentType<{ className?: string }>;

/** The host pages a module page can merge into, by their routes. */
export const HOST_SETTINGS_PAGE_PATHS = {
  general: "/settings/general",
  appearance: "/settings/appearance",
  keybindings: "/settings/keybindings",
  account: ACCOUNT_SETTINGS_PATH,
  connections: "/settings/connections",
  providers: "/settings/providers",
  extensions: "/settings/extensions",
  integrations: "/settings/integrations",
  "scheduled-tasks": "/settings/scheduled-tasks",
  storage: "/settings/storage",
} as const satisfies Record<HostSettingsPage, string>;

export type HostSettingsPagePath = (typeof HOST_SETTINGS_PAGE_PATHS)[HostSettingsPage];

const hostPageByPath = new Map<string, HostSettingsPage>(
  Object.entries(HOST_SETTINGS_PAGE_PATHS).map(([page, path]) => [path, page as HostSettingsPage]),
);

export interface PlacedModuleSettingsPage {
  readonly module: WebModule;
  readonly page: WebModuleSettingsPage;
  readonly path: ModuleSettingsPagePath;
  /** The anchor the merged section renders under on a host page. */
  readonly sectionId: `module-${string}`;
  readonly placement: SettingsPlacement;
}

/** Every module page, placed for this profile. */
export const MODULE_SETTINGS_PAGES: ReadonlyArray<PlacedModuleSettingsPage> =
  moduleRegistry.modules.flatMap((module) =>
    module.settings.map((page) => ({
      module,
      page,
      path: moduleSettingsPath(module.id, page.id) as ModuleSettingsPagePath,
      sectionId: `module-${module.id}-${page.id}` as const,
      placement: shellKind === "standalone" ? page.placement.standalone : page.placement.grouped,
    })),
  );

const ownPages = MODULE_SETTINGS_PAGES.filter((entry) => entry.placement === "page");

/** Module pages whose rows join the host page at `pathname`. */
export function mergedModuleSettingsPages(
  pathname: string,
): ReadonlyArray<PlacedModuleSettingsPage> {
  const hostPage = hostPageByPath.get(pathname);
  return hostPage === undefined
    ? []
    : MODULE_SETTINGS_PAGES.filter((entry) => entry.placement === hostPage);
}

export function moduleSettingsPage(
  moduleId: string,
  pageId: string,
): PlacedModuleSettingsPage | null {
  return ownPages.find((entry) => entry.module.id === moduleId && entry.page.id === pageId) ?? null;
}

/** Breadcrumb and search subtitles: `Mail › Reading` while several modules group, else the page. */
const ownPageLabel = (entry: PlacedModuleSettingsPage) =>
  shellKind === "combined" ? `${entry.module.label} › ${entry.page.label}` : entry.page.label;

export const OTTERWARE_SETTINGS_SECTION_LABELS = {
  [MODULES_SETTINGS_PATH]: "Modules",
  [ACCOUNT_SETTINGS_PATH]: "Account",
  ...Object.fromEntries(ownPages.map((entry) => [entry.path, ownPageLabel(entry)])),
} as Readonly<Record<OtterwareSettingsPath, string>>;

/** Host labels that read differently once the app is more than Code (the Code profile keeps upstream's). */
export const OTTERWARE_SETTINGS_LABEL_OVERRIDES: Readonly<Partial<Record<string, string>>> =
  shellKind === "code"
    ? {}
    : { "/settings/providers": "Agents", "/settings/extensions": "Browser" };

export const OTTERWARE_SETTINGS_SECTION_ICONS = Object.fromEntries([
  [MODULES_SETTINGS_PATH, PuzzleIcon],
  [ACCOUNT_SETTINGS_PATH, UserRoundIcon],
  ...ownPages.map((entry) => [entry.path, entry.page.icon]),
]) as Readonly<Record<OtterwareSettingsPath, SettingsIcon>>;

/** Module pages render at any selection; their rows explain their own scope (ADR 0011). */
export const OTTERWARE_SETTINGS_CATEGORY_SCOPES = {
  [MODULES_SETTINGS_PATH]: null,
  [ACCOUNT_SETTINGS_PATH]: null,
  ...Object.fromEntries(ownPages.map((entry) => [entry.path, null])),
} as Readonly<Record<OtterwareSettingsPath, SettingsSearchScope | null>>;

export type OtterwareSettingsSearchItem = SettingsSearchItem & {
  readonly id: "account" | "modules" | `module-${string}`;
};

const pageSearchItems = (
  entry: PlacedModuleSettingsPage,
): ReadonlyArray<OtterwareSettingsSearchItem> => {
  const { placement } = entry;
  const to = placement === "page" ? entry.path : HOST_SETTINGS_PAGE_PATHS[placement];
  return [
    {
      id: entry.sectionId,
      title: entry.page.label,
      to,
      searchTerms: [entry.module.label.toLowerCase(), ...entry.page.searchTerms],
    },
    ...(entry.page.rows ?? []).map((row): OtterwareSettingsSearchItem => ({
      id: `${entry.sectionId}-${row.id}`,
      targetId: row.id,
      title: row.title,
      to,
      searchTerms: [entry.module.label.toLowerCase(), entry.page.label, ...(row.searchTerms ?? [])],
    })),
  ];
};

const ACCOUNT_SEARCH_ITEM: OtterwareSettingsSearchItem = {
  id: "account",
  title: "Otter Account",
  to: ACCOUNT_SETTINGS_PATH,
  searchTerms: ["account", "sign in", "sign out", "otter", "devices", "tokens"],
};

const MODULES_SEARCH_ITEM: OtterwareSettingsSearchItem = {
  id: "modules",
  title: "Modules",
  to: MODULES_SETTINGS_PATH,
  searchTerms: [
    "module turn on off enable disable environment",
    ...moduleRegistry.modules.map((module) => module.label.toLowerCase()),
  ],
};

export const OTTERWARE_SETTINGS_SEARCH_ITEMS: ReadonlyArray<OtterwareSettingsSearchItem> = [
  ...(shellKind === "code" ? [] : [ACCOUNT_SEARCH_ITEM]),
  ...(shellKind === "combined" ? [MODULES_SEARCH_ITEM] : []),
  ...MODULE_SETTINGS_PAGES.flatMap(pageSearchItems),
];

const CODE_SETTINGS_PATHS = [
  "/settings/projects",
  "/settings/project-groups",
  "/settings/snap-shot",
  "/settings/source-control",
  "/settings/code-intelligence",
  "/settings/archived",
] as const;

/** Code is hidden in standalone profiles; the shared agents and connections stay. */
export function isProfileSettingsPathVisible(path: string): boolean {
  if (path === MODULES_SETTINGS_PATH) return shellKind === "combined";
  if (path === ACCOUNT_SETTINGS_PATH) return shellKind !== "code";
  return (
    activeProfile.codeVisible || !(CODE_SETTINGS_PATHS as ReadonlyArray<string>).includes(path)
  );
}

export interface SettingsNavGroup {
  readonly id: string;
  /** Null: no header. Headers appear only when more than one module is on. */
  readonly label: string | null;
  readonly paths: ReadonlyArray<string>;
  /** A module group's link to the Keybindings page with its chip selected. */
  readonly keybindingsApp?: string;
}

const APP_SETTINGS_PATHS = [
  "/settings/general",
  "/settings/appearance",
  "/settings/keybindings",
  ACCOUNT_SETTINGS_PATH,
  "/settings/connections",
  "/settings/providers",
  "/settings/extensions",
  "/settings/integrations",
  "/settings/scheduled-tasks",
  "/settings/storage",
  MODULES_SETTINGS_PATH,
] as const;

const STANDALONE_SETTINGS_PATHS = {
  before: [
    "/settings/general",
    ACCOUNT_SETTINGS_PATH,
    "/settings/appearance",
    "/settings/keybindings",
  ],
  after: [
    "/settings/providers",
    "/settings/extensions",
    "/settings/integrations",
    "/settings/connections",
    "/settings/scheduled-tasks",
    "/settings/storage",
  ],
} as const;

/**
 * The Settings sidebar's sections. The Code profile keeps upstream's one
 * list; a standalone app shows a flat list in its original order; the
 * combined profile has an App group, a Code group and one group per module
 * that is on, with headers only while more than one module is on.
 */
export function settingsNavLayout(input: {
  readonly upstreamOrder: ReadonlyArray<string>;
  readonly onModuleIds: ReadonlyArray<string>;
}): ReadonlyArray<SettingsNavGroup> {
  if (shellKind === "code") {
    return [{ id: "all", label: null, paths: input.upstreamOrder }];
  }
  const pagesOf = (moduleId: string) =>
    ownPages.filter((entry) => entry.module.id === moduleId).map((entry) => entry.path);
  if (shellKind === "standalone") {
    const moduleId = moduleRegistry.modules[0]?.id;
    return [
      {
        id: "all",
        label: null,
        paths: [
          ...STANDALONE_SETTINGS_PATHS.before,
          ...(moduleId === undefined ? [] : pagesOf(moduleId)),
          ...STANDALONE_SETTINGS_PATHS.after.filter(
            (path) =>
              moduleId !== "mail" ||
              !["/settings/connections", "/settings/scheduled-tasks", "/settings/storage"].includes(
                path,
              ),
          ),
        ],
      },
    ];
  }
  const moduleGroups = moduleRegistry.modules
    .filter((module) => input.onModuleIds.includes(module.id) && pagesOf(module.id).length > 0)
    .map((module): SettingsNavGroup => ({
      id: module.id,
      label: module.label,
      paths: pagesOf(module.id),
      keybindingsApp: module.id,
    }));
  const headers = input.onModuleIds.length > 1;
  const app: SettingsNavGroup = {
    id: "app",
    label: headers ? "App" : null,
    paths: APP_SETTINGS_PATHS,
  };
  const code: SettingsNavGroup = {
    id: "code",
    label: headers ? "Code" : null,
    paths: CODE_SETTINGS_PATHS,
  };
  if (!headers) {
    return [
      {
        id: "all",
        label: null,
        paths: [...app.paths, ...moduleGroups.flatMap((group) => group.paths), ...code.paths],
      },
    ];
  }
  return [app, code, ...moduleGroups];
}
