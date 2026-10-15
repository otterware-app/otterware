/**
 * One cross-app project (ADR 0020): one overview with what needs you, what
 * happened recently, and the project's notes; no app tabs. The sidebar lists
 * the project's items by app (`homeShell.tsx`), and one app's items show on
 * their own page. Opening an item shows its module's page inside the
 * project's scope.
 */
import type { HomeOverview, HomeRankedItem } from "@otterware/composition/contracts";
import { useNavigate } from "@tanstack/react-router";
import { HistoryIcon, NotebookPenIcon } from "lucide-react";
import { useState } from "react";

import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../../components/ui/empty";
import { Skeleton } from "../../components/ui/skeleton";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { BrowserChat } from "../browser/chat/BrowserChat";
import { isThisBrowser, useModuleCommand } from "../browser/moduleEndpoint";
import { HomeComposer } from "./HomeComposer";
import { browserHomeCommands, homeCommands, refreshHomeOverviews } from "./homeRpc";
import {
  HomeCard,
  homeModule,
  ModuleTile,
  useHomeOverview,
  useMinuteClock,
} from "./homePresentation";
import { projectScopedItemHref, useHomeDialogs } from "./homeShell";
import { NeedsYouCard } from "./NeedsYouCard";
import { TodayStrip } from "./TodayStrip";
import { useHomeActions } from "./useHomeActions";

/** Items a person or agent waits on; the rest is "recent". */
const needsYou = (item: HomeRankedItem) => item.waitingOnYou === true || item.priority >= 60;

