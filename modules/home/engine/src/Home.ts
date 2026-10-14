/**
 * Home's aggregation: reads every module's contributor, ranks the merged
 * needs-you list, files items under cross-app projects, applies a project or
 * saved view, and derives suggestions. The RPC handlers and the agent tools
 * both call this, so users and agents see the same overview.
 */
import {
  type HomeContributorStatus,
  HomeNotFoundError,
  type HomeOverview,
  type HomeOverviewInput,
  type HomeProject,
  type HomeProjectRules,
  type HomeStoreError,
} from "@otterware/home-contracts";
import type {
  HomeActionError,
  HomeAgentActivity,
  HomeItem,
  HomeItemModule,
  TodayEvent,
} from "@otterware/module-kit/contracts";
import { type HomeContributor, HomeContributors } from "@otterware/module-kit/engine";
import type { ProjectIconColor } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import {
  filterItems,
  type HomeClock,
  projectCounts,
  rankItems,
  todayEntries,
} from "./homeMatching.ts";
import { suggestNext } from "./homeSuggestions.ts";
import * as HomeStore from "./HomeStore.ts";

/** A contributor slower than this is reported as not ok and contributes nothing this round. */
const CONTRIBUTOR_TIMEOUT = "2 seconds";

export class Home extends Context.Service<
  Home,
  {
    readonly overview: (
      input: HomeOverviewInput,
    ) => Effect.Effect<HomeOverview, HomeNotFoundError | HomeStoreError>;
    readonly performAction: (input: {
      readonly module: HomeItemModule;
      readonly itemId: string;
      readonly actionId: string;
    }) => Effect.Effect<void, HomeActionError | HomeNotFoundError>;
    /** Creates a project from partial input: color from the name, empty rules. */
    readonly createProject: (input: {
      readonly name: string;
      readonly color?: ProjectIconColor | undefined;
      readonly icon?: string | undefined;
      readonly rules?: HomeProjectRules | undefined;
    }) => Effect.Effect<HomeProject, HomeNotFoundError | HomeStoreError>;
    /** Changes only the given fields; `rules` replaces the whole rule set. */
    readonly updateProject: (input: {
      readonly id: string;
      readonly name?: string | undefined;
      readonly color?: ProjectIconColor | undefined;
      readonly icon?: string | undefined;
      readonly rules?: HomeProjectRules | undefined;
    }) => Effect.Effect<HomeProject, HomeNotFoundError | HomeStoreError>;
  }
>()("@otterware/home-engine/Home") {}

const PROJECT_COLORS: ReadonlyArray<ProjectIconColor> = [
  "blue",
  "orange",
  "emerald",
  "violet",
  "pink",
  "teal",
  "amber",
  "indigo",
];

/** A stable color for a new project, so the same name always gets the same one. */
export function defaultProjectColor(name: string): ProjectIconColor {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return PROJECT_COLORS[hash % PROJECT_COLORS.length]!;
}

const EMPTY_RULES: HomeProjectRules = {
  code: { projectIds: [] },
  mail: { senders: [], domains: [], labels: [], projectIds: [] },
  calendar: { calendarIds: [], keywords: [] },
  drive: { folderIds: [], folderSlugs: [] },
};

interface ContributorRead {
  readonly status: HomeContributorStatus;
  readonly items: ReadonlyArray<HomeItem>;
  readonly today: ReadonlyArray<TodayEvent>;
  readonly activity: HomeAgentActivity | null;
}

const failedRead = (contributor: HomeContributor): ContributorRead => ({
  status: { module: contributor.module, ok: false, itemCount: 0 },
  items: [],
  today: [],
  activity: null,
});

const readContributor = (contributor: HomeContributor) =>
  Effect.all(
    [
      contributor.needsYou,
      contributor.today ?? Effect.succeed([]),
      contributor.activity ?? Effect.succeed(null),
    ],
    { concurrency: 3 },
  ).pipe(
    Effect.timeoutOption(CONTRIBUTOR_TIMEOUT),
    Effect.map(
      Option.match({
        onNone: () => failedRead(contributor),
        onSome: ([items, today, activity]): ContributorRead => ({
          status: { module: contributor.module, ok: true, itemCount: items.length },
          // A contributor speaks for its own module only.
          items: items.filter((item) => item.module === contributor.module),
          today,
          activity,
        }),
      }),
    ),
    Effect.catchCause((cause) =>
      Effect.logWarning("Home contributor failed", { module: contributor.module, cause }).pipe(
        Effect.as(failedRead(contributor)),
      ),
    ),
  );

/** Every contributor's agent activity, summed: normally only the host's has one. */
const mergeActivity = (reads: ReadonlyArray<ContributorRead>): HomeAgentActivity => {
  const merged = {
    agents: { running: 0, waiting: 0, recentlyFinished: 0 },
    activeThreadsByCodeProject: {} as Record<string, number>,
    mergedPullRequests: [] as Array<HomeAgentActivity["mergedPullRequests"][number]>,
  };
  for (const read of reads) {
    if (read.activity === null) continue;
    merged.agents.running += read.activity.agents.running;
    merged.agents.waiting += read.activity.agents.waiting;
    merged.agents.recentlyFinished += read.activity.agents.recentlyFinished;
    for (const [projectId, count] of Object.entries(read.activity.activeThreadsByCodeProject)) {
      merged.activeThreadsByCodeProject[projectId] =
        (merged.activeThreadsByCodeProject[projectId] ?? 0) + count;
    }
    merged.mergedPullRequests.push(...read.activity.mergedPullRequests);
  }
  return merged;
};

