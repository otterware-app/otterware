/**
 * What a module hands the web shell (ADR 0020): data, never frames. The host
 * draws the rail, sidebar, header, settings screen, command palette and
 * keybindings from these declarations; a module contributes its spaces, the
 * sidebar rows of the active space, header actions, a content-only page,
 * client stores that outlive routes, settings pages with a placement per
 * profile, and commands named `<module>.<command>`. The shell
 * (`apps/web/src/otterware`) reads one registry built for the active profile.
 */
import type { LucideIcon } from "lucide-react";
import type { ComponentType, LazyExoticComponent, ReactNode } from "react";

import type { ModulePageContext } from "./pageContext.ts";

export interface ModulePageProps {
  /** The path below the module's own, without a leading slash; empty on its root. */
  readonly subpath: string;
  /** False while another page is shown and this one stays mounted (shortcuts, context off). */
  readonly active: boolean;
  /** The cross-app project the page is opened inside, if any (`/home/projects/<id>/<module>`). */
  readonly projectId: string | null;
}

/** One rail item of a module: a Mail account or view, a Calendar view, a Drive. */
export interface ModuleSpace {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
  /** Where selecting the space goes; the module's page root when omitted. */
  readonly href?: string;
  /** A count drawn on the rail item (unread mail, pending invitations). */
  readonly badge?: number;
}

/** What the host sidebar knows when it asks a module for rows. */
export interface ModuleSidebarContext {
  readonly spaceId: string | null;
  readonly subpath: string;
  readonly projectId: string | null;
}

/** A context-menu entry on a sidebar row; the host adds "Pin to rail" itself. */
export interface ModuleRowAction {
  readonly id: string;
  readonly label: string;
  readonly destructive?: boolean;
  readonly onSelect: () => void;
}

export interface ModuleSidebarRow {
  readonly id: string;
  readonly label: string;
  /** A Lucide icon element or a monogram; the host sizes it. */
  readonly icon?: ReactNode;
  /** Short trailing text (a count, "3 running"). */
  readonly detail?: string;
  readonly active: boolean;
  readonly onSelect: () => void;
  /** Where the row goes, so it can be pinned to the rail; rows without one cannot be pinned. */
  readonly href?: string;
  readonly actions?: ReadonlyArray<ModuleRowAction>;
  readonly children?: ReadonlyArray<ModuleSidebarRow>;
  /** Optional native drag interactions, rendered by the host row. */
  readonly drag?: Pick<
    import("react").HTMLAttributes<HTMLElement>,
    "draggable" | "onDragStart" | "onDragOver" | "onDrop"
  >;
}

export interface ModuleSidebarSection {
  readonly id: string;
  /** Untitled sections render as a plain list at the top. */
  readonly title?: string;
  /** A small button beside the title, such as "New project". */
  readonly action?: { readonly label: string; readonly onSelect: () => void };
  readonly rows: ReadonlyArray<ModuleSidebarRow>;
  /** Shown instead of the rows while there are none. */
  readonly empty?: string;
}

/** A button in the host page header while the module's page shows. */
export interface ModuleHeaderAction {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly onSelect: () => void;
  readonly disabled?: boolean;
  /** Draw the label beside the icon (the page's primary action). */
  readonly emphasis?: "primary";
}

/**
 * A client store the host mounts once, above the router, while the module is
 * on. It runs independently of page visits (sync, notifications, caches), so
 * switching apps or spaces never remounts or refetches visibly.
 */
export interface WebModuleStore {
  readonly id: string;
  readonly runtime: LazyExoticComponent<ComponentType>;
}

/** Host settings pages a module page can merge its rows into (ADR 0011). */
export type HostSettingsPage =
  | "general"
  | "appearance"
  | "keybindings"
  | "account"
  | "connections"
  | "providers"
  | "extensions"
  | "integrations"
  | "scheduled-tasks"
  | "storage";

/** `page`: its own page; a host page id: its rows join that page. */
export type SettingsPlacement = "page" | HostSettingsPage;

/** A row inside a module settings page, so settings search finds it. */
export interface WebModuleSettingsRow {
  readonly id: string;
  readonly title: string;
  readonly searchTerms?: ReadonlyArray<string>;
}

/**
 * One settings page of a module. Its component renders rows (the host's
 * `SettingsRow`, `SettingsGroup`); the host wraps them in a page or a section
 * according to the placement for the running profile.
 */
export interface WebModuleSettingsPage {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly searchTerms: ReadonlyArray<string>;
  readonly component: LazyExoticComponent<ComponentType>;
  readonly placement: {
    /** Several modules on: `Mail › Reading`, or merged into an App page. */
    readonly grouped: SettingsPlacement;
    /** One module on: its own flat page, or merged into the page it came from. */
    readonly standalone: SettingsPlacement;
  };
  readonly rows?: ReadonlyArray<WebModuleSettingsRow>;
}

/**
 * A module command: a palette entry and a keybinding target. `id` is
 * `<module>.<command>`; its default key fires only while the module is the
 * active app (`when` is ANDed with `app.<module>`).
 */
export interface WebModuleCommand {
  readonly id: `${string}.${string}`;
  readonly title: string;
  readonly searchTerms: ReadonlyArray<string>;
  /** Navigated to below the module's page; `run` takes precedence. */
  readonly subpath?: string;
  readonly run?: () => void | Promise<void>;
  readonly defaultKey?: string;
  readonly defaultKeys?: ReadonlyArray<string>;
  readonly when?: string;
}

