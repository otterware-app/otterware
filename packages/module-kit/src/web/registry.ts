/**
 * What a module hands the web shell: its page, rail entry, settings sections,
 * command palette entries and search terms. The shell (`apps/web/src/otterware`)
 * reads one registry built by the host for the active profile; modules never
 * edit the host's rail, settings or palette files.
 */
import type { LucideIcon } from "lucide-react";
import type { ComponentType, LazyExoticComponent } from "react";

export type RailPosition = "start" | "end";

export interface ModulePageProps {
  /** The path below the module's own, without a leading slash; empty on its root. */
  readonly subpath: string;
  /** False while another page is shown and this one stays mounted (shortcuts, context off). */
  readonly active: boolean;
}

/** One section on the Settings screen, at `/settings/<module id>`. */
export interface WebModuleSettingsSection {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly searchTerms: ReadonlyArray<string>;
  readonly component: LazyExoticComponent<ComponentType>;
}

/** A command palette entry; `path` is navigated to, relative to the module's page. */
export interface WebModuleCommand {
  readonly id: string;
  readonly title: string;
  readonly searchTerms: ReadonlyArray<string>;
  readonly subpath: string;
}

export interface WebModule {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly rail: { readonly position: RailPosition; readonly order: number };
  /** Loaded when the page is first shown; stays mounted afterwards. */
  readonly page: LazyExoticComponent<ComponentType<ModulePageProps>>;
  readonly settings: WebModuleSettingsSection | null;
  readonly commands: ReadonlyArray<WebModuleCommand>;
  readonly searchTerms: ReadonlyArray<string>;
  /** The server module (`modules.list`) the page needs; null for client-only pages. */
  readonly serverModule: string | null;
  /** The page owns its right-hand side chat slot; false for pages with their own composer. */
  readonly sideChat: boolean;
}

export const defineWebModule = <const M extends WebModule>(module: M): M => module;

/** The route of a module's page; sub-pages are `<path>/<subpath>`. */
export const modulePath = (moduleId: string): `/${string}` => `/${moduleId}`;

export const moduleSettingsPath = (moduleId: string): `/settings/${string}` =>
  `/settings/${moduleId}`;

export interface ModuleRegistry {
  readonly modules: ReadonlyArray<WebModule>;
  readonly byId: (id: string) => WebModule | null;
  /** The module whose page `pathname` is on, with the sub-path below it. */
  readonly forPath: (
    pathname: string,
  ) => { readonly module: WebModule; readonly subpath: string } | null;
  readonly isModulePath: (pathname: string) => boolean;
  readonly rail: (position: RailPosition) => ReadonlyArray<WebModule>;
  /** Modules with a settings section, in rail order. */
  readonly settings: ReadonlyArray<WebModule & { readonly settings: WebModuleSettingsSection }>;
}

export const createModuleRegistry = (modules: ReadonlyArray<WebModule>): ModuleRegistry => {
  const byId = new Map(modules.map((module) => [module.id, module]));
  const forPath: ModuleRegistry["forPath"] = (pathname) => {
    const [, first, ...rest] = pathname.split("/");
    const module = first === undefined ? undefined : byId.get(first);
    if (module === undefined) return null;
    return { module, subpath: rest.join("/") };
  };
  return {
    modules,
    byId: (id) => byId.get(id) ?? null,
    forPath,
    isModulePath: (pathname) => forPath(pathname) !== null,
    rail: (position) =>
      modules
        .filter((module) => module.rail.position === position)
        .toSorted((left, right) => left.rail.order - right.rail.order),
    settings: modules.filter(
      (module): module is WebModule & { readonly settings: WebModuleSettingsSection } =>
        module.settings !== null,
    ),
  };
};
