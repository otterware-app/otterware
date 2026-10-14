/**
 * What Home contributes to the host shell (ADR 0020): sidebar rows (Home,
 * Needs you, Agents; cross-app projects with per-app counts; saved views), the
 * cross-app project sidebar (Overview, then the project's items grouped by
 * app), the project page's header actions, and the dialogs those open.
 */
import type { HomeModuleCounts, HomeRankedItem, HomeView } from "@otterware/composition/contracts";
import {
  modulePath,
  projectScopedModulePath,
  type ModuleHeaderAction,
  type ModuleSidebarContext,
  type ModuleSidebarRow,
  type ModuleSidebarSection,
} from "@otterware/module-kit/web";
import type { EnvironmentId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import {
  BotIcon,
  HouseIcon,
  InboxIcon,
  LayersIcon,
  MessageSquarePlusIcon,
  PlusIcon,
} from "lucide-react";
import { create } from "zustand";

import { moduleRegistry } from "../registry";
import { useAgentEntries } from "./AgentsCard";
import { type ProjectDialogSeed, ProjectDialog, ViewDialog } from "./HomeDialogs";
import { refreshHomeOverviews } from "./homeRpc";
import {
  AVAILABLE_HOME_MODULES,
  HomeProjectMonogram,
  ModuleTile,
  useHomeOverview,
  useMinuteClock,
} from "./homePresentation";
import { useHomeActions } from "./useHomeActions";

const HOME_PATH = modulePath("home");
export const projectPath = (projectId: string) => `${HOME_PATH}/projects/${projectId}`;
/** One app's items inside a project (`/home/projects/<id>/items/<app>`); not a module page. */
export const projectItemsPath = (projectId: string, app: string) =>
  `${projectPath(projectId)}/items/${app}`;

interface HomeDialogsState {
  readonly project: ProjectDialogSeed | null;
  /** undefined: closed; null: new view. */
  readonly view: HomeView | null | undefined;
  readonly openProject: (seed: ProjectDialogSeed | null) => void;
  readonly openView: (view: HomeView | null | undefined) => void;
  /** Bumped by "New thread": the project page's composer takes focus. */
  readonly composerFocus: number;
  readonly focusComposer: () => void;
}

export const useHomeDialogs = create<HomeDialogsState>((set) => ({
  project: null,
  view: undefined,
  openProject: (project) => set({ project }),
  openView: (view) => set({ view }),
  composerFocus: 0,
  focusComposer: () => set((state) => ({ composerFocus: state.composerFocus + 1 })),
}));

/** The project's name in the host frame while a module page shows inside it. */
export function HomeProjectTitle({ projectId }: { readonly projectId: string }) {
  const { overview } = useHomeOverview();
  return (
    overview?.projects.find((entry) => entry.project.id === projectId)?.project.name ?? "Project"
  );
}

/**
 * Where an item opens inside its project: its module's page under the
 * project's scope, or null when the target is not a module page (a thread).
 */
export function projectScopedItemHref(projectId: string, item: HomeRankedItem): string | null {
  const [, first, ...rest] = item.target.route.split("/");
  if (first === undefined || item.target.params !== undefined) return null;
  const module = moduleRegistry.byId(first);
  if (module === null || module.id === "home") return null;
  return projectScopedModulePath(projectId, module.id, rest.join("/"));
}

const countsDetail = (counts: HomeModuleCounts) =>
  AVAILABLE_HOME_MODULES.filter((module) => (counts[module.id] ?? 0) > 0)
    .map((module) => `${counts[module.id]} ${module.label.toLowerCase()}`)
    .join(" · ");

export function useHomeSidebarSections(
  context: ModuleSidebarContext,
): ReadonlyArray<ModuleSidebarSection> {
  const navigate = useNavigate();
  const go = (href: string) => () => void navigate({ href });
  const { environmentId, overview, refresh } = useHomeOverview(
    context.projectId === null ? {} : { projectId: context.projectId },
  );
  const agents = useAgentEntries(environmentId, useMinuteClock());
  const actions = useHomeActions(environmentId, refresh);
  const dialogs = useHomeDialogs();
  const running = agents.filter((entry) => entry.state === "running").length;
  const at = (subpath: string) => context.subpath === subpath;

  if (context.projectId !== null) {
    const projectId = context.projectId;
    const items = overview?.items ?? [];
    return [
      {
        id: "project",
        rows: [
          {
            id: "overview",
            label: "Overview",
            icon: <LayersIcon />,
            active: at(`projects/${projectId}`),
            onSelect: go(projectPath(projectId)),
          },
        ],
      },
      {
        id: "apps",
        title: "In this project",
        rows: AVAILABLE_HOME_MODULES.flatMap((module): Array<ModuleSidebarRow> => {
          const own = items.filter((item) => item.module === module.id);
          if (own.length === 0) return [];
          const Icon = module.icon;
          return [
            {
              id: module.id,
              label: module.label,
              icon: <Icon className={module.className} />,
              detail: String(own.length),
              active: at(`projects/${projectId}/items/${module.id}`),
              onSelect: go(projectItemsPath(projectId, module.id)),
              href: projectItemsPath(projectId, module.id),
              children: own.slice(0, 8).map((item) => {
                const scoped = projectScopedItemHref(projectId, item);
                return {
                  id: item.id,
                  label: item.title,
                  icon: <ModuleTile module={item.module} size="sm" />,
                  active: scoped !== null && context.subpath === scoped.slice(HOME_PATH.length + 1),
                  onSelect: scoped === null ? () => actions.openTarget(item.target) : go(scoped),
                  ...(scoped === null ? {} : { href: scoped }),
                };
              }),
            },
          ];
        }),
        empty: "Nothing matches this project's rules yet.",
      },
    ];
  }

  const projects = overview?.projects ?? [];
  const views = overview?.views ?? [];
  return [
    {
      id: "top",
      rows: [
        { id: "home", label: "Home", icon: <HouseIcon />, active: at(""), onSelect: go(HOME_PATH) },
        {
          id: "needs-you",
          label: "Needs you",
          icon: <InboxIcon />,
          ...(overview && overview.items.length > 0
            ? { detail: String(overview.items.length) }
            : {}),
          active: at("needs-you"),
          onSelect: go(`${HOME_PATH}/needs-you`),
        },
        {
          id: "agents",
          label: "Agents",
          icon: <BotIcon />,
          ...(running > 0 ? { detail: `${running} running` } : {}),
          active: at("agents"),
          onSelect: go(`${HOME_PATH}/agents`),
        },
      ],
    },
    {
      id: "projects",
      title: "Projects",
      action: { label: "New project", onSelect: () => dialogs.openProject({ project: null }) },
      rows: projects.map(({ project, counts }) => ({
        id: project.id,
        label: project.name,
        icon: <HomeProjectMonogram project={project} />,
        detail: countsDetail(counts),
        active: context.subpath.startsWith(`projects/${project.id}`),
        onSelect: go(projectPath(project.id)),
        href: projectPath(project.id),
        actions: [
          { id: "edit", label: "Edit project", onSelect: () => dialogs.openProject({ project }) },
        ],
      })),
      empty: "Group a customer’s or product’s mail, events, files and code.",
    },
    {
      id: "views",
      title: "Views",
      action: { label: "New view", onSelect: () => dialogs.openView(null) },
      rows: views.map((view) => ({
        id: view.id,
        label: view.name,
        icon: <LayersIcon />,
        active: at(`views/${view.id}`),
        onSelect: go(`${HOME_PATH}/views/${view.id}`),
        href: `${HOME_PATH}/views/${view.id}`,
        actions: [{ id: "edit", label: "Edit view", onSelect: () => dialogs.openView(view) }],
      })),
      empty: "Save a filter, like “waiting on me” or “this week across apps”.",
    },
  ];
}

/** On a project: "Add…" opens the project's rules; "New thread" focuses its composer. */
export function useHomeHeaderActions(): ReadonlyArray<ModuleHeaderAction> {
  const { overview } = useHomeOverview();
  const dialogs = useHomeDialogs();
  const currentProject = useCurrentProject((state) => state.projectId);
  const project =
    currentProject === null
      ? null
      : (overview?.projects.find((entry) => entry.project.id === currentProject)?.project ?? null);
  if (project === null) return [];
  return [
    {
      id: "add",
      label: "Add…",
      icon: PlusIcon,
      emphasis: "primary",
      onSelect: () => dialogs.openProject({ project }),
    },
    {
      id: "new-thread",
      label: "New thread",
      icon: MessageSquarePlusIcon,
      emphasis: "primary",
      onSelect: () => dialogs.focusComposer(),
    },
  ];
}

interface CurrentProjectState {
  readonly projectId: string | null;
  readonly setProjectId: (projectId: string | null) => void;
}

/** The project page that is showing, published by `HomePage` for the header actions. */
export const useCurrentProject = create<CurrentProjectState>((set) => ({
  projectId: null,
  setProjectId: (projectId) => set({ projectId }),
}));

export function HomeDialogHost({
  environmentId,
  projects,
}: {
  readonly environmentId: EnvironmentId;
  readonly projects: Parameters<typeof ViewDialog>[0]["projects"];
}) {
  const navigate = useNavigate();
  const dialogs = useHomeDialogs();
  return (
    <>
      <ProjectDialog
        environmentId={environmentId}
        seed={dialogs.project}
        onOpenChange={(open) => {
          if (!open) dialogs.openProject(null);
        }}
        onSaved={(project) => {
          const created = dialogs.project?.project === null;
          dialogs.openProject(null);
          refreshHomeOverviews();
          if (project === null) void navigate({ href: HOME_PATH });
          else if (created) void navigate({ href: projectPath(project.id) });
        }}
      />
      <ViewDialog
        environmentId={environmentId}
        view={dialogs.view}
        projects={projects}
        onOpenChange={(open) => {
          if (!open) dialogs.openView(undefined);
        }}
        onSaved={(view) => {
          const created = dialogs.view === null;
          dialogs.openView(undefined);
          refreshHomeOverviews();
          if (view === null) void navigate({ href: HOME_PATH });
          else if (created) void navigate({ href: `${HOME_PATH}/views/${view.id}` });
        }}
      />
    </>
  );
}
