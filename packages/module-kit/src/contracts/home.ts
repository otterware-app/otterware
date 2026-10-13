/**
 * What a module contributes to Home (the day view across modules). These
 * schemas sit in module-kit rather than in the Home module because every
 * module fills them and Home must work with any subset of modules present.
 */
import { IsoDateTime } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

/** The contributing module's id; `code` is the host's own contributor (ADR 0004). */
export const HomeItemModule = Schema.String;
export type HomeItemModule = typeof HomeItemModule.Type;

/**
 * Where the client goes when the item is opened: a web route and its params
 * (`$environmentId` defaults to the environment Home read the item from), or
 * an absolute `https:` URL the client opens outside the app.
 */
export const HomeItemTarget = Schema.Struct({
  route: Schema.String,
  params: Schema.optional(Schema.Record(Schema.String, Schema.String)),
});
export type HomeItemTarget = typeof HomeItemTarget.Type;

/**
 * One button on a Home row. How the client runs it, first match wins:
 * - `target`: navigate there (no server round trip);
 * - `startThread`: start a new thread with `prompt` (in `codeProjectId`, else
 *   the assistant project), carrying the item as context;
 * - otherwise: `home.performAction`, which calls the contributor's
 *   `performAction(itemId, id)`.
 */
export const HomeItemAction = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  primary: Schema.optional(Schema.Boolean),
  target: Schema.optional(HomeItemTarget),
  startThread: Schema.optional(
    Schema.Struct({
      prompt: Schema.String,
      codeProjectId: Schema.optional(Schema.String),
    }),
  ),
});
export type HomeItemAction = typeof HomeItemAction.Type;

/**
 * What an item is about, so Home can file it under cross-app projects. Every
 * field is optional: fill what the module knows. An item without facets still
 * shows on Home, it just matches no project except through a title keyword.
 */
export const HomeItemFacets = Schema.Struct({
  /** Code: the project id the thread belongs to. */
  codeProjectId: Schema.optional(Schema.String),
  /** Code: the thread id. */
  threadId: Schema.optional(Schema.String),
  /** Mail: participant addresses (sender first); calendar: attendee addresses. Any case. */
  senders: Schema.optional(Schema.Array(Schema.String)),
  /** Mail: label names or ids. */
  labels: Schema.optional(Schema.Array(Schema.String)),
  /** Mail: the Mail module's own project/folder ids the message is filed under. */
  mailProjectIds: Schema.optional(Schema.Array(Schema.String)),
  /** Calendar: the calendar id. */
  calendarId: Schema.optional(Schema.String),
  /** Drive: the item's folder and its ancestors' ids, nearest first. */
  folderIds: Schema.optional(Schema.Array(Schema.String)),
  /** Drive: the same folders as human-readable slugs or paths. */
  folderSlugs: Schema.optional(Schema.Array(Schema.String)),
  /** Calendar/Mail: Drive file ids linked to the event or message. */
  driveFileIds: Schema.optional(Schema.Array(Schema.String)),
});
export type HomeItemFacets = typeof HomeItemFacets.Type;

/**
 * One "needs you" entry on Home. `priority` convention (higher sorts first):
 * 90 an agent is blocked on the user; 80 a person waits on a reply or RSVP;
 * 60 a review or decision is due; 40 something finished worth a look; 20 FYI.
 */
export const HomeItem = Schema.Struct({
  /** Stable within its module; `performAction` receives it back. */
  id: Schema.String,
  module: HomeItemModule,
  kind: Schema.String,
  title: Schema.String,
  subtitle: Schema.optional(Schema.String),
  /** Home assigns the first matching cross-app project from `facets`; contributors may omit it. */
  projectKey: Schema.optional(Schema.String),
  occurredAt: IsoDateTime,
  /** Higher sorts first. */
  priority: Schema.Number,
  agentNote: Schema.optional(Schema.String),
  actions: Schema.Array(HomeItemAction),
  target: HomeItemTarget,
  /** Someone (a person or an agent) is blocked until the user acts. */
  waitingOnYou: Schema.optional(Schema.Boolean),
  facets: Schema.optional(HomeItemFacets),
});
export type HomeItem = typeof HomeItem.Type;

/** One event on Home's calendar strip for today. */
export const TodayEvent = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  startsAt: IsoDateTime,
  endsAt: IsoDateTime,
  allDay: Schema.Boolean,
  location: Schema.optional(Schema.String),
  /** Joinable meeting link, when the event has one. */
  conferenceUrl: Schema.optional(Schema.String),
  calendarName: Schema.optional(Schema.String),
  color: Schema.optional(Schema.String),
  target: HomeItemTarget,
  /** `calendarId`, attendee addresses in `senders`, linked notes in `driveFileIds`. */
  facets: Schema.optional(HomeItemFacets),
});
export type TodayEvent = typeof TodayEvent.Type;

/** A pull request a thread linked, merged recently; feeds Home's suggestions. */
export const MergedPullRequestFact = Schema.Struct({
  threadId: Schema.String,
  threadTitle: Schema.String,
  codeProjectId: Schema.String,
  repository: Schema.String,
  number: Schema.Int,
  title: Schema.String,
  url: Schema.String,
  mergedAt: IsoDateTime,
});
export type MergedPullRequestFact = typeof MergedPullRequestFact.Type;

/**
 * What the agent runtime's contributor adds beyond items: the agents summary
 * Home shows, active threads per Code project (a project with linked code is
 * busy even when nothing needs the user), and recently merged pull requests.
 */
export const HomeAgentActivity = Schema.Struct({
  agents: Schema.Struct({
    running: Schema.Int,
    waiting: Schema.Int,
    recentlyFinished: Schema.Int,
  }),
  activeThreadsByCodeProject: Schema.Record(Schema.String, Schema.Int),
  mergedPullRequests: Schema.Array(MergedPullRequestFact),
});
export type HomeAgentActivity = typeof HomeAgentActivity.Type;

/** A Home action a contributor could not perform. */
export class HomeActionError extends Schema.TaggedError<HomeActionError>()("HomeActionError", {
  module: HomeItemModule,
  itemId: Schema.String,
  actionId: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {
  override get message(): string {
    return `Could not run ${this.actionId} on ${this.module} item ${this.itemId}.`;
  }
}