/**
 * What a module shows about one Code thread (Drive: the documents linked to
 * it). Rendered over a full thread's conversation and in a side chat's
 * header, only while the module (its `serverModule`, else its id) is on for
 * the thread's environment; it renders nothing when it has nothing to show.
 */
export interface ModuleThreadAccessoryProps {
  readonly environmentId: string;
  readonly threadId: string;
  /** In a module page's side chat rather than a full thread. */
  readonly sideChat: boolean;
  /** What the page beside the side chat shows; null in a full thread. */
  readonly pageContext: ModulePageContext | null;
}

export interface WebModule {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
  /** Content only; loaded when first shown and kept mounted afterwards. */
  readonly page: LazyExoticComponent<ComponentType<ModulePageProps>>;
  /** Hooks: the host calls each inside a component of its own. */
  readonly useSpaces?: () => ReadonlyArray<ModuleSpace>;
  /** Absent: the module has no host sidebar yet and the sidebar hides on its pages. */
  readonly useSidebar?: (context: ModuleSidebarContext) => ReadonlyArray<ModuleSidebarSection>;
  readonly useHeaderActions?: () => ReadonlyArray<ModuleHeaderAction>;
  readonly stores?: ReadonlyArray<WebModuleStore>;
  readonly settings: ReadonlyArray<WebModuleSettingsPage>;
  /** Data-backed palette entries (mailboxes, saved views, labels), read when the palette renders. */
  readonly paletteCommands?: () => ReadonlyArray<WebModuleCommand>;
  readonly commands: ReadonlyArray<WebModuleCommand>;
  /** Old command ids this module's commands were known by (`go.inbox` → `mail.go.inbox`). */
  readonly keybindingAliases?: Readonly<Record<string, string>>;
  /** Dynamic commands, such as a saved move-to-label binding. */
  readonly runCommand?: (command: string) => void | Promise<void>;
  readonly searchTerms: ReadonlyArray<string>;
  /** The server module (`modules.list`) the page needs; null for client-only pages. */
  readonly serverModule: string | null;
  /** The page owns its right-hand Otterware Assistant slot; false for pages with their own composer. */
  readonly sideChat: boolean;
  readonly threadAccessory?: LazyExoticComponent<ComponentType<ModuleThreadAccessoryProps>>;
}

export const defineWebModule = <const M extends WebModule>(module: M): M => module;

/** The route of a module's page; sub-pages are `<path>/<subpath>`. */
export const modulePath = (moduleId: string): `/${string}` => `/${moduleId}`;

/** A module's grouped settings page, `/settings/<module>/<page>`. */
export const moduleSettingsPath = (moduleId: string, pageId: string): `/settings/${string}` =>
  `/settings/${moduleId}/${pageId}`;

/** The module id Home is registered under; cross-app projects live below its page. */
export const HOME_MODULE_ID = "home";

/** A module's page opened inside a cross-app project: `/home/projects/<id>/<module>/<subpath>`. */
export const projectScopedModulePath = (
  projectId: string,
  moduleId: string,
  subpath = "",
): `/${string}` =>
  `${modulePath(HOME_MODULE_ID)}/projects/${projectId}/${moduleId}${subpath ? `/${subpath}` : ""}`;

export interface ModuleLocation {
  /** The module whose page shows. */
  readonly module: WebModule;
  readonly subpath: string;
  /** Set when the page is opened inside a cross-app project; the project's module owns the shell. */
  readonly projectId: string | null;
}

export interface ModuleRegistry {
  readonly modules: ReadonlyArray<WebModule>;
  readonly byId: (id: string) => WebModule | null;
  /** The module whose page `pathname` is on, with the sub-path below it. */
  readonly forPath: (pathname: string) => ModuleLocation | null;
  readonly isModulePath: (pathname: string) => boolean;
  /** Modules with settings pages, in registry order. */
  readonly settings: ReadonlyArray<WebModule>;
  /** Modules that show something on Code threads. */
  readonly threadAccessories: ReadonlyArray<
    WebModule & { readonly threadAccessory: NonNullable<WebModule["threadAccessory"]> }
  >;
}

export const createModuleRegistry = (modules: ReadonlyArray<WebModule>): ModuleRegistry => {
  const byId = new Map(modules.map((module) => [module.id, module]));
  const forPath: ModuleRegistry["forPath"] = (pathname) => {
    const [, first, ...rest] = pathname.split("/");
    const module = first === undefined ? undefined : byId.get(first);
    if (module === undefined) return null;
    // Inside a cross-app project, another module's page shows under Home's shell.
    if (module.id === HOME_MODULE_ID && rest[0] === "projects" && rest[1] !== undefined) {
      const scoped = rest[2] === undefined ? undefined : byId.get(rest[2]);
      if (scoped !== undefined && scoped.id !== HOME_MODULE_ID) {
        return { module: scoped, subpath: rest.slice(3).join("/"), projectId: rest[1] };
      }
    }
    return { module, subpath: rest.join("/"), projectId: null };
  };
  return {
    modules,
    byId: (id) => byId.get(id) ?? null,
    forPath,
    isModulePath: (pathname) => forPath(pathname) !== null,
    settings: modules.filter((module) => module.settings.length > 0),
    threadAccessories: modules.filter(
      (
        module,
      ): module is WebModule & {
        readonly threadAccessory: NonNullable<WebModule["threadAccessory"]>;
      } => module.threadAccessory !== undefined,
    ),
  };
};
