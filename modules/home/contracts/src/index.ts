/**
 * Home: the day across every module. Items and today's events come from the
 * contributors defined in `@otterware/module-kit/contracts`; this contract
 * adds the overview that merges them, cross-app projects and saved views.
 */
import {
  defineModuleContract,
  HomeItem,
  HomeItemModule,
  HomeActionError,
  moduleRpcErrors,
  TodayEvent,
} from "@otterware/module-kit/contracts";
import {
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  IsoDateTime,
  ProjectIconColor,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";

// -- Cross-app projects and views ---------------------------------------------

const stringList = Schema.Array(Schema.String).pipe(Schema.withDecodingDefault(Effect.succeed([])));

/**
 * Which items belong to a cross-app project. An item matches when ANY rule
 * matches; empty lists match nothing. Comparisons ignore case. Rules for a
 * module that is not installed are kept and simply never match.
 */
export const HomeProjectRules = Schema.Struct({
  code: Schema.Struct({ projectIds: stringList }).pipe(
    Schema.withDecodingDefault(Effect.succeed({})),
  ),
  mail: Schema.Struct({
    /** Full addresses, matched against `facets.senders`. */
    senders: stringList,
    /** Domains (`acme.com`), matched against the senders' domains and subdomains. */
    domains: stringList,
    labels: stringList,
    /** The Mail module's own project ids (`facets.mailProjectIds`). */
    projectIds: stringList,
  }).pipe(Schema.withDecodingDefault(Effect.succeed({}))),
  calendar: Schema.Struct({
    calendarIds: stringList,
    /** Words in calendar item or event titles. */
    keywords: stringList,
  }).pipe(Schema.withDecodingDefault(Effect.succeed({}))),
  drive: Schema.Struct({
    folderIds: stringList,
    folderSlugs: stringList,
  }).pipe(Schema.withDecodingDefault(Effect.succeed({}))),
});
export type HomeProjectRules = typeof HomeProjectRules.Type;

export const HomeProject = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  color: ProjectIconColor,
  /** A Lucide icon name; clients show a monogram when absent. */
  icon: Schema.optional(Schema.String),
  rules: HomeProjectRules,
  /** Free-form notes on the project page; Account scope like the rest of the project. */
  notes: Schema.optional(Schema.String),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type HomeProject = typeof HomeProject.Type;

export const HomeViewTimeRange = Schema.Literals(["any", "today", "7d", "30d"]);
export type HomeViewTimeRange = typeof HomeViewTimeRange.Type;

/** A saved filter over Home items. Empty lists mean "any". */
export const HomeViewFilter = Schema.Struct({
  modules: Schema.Array(HomeItemModule).pipe(Schema.withDecodingDefault(Effect.succeed([]))),
  projectIds: stringList,
  kinds: stringList,
  timeRange: HomeViewTimeRange.pipe(Schema.withDecodingDefault(Effect.succeed("any" as const))),
  waitingOnMe: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
});
export type HomeViewFilter = typeof HomeViewFilter.Type;

export const HomeView = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  icon: Schema.optional(Schema.String),
  filter: HomeViewFilter,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type HomeView = typeof HomeView.Type;

// -- Overview -------------------------------------------------------------------

/** A Home item after ranking, with the cross-app projects it matched. */
export const HomeRankedItem = Schema.Struct({
  ...HomeItem.fields,
  projectIds: Schema.Array(Schema.String),
  score: Schema.Number,
});
export type HomeRankedItem = typeof HomeRankedItem.Type;

export const HomeTodayEntry = Schema.Struct({
  ...TodayEvent.fields,
  projectIds: Schema.Array(Schema.String),
});
export type HomeTodayEntry = typeof HomeTodayEntry.Type;

export const HomeAgentsSummary = Schema.Struct({
  running: Schema.Int,
  waiting: Schema.Int,
  recentlyFinished: Schema.Int,
});
export type HomeAgentsSummary = typeof HomeAgentsSummary.Type;

/** A rule-based cross-app next step. The client starts a thread with `action.prompt`. */
export const HomeSuggestion = Schema.Struct({
  id: Schema.String,
  /** Which rule produced it, e.g. `mail-bug-to-code`. */
  rule: Schema.String,
  from: HomeItemModule,
  to: HomeItemModule,
  title: Schema.String,
  /** One sentence on why it is suggested. */
  reason: Schema.String,
  action: Schema.Struct({
    label: Schema.String,
    prompt: Schema.String,
    /** Start in this Code project; else the assistant project. */
    codeProjectId: Schema.optional(Schema.String),
  }),
  projectIds: Schema.Array(Schema.String),
});
export type HomeSuggestion = typeof HomeSuggestion.Type;

/** Needs-you items per module id; `code` also counts active threads in the linked Code projects. */
export const HomeModuleCounts = Schema.Record(Schema.String, Schema.Int);
export type HomeModuleCounts = typeof HomeModuleCounts.Type;

export const HomeProjectSummary = Schema.Struct({
  project: HomeProject,
  counts: HomeModuleCounts,
});
export type HomeProjectSummary = typeof HomeProjectSummary.Type;

export const HomeContributorStatus = Schema.Struct({
  module: HomeItemModule,
  /** False when the contributor's last read failed or timed out. */
  ok: Schema.Boolean,
  itemCount: Schema.Int,
});
export type HomeContributorStatus = typeof HomeContributorStatus.Type;

export const HomeOverviewInput = Schema.Struct({
  /** Only items matching this cross-app project. */
  projectId: Schema.optional(Schema.String),
  /** Only items matching this saved view. */
  viewId: Schema.optional(Schema.String),
});
export type HomeOverviewInput = typeof HomeOverviewInput.Type;

export const HomeOverview = Schema.Struct({
  generatedAt: IsoDateTime,
  items: Schema.Array(HomeRankedItem),
  today: Schema.Array(HomeTodayEntry),
  agents: HomeAgentsSummary,
  suggestions: Schema.Array(HomeSuggestion),
  projects: Schema.Array(HomeProjectSummary),
  views: Schema.Array(HomeView),
  contributors: Schema.Array(HomeContributorStatus),
});
export type HomeOverview = typeof HomeOverview.Type;

export const HomeProjectInput = Schema.Struct({
  /** Omit to create. */
  id: Schema.optional(Schema.String),
  name: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(80)),
  color: ProjectIconColor,
  icon: Schema.optional(Schema.String),
  rules: HomeProjectRules,
  notes: Schema.optional(Schema.String.check(Schema.isMaxLength(20_000))),
});
export type HomeProjectInput = typeof HomeProjectInput.Type;