function NotFound() {
  return (
    <Empty className="flex-1">
      <EmptyHeader>
        <EmptyTitle>Project not found</EmptyTitle>
        <EmptyDescription>It may have been deleted.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function Loading() {
  return (
    <div className="flex flex-col gap-4 p-8">
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

function RecentCard({
  items,
  onOpen,
}: {
  readonly items: ReadonlyArray<HomeRankedItem>;
  readonly onOpen: (item: HomeRankedItem) => void;
}) {
  const recent = items.toSorted((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  return (
    <HomeCard.Root aria-label="Recent">
      <HomeCard.Header icon={<HistoryIcon />} title="Recent" detail="across apps" />
      {recent.length === 0 ? (
        <p className="px-4 py-8 text-center text-muted-foreground text-sm">
          Nothing recent in this project.
        </p>
      ) : (
        <HomeCard.Rows>
          {recent.slice(0, 20).map((item) => (
            <button
              key={`${item.module}:${item.id}`}
              type="button"
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-accent/30"
              onClick={() => onOpen(item)}
            >
              <ModuleTile module={item.module} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
              <span className="shrink-0 text-muted-foreground text-xs">
                {homeModule(item.module).label} · {formatRelativeTimeLabel(item.occurredAt)}
              </span>
            </button>
          ))}
        </HomeCard.Rows>
      )}
    </HomeCard.Root>
  );
}

/** Free-form notes, saved when the field loses focus. Account scope, like the project. */
function NotesCard({
  overview,
  projectId,
}: {
  readonly overview: HomeOverview;
  readonly projectId: string;
}) {
  const project = overview.projects.find((entry) => entry.project.id === projectId)?.project;
  const { environmentId } = useHomeOverview({ projectId });
  const save = useModuleCommand(homeCommands.saveProject, browserHomeCommands.saveProject);
  const incoming = project?.notes ?? "";
  const [draft, setDraft] = useState(incoming);
  const [saved, setSaved] = useState(incoming);
  // Another device's edit arrives through the overview; take it unless it is ours.
  if (incoming !== saved) {
    setSaved(incoming);
    setDraft(incoming);
  }
  const commit = async () => {
    if (!project || environmentId === null || draft === saved) return;
    setSaved(draft);
    await save({
      environmentId,
      input: {
        id: project.id,
        name: project.name,
        color: project.color,
        ...(project.icon ? { icon: project.icon } : {}),
        rules: project.rules,
        notes: draft,
      },
    });
    refreshHomeOverviews();
  };
  return (
    <HomeCard.Root aria-label="Notes">
      <HomeCard.Header icon={<NotebookPenIcon />} title="Notes" detail="synced with your account" />
      {/* An editor surface inside the card, like the composer's prompt: not a form control. */}
      <textarea
        aria-label="Project notes"
        className="field-sizing-content min-h-24 w-full resize-none bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/70"
        placeholder="Context, decisions, links…"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commit()}
      />
    </HomeCard.Root>
  );
}

export function HomeProjectPage({ projectId }: { readonly projectId: string }) {
  const state = useHomeOverview({ projectId });
  const nowMs = useMinuteClock();
  const actions = useHomeActions(state.environmentId, state.refresh);
  const navigate = useNavigate();
  const composerFocus = useHomeDialogs((store) => store.composerFocus);
  const open = (item: HomeRankedItem) => {
    const scoped = projectScopedItemHref(projectId, item);
    if (scoped === null) actions.openTarget(item.target);
    else void navigate({ href: scoped });
  };
  const overview = state.overview;
  if (overview === null) return state.error === null ? <Loading /> : <NotFound />;
  const summary = overview.projects.find((entry) => entry.project.id === projectId) ?? null;
  if (summary === null) return <NotFound />;
  const projects = overview.projects.map((entry) => entry.project);
  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-6 pt-6 pb-4 lg:px-8">
        {overview.today.length > 0 ? (
          <TodayStrip
            events={overview.today}
            calendarConnected={overview.contributors.some(
              (status) => status.module === "calendar" && status.ok,
            )}
            nowMs={nowMs}
            actions={actions}
          />
        ) : null}
        <NeedsYouCard
          items={overview.items.filter(needsYou)}
          projects={[]}
          actions={actions}
          onOpen={open}
          emptyTitle="Nothing in this project needs you"
          emptyDescription="Items from its Code projects, senders, calendars and folders show up here."
        />
        <RecentCard items={overview.items.filter((item) => !needsYou(item))} onOpen={open} />
        <NotesCard overview={overview} projectId={projectId} />
      </div>
      {isThisBrowser(state.environmentId) ? (
        <div className="mx-auto w-full max-w-5xl px-6 pb-5 lg:px-8">
          <BrowserChat
            className="max-h-[32rem]"
            context={`Cross-app project: ${summary.project.name}`}
          />
        </div>
      ) : state.environmentId !== null ? (
        <div className="sticky bottom-0 z-10 mx-auto w-full max-w-5xl px-6 pb-5 lg:px-8">
          <HomeComposer
            key={projectId}
            environmentId={state.environmentId}
            projects={projects}
            initialProjectId={projectId}
            actions={actions}
            focusSignal={composerFocus}
          />
        </div>
      ) : null}
    </div>
  );
}

/** One app's items in the project, reached from the sidebar's group header. */
export function HomeProjectItemsPage({
  projectId,
  app,
}: {
  readonly projectId: string;
  readonly app: string;
}) {
  const state = useHomeOverview({ projectId });
  const actions = useHomeActions(state.environmentId, state.refresh);
  const navigate = useNavigate();
  const overview = state.overview;
  if (overview === null) return state.error === null ? <Loading /> : <NotFound />;
  const module = homeModule(app);
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-6 py-6 lg:px-8">
      <NeedsYouCard
        title={module.label}
        detail="in this project"
        items={overview.items.filter((item) => item.module === app)}
        projects={[]}
        actions={actions}
        onOpen={(item) => {
          const scoped = projectScopedItemHref(projectId, item);
          if (scoped === null) actions.openTarget(item.target);
          else void navigate({ href: scoped });
        }}
        emptyTitle={`No ${module.label} items`}
        emptyDescription="Items matching the project's rules show up here."
      />
    </div>
  );
}