const make = Effect.gen(function* () {
  const contributors = yield* HomeContributors;
  const store = yield* HomeStore.HomeStore;

  const overview: Home["Service"]["overview"] = Effect.fn("Home.overview")(function* (input) {
    const [projects, views, reads] = yield* Effect.all(
      [
        store.listProjects,
        store.listViews,
        Effect.flatMap(contributors.current, (current) =>
          Effect.forEach(current, readContributor, { concurrency: "unbounded" }),
        ),
      ],
      { concurrency: "unbounded" },
    );
    const activity = mergeActivity(reads);
    const project =
      input.projectId === undefined
        ? null
        : (projects.find((candidate) => candidate.id === input.projectId) ?? null);
    if (input.projectId !== undefined && project === null) {
      return yield* new HomeNotFoundError({ entity: "project", id: input.projectId });
    }
    const view =
      input.viewId === undefined
        ? null
        : (views.find((candidate) => candidate.id === input.viewId) ?? null);
    if (input.viewId !== undefined && view === null) {
      return yield* new HomeNotFoundError({ entity: "view", id: input.viewId });
    }

    const now = yield* DateTime.now;
    const clock: HomeClock = {
      nowMs: DateTime.toEpochMillis(now),
      todayStartMs: DateTime.toEpochMillis(
        DateTime.startOf(DateTime.setZone(now, DateTime.zoneMakeLocal()), "day"),
      ),
    };
    const allItems = rankItems(
      reads.flatMap((read) => read.items),
      projects,
      clock.nowMs,
    );
    const allToday = todayEntries(
      reads.flatMap((read) => read.today),
      projects,
    );
    const modules = new Set<HomeItemModule>();
    for (const read of reads) if (read.status.ok) modules.add(read.status.module);
    const allSuggestions = suggestNext({
      items: allItems,
      today: allToday,
      projects,
      mergedPullRequests: activity.mergedPullRequests,
      modules,
      nowMs: clock.nowMs,
    });

    let items = allItems;
    let today = allToday;
    let suggestions = allSuggestions;
    if (project !== null) {
      items = items.filter((item) => item.projectIds.includes(project.id));
      today = today.filter((event) => event.projectIds.includes(project.id));
      suggestions = suggestions.filter((entry) => entry.projectIds.includes(project.id));
    }
    if (view !== null) {
      const { filter } = view;
      items = filterItems(items, filter, clock);
      today =
        filter.modules.length > 0 && !filter.modules.includes("calendar")
          ? []
          : today.filter(
              (event) =>
                filter.projectIds.length === 0 ||
                event.projectIds.some((id) => filter.projectIds.includes(id)),
            );
      suggestions = suggestions.filter(
        (entry) =>
          filter.projectIds.length === 0 ||
          entry.projectIds.some((id) => filter.projectIds.includes(id)),
      );
    }

    return {
      generatedAt: DateTime.formatIso(now),
      items,
      today,
      agents: activity.agents,
      suggestions,
      projects: projects.map((entry) => ({
        project: entry,
        counts: projectCounts(
          entry,
          allItems,
          allToday,
          new Map(Object.entries(activity.activeThreadsByCodeProject)),
        ),
      })),
      views,
      contributors: reads.map((read) => read.status),
    } satisfies HomeOverview;
  });

  const performAction: Home["Service"]["performAction"] = Effect.fn("Home.performAction")(
    function* (input) {
      const current = yield* contributors.current;
      const contributor = current.find((entry) => entry.module === input.module);
      if (contributor?.performAction === undefined) {
        return yield* new HomeNotFoundError({ entity: "contributor", id: input.module });
      }
      yield* contributor.performAction(input.itemId, input.actionId);
    },
  );

  const createProject: Home["Service"]["createProject"] = (input) =>
    store.saveProject({
      name: input.name,
      color: input.color ?? defaultProjectColor(input.name),
      ...(input.icon === undefined ? {} : { icon: input.icon }),
      rules: input.rules ?? EMPTY_RULES,
    });

  const updateProject: Home["Service"]["updateProject"] = Effect.fn("Home.updateProject")(
    function* (input) {
      const existing = (yield* store.listProjects).find((project) => project.id === input.id);
      if (existing === undefined) {
        return yield* new HomeNotFoundError({ entity: "project", id: input.id });
      }
      const icon = input.icon ?? existing.icon;
      return yield* store.saveProject({
        id: existing.id,
        name: input.name ?? existing.name,
        color: input.color ?? existing.color,
        ...(icon === undefined ? {} : { icon }),
        rules: input.rules ?? existing.rules,
      });
    },
  );

  return Home.of({ overview, performAction, createProject, updateProject });
});

/** Needs `HomeContributors`, which the module runtime provides to every module. */
export const layer = Layer.effect(Home, make);