export const HomeViewInput = Schema.Struct({
  id: Schema.optional(Schema.String),
  name: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(80)),
  icon: Schema.optional(Schema.String),
  filter: HomeViewFilter,
});
export type HomeViewInput = typeof HomeViewInput.Type;

export class HomeNotFoundError extends Schema.TaggedError<HomeNotFoundError>()(
  "HomeNotFoundError",
  {
    entity: Schema.Literals(["project", "view", "contributor", "action"]),
    id: Schema.String,
  },
) {
  override get message(): string {
    return `No such Home ${this.entity}: ${this.id}.`;
  }
}

export class HomeStoreError extends Schema.TaggedError<HomeStoreError>()("HomeStoreError", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return `Home could not ${this.operation}.`;
  }
}

export const HOME_METHODS = {
  overview: "home.overview",
  performAction: "home.performAction",
  saveProject: "home.saveProject",
  deleteProject: "home.deleteProject",
  saveView: "home.saveView",
  deleteView: "home.deleteView",
} as const;

const HomeOverviewRpc = Rpc.make(HOME_METHODS.overview, {
  payload: HomeOverviewInput,
  success: HomeOverview,
  error: moduleRpcErrors(HomeNotFoundError, HomeStoreError),
});

const HomePerformActionRpc = Rpc.make(HOME_METHODS.performAction, {
  payload: Schema.Struct({
    module: HomeItemModule,
    itemId: Schema.String,
    actionId: Schema.String,
  }),
  success: Schema.Struct({}),
  error: moduleRpcErrors(HomeActionError, HomeNotFoundError),
});

const HomeSaveProjectRpc = Rpc.make(HOME_METHODS.saveProject, {
  payload: HomeProjectInput,
  success: HomeProject,
  error: moduleRpcErrors(HomeNotFoundError, HomeStoreError),
});

const HomeDeleteProjectRpc = Rpc.make(HOME_METHODS.deleteProject, {
  payload: Schema.Struct({ id: Schema.String }),
  success: Schema.Struct({}),
  error: moduleRpcErrors(HomeStoreError),
});

const HomeSaveViewRpc = Rpc.make(HOME_METHODS.saveView, {
  payload: HomeViewInput,
  success: HomeView,
  error: moduleRpcErrors(HomeNotFoundError, HomeStoreError),
});

const HomeDeleteViewRpc = Rpc.make(HOME_METHODS.deleteView, {
  payload: Schema.Struct({ id: Schema.String }),
  success: Schema.Struct({}),
  error: moduleRpcErrors(HomeStoreError),
});

export const HomeRpcGroup = RpcGroup.make(
  HomeOverviewRpc,
  HomePerformActionRpc,
  HomeSaveProjectRpc,
  HomeDeleteProjectRpc,
  HomeSaveViewRpc,
  HomeDeleteViewRpc,
);

export const HomeContract = defineModuleContract({
  id: "home",
  group: HomeRpcGroup,
  scopes: {
    [HOME_METHODS.overview]: AuthOrchestrationReadScope,
    [HOME_METHODS.performAction]: AuthOrchestrationOperateScope,
    [HOME_METHODS.saveProject]: AuthOrchestrationOperateScope,
    [HOME_METHODS.deleteProject]: AuthOrchestrationOperateScope,
    [HOME_METHODS.saveView]: AuthOrchestrationOperateScope,
    [HOME_METHODS.deleteView]: AuthOrchestrationOperateScope,
  },
});
