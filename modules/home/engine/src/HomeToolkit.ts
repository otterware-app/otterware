/**
 * Home for agents: what needs the user today, and the cross-app projects that
 * group mail, events, files and Code threads. Reads match what the user sees
 * on Home; writes are limited to project definitions.
 */
import {
  HomeNotFoundError,
  HomeOverview,
  HomeProject,
  HomeProjectRules,
  HomeProjectSummary,
  HomeStoreError,
  HomeView,
} from "@otterware/home-contracts";
import { moduleToolFailures, withToolTier } from "@otterware/module-kit/contracts";
import { ProjectIconColor } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Tool from "effect/ai/Tool";
import * as Toolkit from "effect/ai/Toolkit";

import * as Home from "./Home.ts";

const failure = moduleToolFailures(HomeNotFoundError, HomeStoreError);

/** Agents get the top of the list; the user's Home shows the rest. */
const MAX_TOOL_ITEMS = 40;

const RULES_DESCRIPTION =
  "Rules decide which items belong to the project; any one rule matching is enough. code.projectIds: Code project ids (t3_project_list). mail.senders: full addresses; mail.domains: e.g. acme.com; mail.labels; mail.projectIds: Mail module project ids. calendar.calendarIds; calendar.keywords: words in event titles. drive.folderIds and drive.folderSlugs.";

const HomeOverviewTool = withToolTier(
  Tool.make("home_overview", {
    description:
      "What needs the user now across the installed modules: the ranked 'needs you' list (each item has its module, kind, title, why, and the cross-app projects it belongs to), today's events, agents running or waiting, and rule-based suggested next steps. Use it to answer 'what needs me today?'. Pass projectId or viewId to narrow it.",
    parameters: Schema.Struct({
      projectId: Schema.optional(Schema.String),
      viewId: Schema.optional(Schema.String),
    }),
    success: HomeOverview,
    failure,
  })
    .annotate(Tool.Title, "Read Home overview")
    .annotate(Tool.Readonly, true)
    .annotate(Tool.Destructive, false)
    .annotate(Tool.Idempotent, true)
    .annotate(Tool.OpenWorld, false),
  "read-only",
);

const HomeListProjectsTool = withToolTier(
  Tool.make("home_list_projects", {
    description:
      "List the user's cross-app projects (each groups Code projects, mail senders/labels, calendars and Drive folders under one name) with per-module counts, and their saved Home views.",
    success: Schema.Struct({
      projects: Schema.Array(HomeProjectSummary),
      views: Schema.Array(HomeView),
    }),
    failure,
  })
    .annotate(Tool.Title, "List cross-app projects")
    .annotate(Tool.Readonly, true)
    .annotate(Tool.Destructive, false)
    .annotate(Tool.Idempotent, true)
    .annotate(Tool.OpenWorld, false),
  "read-only",
);

const HomeGetProjectOverviewTool = withToolTier(
  Tool.make("home_get_project_overview", {
    description:
      "Everything Home knows for one cross-app project: its needs-you items across modules, today's matching events, suggestions, and its per-module counts.",
    parameters: Schema.Struct({ projectId: Schema.String }),
    success: HomeOverview,
    failure,
  })
    .annotate(Tool.Title, "Read a cross-app project")
    .annotate(Tool.Readonly, true)
    .annotate(Tool.Destructive, false)
    .annotate(Tool.Idempotent, true)
    .annotate(Tool.OpenWorld, false),
  "read-only",
);

const HomeCreateProjectTool = withToolTier(
  Tool.make("home_create_project", {
    description: `Create a cross-app project the user asked for. ${RULES_DESCRIPTION}`,
    parameters: Schema.Struct({
      name: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(80)),
      color: Schema.optional(ProjectIconColor),
      icon: Schema.optional(Schema.String),
      rules: Schema.optional(HomeProjectRules),
    }),
    success: HomeProject,
    failure,
  })
    .annotate(Tool.Title, "Create a cross-app project")
    .annotate(Tool.Readonly, false)
    .annotate(Tool.Destructive, false)
    .annotate(Tool.Idempotent, false)
    .annotate(Tool.OpenWorld, false),
  "safe",
);

const HomeUpdateProjectTool = withToolTier(
  Tool.make("home_update_project", {
    description: `Rename, recolor, change the rules or the notes of a cross-app project. Omitted fields stay; rules replaces the whole rule set, so read the project first and send every rule to keep. ${RULES_DESCRIPTION}`,
    parameters: Schema.Struct({
      id: Schema.String,
      name: Schema.optional(Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(80))),
      color: Schema.optional(ProjectIconColor),
      icon: Schema.optional(Schema.String),
      rules: Schema.optional(HomeProjectRules),
      notes: Schema.optional(Schema.String.check(Schema.isMaxLength(20_000))),
    }),
    success: HomeProject,
    failure,
  })
    .annotate(Tool.Title, "Update a cross-app project")
    .annotate(Tool.Readonly, false)
    .annotate(Tool.Destructive, false)
    .annotate(Tool.Idempotent, true)
    .annotate(Tool.OpenWorld, false),
  "safe",
);

export const HomeToolkit = Toolkit.make(
  HomeOverviewTool,
  HomeListProjectsTool,
  HomeGetProjectOverviewTool,
  HomeCreateProjectTool,
  HomeUpdateProjectTool,
);

const trimmed = (overview: HomeOverview): HomeOverview => ({
  ...overview,
  items: overview.items.slice(0, MAX_TOOL_ITEMS),
});

/** Built by the module runtime in Home's context when the module starts. */
export const handlers = Effect.gen(function* () {
  const home = yield* Home.Home;
  return {
    home_overview: (input) => Effect.map(home.overview(input), trimmed),
    home_list_projects: () =>
      Effect.map(home.overview({}), ({ projects, views }) => ({ projects, views })),
    home_get_project_overview: ({ projectId }) => Effect.map(home.overview({ projectId }), trimmed),
    home_create_project: (input) => home.createProject(input),
    home_update_project: (input) => home.updateProject(input),
  } satisfies Toolkit.HandlersFrom<(typeof HomeToolkit)["tools"]>;
});
