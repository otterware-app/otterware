import { setKeybindingsChip } from "../../../shellKeybindings";
import { useMailStore } from "../../mailStore";
import { ScheduledMailDialog } from "./gmail/mail-schedule";
import { LabelEditor } from "./gmail/label-editor";
import "../mail-content.css";
import { mailStorage } from "../host/storage";
import { useMailState } from "../host/session";
import { parseMailLocation, mailLocationPath } from "../host/location";
import { useMailLocation } from "../host/surface";
import { Button } from "~/components/ui/button";

import { mailDocument } from "../host/dom";
import { connectMailbox, mailBridge, mailHost, useMailCanWrite } from "../host/bridge";
import { useLatest } from "./use-latest";
import { TodoistDialogs } from "./integrations/todoist";
import {
  useLayoutEffect,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { ArrowLeftIcon } from "lucide-react";
import { EmptyState } from "../components/ui/empty-state";
import { useQueryClient } from "@tanstack/react-query";
import { toast, type ToastId } from "./gmail/toast";
import { setDraftOpener } from "./gmail/undo-send";

import { ViewEditorDialog } from "./gmail/view-editor";
import { MessageList } from "./gmail/message-list";
import { MessageReader } from "./gmail/message-reader";
import { NewMessageView } from "./gmail/new-message-view";

import { SEARCH_MAILBOX } from "./gmail/gmail-query";
import { searchTabId, type SearchTab } from "./gmail/search-tabs";

import { type SettingsRoute } from "../host/public";

import { cn, HintTooltip, IconBtn } from "./gmail/ui";
import { useMailLayout } from "./reading-preferences";
import { FloatingReader } from "./gmail/floating-reader";

import {
  keybindingContext,
  useCommandHandlers,
  useKeybindingContext,
  useKeybindingDispatcher,
} from "./keybindings/dispatch";
import { MAILBOX_JUMP_COMMANDS } from "./keybindings/commands";
import {
  useAccounts,
  useAccountSync,
  useModifyMessage,
  useModifyThread,
  useTrashMessage,
  useTrashThread,
  useUntrashThread,
  useUntrashMessage,
} from "./gmail/hooks";
import {
  beginUndoGroup,
  onUndoableAction,
  quietParams,
  registerRedo,
  takeRedo,
  takeUndo,
  type UndoAction,
} from "./gmail/undo";

import { gmailApi, type MailtoTarget } from "./gmail/api";
import { QuoteContext } from "./gmail/chat-context";
import { GmailAccount, GmailMessageSummary, MailView } from "./gmail/types";
import {
  useMailViews,
  resolveRules,
  loadLastLocation,
  saveLastLocation,
  COMBINED_ACCOUNT_ID,
  INBOX_VIEW_ID,
  SENT_VIEW_ID,
  STARRED_VIEW_ID,
  DRAFTS_VIEW_ID,
  ALL_MAIL_VIEW_ID,
} from "./gmail/custom-views";
import { ALL_MAIL_LABEL_ID } from "./gmail/label-names";

import { useMailboxes } from "./mailboxes";
import { ALL_PROJECTS, useProject, useProjects } from "./gmail/projects";
import {
  PROJECTS_SPACE,
  VIEW_LIST,
  firstLabelOf,
  isViewSpaceId,
  spaceOf,
  spansMailboxes as spanning,
} from "./gmail/spaces";

import { ProjectsOverview } from "./gmail/projects-overview";
import { ProjectView } from "./gmail/project-view";
import { NewProjectDialog } from "./gmail/project-menus";

import { Tour } from "./onboarding/tour";
import { mailSettingsPath } from "../../settingsPaths";
import {
  endTour,
  getSetupStage,
  markSetUp,
  offerTour,
  useTourRequested,
} from "./onboarding/onboarding";

/** Narrowest the reader gets when the chat panel is dragged wider. */
/** The mailbox rail's width (styles.css's --workspace-rail-width). */

/** A place in the mail, as the route names it (router.tsx). */
type MailLoc = {
  /** The space (spaces.ts): an account id, COMBINED_ACCOUNT_ID, a view's id, or PROJECTS_SPACE. */
  mailbox: string;
  /** A label or view id (in Projects, ALL_PROJECTS or a project's id), or SEARCH_MAILBOX. */
  label: string;
  /** The conversation (or message) open in the reader. */
  messageId: string | null;
  /** The open message's own account, where it isn't `mailbox`. */
  account: string | null;
  /** One message picked from the open conversation: the reader shows just that one. */
  focusId: string | null;
};

const sameLoc = (a: MailLoc, b: MailLoc | null) =>
  !!b &&
  a.mailbox === b.mailbox &&
  a.label === b.label &&
  a.messageId === b.messageId &&
  a.account === b.account &&
  a.focusId === b.focusId;

/** Where the mail was last time (custom-views' saved location). */
function savedLoc(): MailLoc {
  const saved = loadLastLocation();
  const [mailbox, label] = saved ? [saved.accountId, saved.labelId] : ["", "INBOX"];
  return { mailbox, label, messageId: null, account: null, focusId: null };
}

/**
 * `loc` among the spaces there are: one turned off (or "All mailboxes" off,
 * a view deleted, or one not there at all) gives way to what's first now
 * (Combined when it's on, else the first account), at its inbox. Views count
 * as there until they're known (`views` null).
 */
function placeFor(
  loc: MailLoc,
  accounts: GmailAccount[],
  combined: boolean,
  views: MailView[] | null,
): MailLoc {
  const there =
    views === null && isViewSpaceId(loc.mailbox)
      ? true
      : spaceOf(loc.mailbox, { accounts, views: views ?? [], combined }) !== null;
  if (there) return loc;
  const mailbox = combined ? COMBINED_ACCOUNT_ID : (accounts[0]?.id ?? loc.mailbox);
  return { mailbox, label: firstLabelOf(mailbox), messageId: null, account: null, focusId: null };
}

/**
 * Drag-resizable pane width persisted to localStorage. `room` (when given)
 * caps the width at drag start so neighbouring panes keep their minimum.
 */
function useStoredWidth(
  key: string,
  def: number,
  min: number,
  max: number,
  dir: 1 | -1 = 1,
  room?: () => number,
) {
  const [width, setWidth] = useState(() => {
    const saved = Number(mailStorage.getItem(key));
    return Number.isFinite(saved) && saved >= min && saved <= max ? saved : def;
  });
  const widthRef = useLatest(width);
  // The pane element itself, resized imperatively during a drag.
  const paneRef = useRef<HTMLDivElement>(null);
  // The animated frame around a collapsible pane: follows the drag with its
  // open/close transition switched off.
  const frameRef = useRef<HTMLDivElement>(null);

  const start = (e: ReactPointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = widthRef.current;
    const cap = Math.max(min, Math.min(max, room ? room() : max));
    let latest = startW;
    let raf = 0;
    const apply = () => {
      raf = 0;
      if (paneRef.current) paneRef.current.style.width = `${latest}px`;
      if (frameRef.current) frameRef.current.style.width = `${latest}px`;
    };
    const move = (ev: PointerEvent) => {
      // dir -1: right-side panes grow when the handle drags left.
      latest = Math.min(cap, Math.max(min, startW + dir * (ev.clientX - startX)));
      // Drive the drag through the DOM only — calling setWidth on every
      // pointermove re-renders the whole HomeView tree (message list, reader,
      // chat) each frame, which is what made resizing slow and shaky. Batch the
      // style write to one per frame and commit to React state once, on release.
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (raf) cancelAnimationFrame(raf);
      apply();
      if (frameRef.current) frameRef.current.style.transitionProperty = "";
      widthRef.current = latest;
      setWidth(latest);
      mailStorage.setItem(key, String(latest));
    };
    if (frameRef.current) frameRef.current.style.transitionProperty = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return { width, start, paneRef, frameRef };
}

function PaneResizer({ onPointerDown }: { onPointerDown: (e: ReactPointerEvent) => void }) {
  // Zero-width in the layout: panes meet on a tone change (or their own faint
  // divider), and the grab area is an invisible strip centered on the seam
  // that shows a hairline on hover ([-webkit-app-region:no-drag], so it resizes instead of moving
  // the window inside the title band).
  return (
    <div className="relative z-20 w-0 shrink-0" aria-hidden>
      <div
        onPointerDown={onPointerDown}
        className="[-webkit-app-region:no-drag] group absolute inset-y-0 -left-[3px] flex w-1.5 cursor-col-resize justify-center"
      >
        <div className="w-px group-hover:bg-input" />
      </div>
    </div>
  );
}

/**
 * ChatGPT-style window chrome: the window wears the sidebar's surface (and
 * grain), so the rail and the title band read as one frame, and the columns
 * after the rail share one inset panel (canvas) that starts under the title
 * band, with rounded corners and a faint edge. The panes themselves are
 * transparent: their title bands sit on the frame, their bodies on the panel.
 */
const PANE = "min-h-0 overflow-hidden";
/** The sidebar's body sits in the panel (in a browser tab, its heading too),
    between the frame's tone and the canvas, with a faint full-height divider
    before the list. */

/** Faint full-height dividers, through the title band (ChatGPT): on the
    list's right, the chat's left. */
const PANE_LIST = `${PANE} relative after:pointer-events-none after:absolute after:bottom-0 after:right-0 after:top-0 after:z-20 after:w-px after:bg-border/70`;
const PANE_MAIN = PANE;
/** Clips a collapsible pane while its width animates open or closed (Otter
    Code's panel animations); the pane keeps its width so nothing reflows. */

/**
 * The main window: the setup while there's no mailbox yet (or until it's
 * finished), else mail. The setup stands in for the whole view, so none of
 * mail's shortcuts run under it.
 */
export function HomeView() {
  const canWrite = useMailCanWrite();
  const accountsQuery = useAccounts();
  const loaded = !accountsQuery.isLoading;
  if (loaded && (accountsQuery.data ?? []).length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <EmptyState
          title="Connect a mailbox"
          description="Connect Google on this device for Mail and Calendar, or add another mailbox in Connections."
        />
        <div className="flex gap-2">
          <Button onClick={connectMailbox}>Connect Google on this device</Button>
          <Button variant="outline" onClick={() => mailHost().navigate("/settings/connections")}>
            Open Connections
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="h-full w-full min-w-0 flex flex-col">
      {!canWrite && (
        <p role="status" className="px-4 py-2 text-sm text-muted-foreground">
          This connection can read Mail. Editing and sending require write access.
        </p>
      )}
      <div className="min-h-0 flex-1">
        <MailHome />
      </div>
    </div>
  );
}

function MailHome() {
  // The host supplies location and project scope.
  const { path: routeHref, projectId } = useMailLocation();
  const routeLoc = useMemo(() => parseMailLocation(routeHref), [routeHref]);

  const accountsQuery = useAccounts();
  const { views, loaded: viewsLoaded, saveView, deleteView, resetView } = useMailViews();

  // The mailboxes shown: turned-on accounts, in the user's order (Settings →
  // Mailboxes, synced with the Otter account).
  const mailboxes = useMailboxes();
  const accounts = mailboxes.accounts;
  const accountIds = accounts.map((a) => a.id);
  const firstRealAccountId = accounts[0]?.id ?? null;
  const ready = !accountsQuery.isLoading && accounts.length > 0;

  // The mail under Settings: where it was when Settings opened.
  const [lastMail, setLastMail] = useMailState<MailLoc | null>("home:lastMail", null);
  useEffect(() => {
    if (routeLoc && !sameLoc(routeLoc, lastMail)) setLastMail(routeLoc);
  }, [routeLoc, lastMail, setLastMail]);
  // Where the route names no place in the mail (the index route, or a window
  // that started in Settings), it's where it was last time. Once the
  // mailboxes are known, it's always one of theirs (effects below catch the
  // route up), so nothing shows a place only to leave it at once.
  const placed = routeLoc ?? lastMail;

  const mailLoc = ready
    ? placeFor(placed ?? savedLoc(), accounts, mailboxes.combined, viewsLoaded ? views : null)
    : placed;
  const initialized = ready && mailLoc !== null;
  const selectedAccountId = mailLoc?.mailbox ?? null;
  const selectedLabelId = mailLoc?.label ?? "INBOX";
  const selectedMessageId = mailLoc?.messageId ?? null;
  // Account that owns the currently-open message (differs per row in combined views).
  const readerAccountId = mailLoc?.account ?? null;
  // One message picked from an expanded conversation in the list: the reader
  // shows just that message.
  const focusedMessageId = mailLoc?.focusId ?? null;
  // Browsing past a draft keeps mail navigation active until it is opened to edit.
  const [autoFocusDraft, setAutoFocusDraft] = useState(true);
  // Open searches, each a sidebar row: the top Search row (all mail) and one
  // per view it was started from (⌘F there). They keep their query and any
  // unrun text while you visit other mailboxes; × or Escape closes them.
  const [searchTabs, setSearchTabs] = useMailState<SearchTab[]>("home:searchTabs", []);
  const [activeSearchId, setActiveSearchId] = useMailState<string | null>(
    "home:activeSearchId",
    null,
  );
  const [composeOpen, setComposeOpen] = useMailState("home:composeOpen", () =>
    new URL(routeHref, "https://mail.invalid").searchParams.has("compose"),
  );
  useEffect(() => {
    const url = new URL(routeHref, "https://mail.invalid");
    if (!url.searchParams.has("compose")) return;
    setComposeOpen(true);
    url.searchParams.delete("compose");
    mailHost().navigate(
      `${projectId ? `/home/projects/${encodeURIComponent(projectId)}` : ""}/mail${url.pathname}${url.search}`,
      true,
    );
  }, [routeHref, projectId, setComposeOpen]);
  // The view being made ("new") or edited, in a dialog.
  const [viewEditor, setViewEditor] = useState<string | null>(null);
  // mailto: target from the OS (OtterMail as default mail app). The seq keys
  // NewMessageView so a link arriving while the composer is open re-seeds it.
  const [mailtoPrefill, setMailtoPrefill] = useMailState<MailtoTarget | null>(
    "home:mailtoPrefill",
    null,
  );
  const [mailtoSeq, setMailtoSeq] = useMailState("home:mailtoSeq", 0);

  const openSettings = useCallback((route: SettingsRoute) => {
    if (route.pane === "keybindings") setKeybindingsChip("mail");
    mailHost().navigate(
      `${mailSettingsPath(route.pane)}${route.target ? `?target=${encodeURIComponent(route.target)}` : ""}`,
    );
  }, []);
  const openSettingsRef = useLatest(openSettings);
  useEffect(() => {
    const pull = async () => {
      try {
        const target = await gmailApi.getSettingsTarget();
        if (!target) return;
        const pane = target.pane ?? "general";
        console.log("[HomeView:openSettings]", { pane });
        openSettingsRef.current({ pane });
      } catch (error) {
        console.log("[HomeView:getSettingsTarget] failed", { error: String(error) });
      }
    };
    void pull();
    return mailBridge.on("settings:open", () => void pull());
  }, [openSettingsRef]);

  /** Moves the mail to `to`, from where it is (or was, under Settings). */
  const go = (to: Partial<MailLoc>, replace = false) => {
    if (!mailLoc) return;
    const next = { ...mailLoc, ...to };
    const suffix = mailLocationPath(next);
    mailHost().navigate(
      projectId
        ? `/home/projects/${encodeURIComponent(projectId)}/mail${suffix}`
        : `/mail${suffix}`,
      replace,
    );
  };
  const closeMessage = () => go({ messageId: null });
  /** Puts the mail right where it is; under Settings, where Back returns to. */
  const correct = (to: Partial<MailLoc>) => {
    if (routeLoc) go(to, true);
    else if (lastMail) setLastMail({ ...lastMail, ...to });
  };

  // The space showing (spaces.ts); none until the mailboxes are known.
  const space = selectedAccountId
    ? spaceOf(selectedAccountId, { accounts, views, combined: mailboxes.combined })
    : null;
  const isCombined = space?.kind === "combined";
  const isProjects = space?.kind === "projects";
  const mailLayout = useMailLayout();
  // Projects keep their overview beside the conversation list.
  const fullInbox = mailLayout === "full" && !isProjects;
  const floatingLayout = mailLayout === "floating" && !isProjects;
  const wideInbox = fullInbox || floatingLayout;
  const [mailWorkspace, setMailWorkspace] = useState<HTMLDivElement | null>(null);
  // A view's space: its list, with no sidebar.
  const viewSpace = space?.kind === "view" ? space.view : null;
  const spansMailboxes = spanning(space);
  const selectedProject = useProject(isProjects ? selectedLabelId : null);
  const projectsQuery = useProjects();
  const projectsLoaded = projectsQuery.isSuccess;

  const {
    width: listWidth,
    start: listStart,
    paneRef: listPaneRef,
  } = useStoredWidth("gmail:pane:list", 340, 280, 640);
  const chatOpen = false;
  const sidebarOpen = true;

  // Rows multi-selected in the list, surfaced to the chat panel's context chip.
  const [chatSelection, setChatSelection] = useState<GmailMessageSummary[]>([]);

  const closeChat = () => {
    setPendingQuote(null);
  };
  const openChat = () => mailHost().openAssistant();
  // Getting started. A device whose mail was already here skips the setup,
  // and is offered the tour, once.
  useEffect(() => {
    if (accountsQuery.isLoading || accounts.length === 0 || getSetupStage()) return;
    markSetUp();
    offerTour();
  }, [accountsQuery.isLoading, accounts.length]);
  // The tour walks the mail view: out of Settings and the composer, with the sidebar showing.
  const tourRequested = useTourRequested();
  useEffect(() => {
    if (!tourRequested) return;
    setComposeOpen(false);
    mailStorage.setItem("gmail:sidebar-open", "1");
  }, [tourRequested]);

  // A highlighted excerpt handed from the reader to the chat panel (one-shot).
  const [pendingQuote, setPendingQuote] = useState<QuoteContext | null>(null);

  // MessageList fills this each render; reader archive/trash advance through it.
  const advanceRef = useRef<(fromMessageId: string) => boolean>(() => false);
  const handleReaderAdvance = () => {
    if (!selectedMessageId || !advanceRef.current(selectedMessageId)) closeMessage();
  };

  const searchRef = useRef<HTMLInputElement>(null);

  // ⌘1 = Combined mailbox, ⌘2…⌘9 = accounts in rail order. The ref is
  // populated below once handleSelectAccount exists.
  const accountSwitchRef = useRef<{
    ids: string[];
    combined: boolean;
    select: (id: string) => void;
  }>({ ids: [], combined: false, select: () => {} });

  const undoModifyMessage = useModifyMessage();
  const undoModifyThread = useModifyThread();
  const undoUntrashThread = useUntrashThread();
  const undoUntrashMessage = useUntrashMessage();
  const redoTrashThread = useTrashThread();
  const redoTrashMessage = useTrashMessage();
  const undoRunner = useRef<(action: UndoAction) => void>(() => {});
  const redoRunner = useRef<() => boolean>(() => false);
  // An undo runs quietly (quietParams: no undo or toast of its own). A redo is
  // the action again: it registers its undo and shows its toast, so a bulk
  // redo regroups to announce itself once.
  const runAction = (action: UndoAction, quiet: boolean): Promise<unknown> => {
    const params = <T extends object>(p: T) => (quiet ? quietParams(p) : p);
    switch (action.kind) {
      case "modifyMessage":
        return undoModifyMessage.mutateAsync(params(action.params));
      case "modifyThread":
        return undoModifyThread.mutateAsync(params(action.params));
      case "untrashThread":
        return undoUntrashThread.mutateAsync(params(action.params));
      case "untrashMessage":
        return undoUntrashMessage.mutateAsync(params(action.params));
      case "trashThread":
        return redoTrashThread.mutateAsync(params(action.params));
      case "trashMessage":
        return redoTrashMessage.mutateAsync(params(action.params));
      case "callback":
        action.run();
        return Promise.resolve();
      case "batch":
        if (!quiet) beginUndoGroup(action.actions.length);
        return Promise.all(action.actions.map((a) => runAction(a, quiet)));
    }
  };
  // ⌘Z / ⇧⌘Z (Edit › Undo and Redo in the app menu): text undo while typing,
  // else the mail action, like z and ⇧Z.
  useEffect(() => {
    const onEdit = (native: "edit:nativeUndo" | "edit:nativeRedo", run: () => void) => () => {
      const context = keybindingContext();
      if (context.editableFocus) {
        void mailBridge.invoke(native);
        return;
      }
      if (context.dialogOpen) return;
      run();
    };
    const offUndo = mailBridge.on(
      "edit:undo",
      onEdit("edit:nativeUndo", () => {
        const action = takeUndo();
        if (action) undoRunner.current(action);
      }),
    );
    const offRedo = mailBridge.on(
      "edit:redo",
      onEdit("edit:nativeRedo", () => redoRunner.current()),
    );
    return () => {
      offUndo();
      offRedo();
    };
  }, []);
  // Each action's toast, stacked; undoing an action (z or its Undo) closes it.
  const actionToasts = useRef(new Map<UndoAction, ToastId>());
  useLayoutEffect(() => {
    undoRunner.current = (action) => {
      console.log("[HomeView:undo]", {
        kind: action.kind,
        count: action.kind === "batch" ? action.actions.length : 1,
      });
      const toastId = actionToasts.current.get(action);
      if (toastId) toast.close(toastId);
      actionToasts.current.delete(action);
      runAction(action, true).then(
        () => {
          registerRedo(action);
          // Callbacks (e.g. holding back a send) say what happened themselves.
          if (action.kind !== "callback") toast.success("Undone");
        },
        () => toast.error("Could not undo"),
      );
    };
  });
  useLayoutEffect(() => {
    redoRunner.current = () => {
      const action = takeRedo();
      if (!action) return false;
      console.log("[HomeView:redo]", {
        kind: action.kind,
        count: action.kind === "batch" ? action.actions.length : 1,
      });
      runAction(action, false).catch(() => toast.error("Could not redo"));
      return true;
    };
  });
  useEffect(
    () =>
      onUndoableAction((title, action) => {
        // This toast undoes this action only, whatever came after it.
        const toastId = toast.success(title, {
          action: {
            label: "Undo",
            onClick: () => {
              if (!takeUndo(action)) {
                actionToasts.current.delete(action);
                toast.info("That can no longer be undone");
                return;
              }
              undoRunner.current(action);
            },
          },
          onRemove: () => actionToasts.current.delete(action),
        });
        actionToasts.current.set(action, toastId);
      }),
    [],
  );

  // Keyboard commands (Settings › Keybindings; defaults in keybindings/commands.ts).
  useKeybindingDispatcher();
  useKeybindingContext("settingsOpen", false);
  useKeybindingContext("panelExpanded", false);
  useKeybindingContext("messageOpen", selectedMessageId !== null);
  const goTo = (combinedViewId: string, labelId: string) => {
    // From Projects or a view, to the first mailbox's.
    const mailbox =
      isProjects || viewSpace
        ? mailboxes.combined
          ? COMBINED_ACCOUNT_ID
          : firstRealAccountId
        : selectedAccountId;
    if (!mailbox) return;
    go({
      mailbox,
      label: mailbox === COMBINED_ACCOUNT_ID ? combinedViewId : labelId,
      messageId: null,
    });
  };
  const jumpToMailbox = (digit: number) => {
    const { ids, combined, select } = accountSwitchRef.current;
    // ⌘1 = All mailboxes when it's on, then the accounts in sidebar order.
    const target = combined ? (digit === 1 ? COMBINED_ACCOUNT_ID : ids[digit - 2]) : ids[digit - 1];
    if (!target) return false;
    select(target);
  };
  useEffect(() => {
    const run = (event: Event) => {
      const { command, arg } = (event as CustomEvent<{ command: string; arg?: string | undefined }>)
        .detail;
      if (command === "view.edit") setViewEditor(arg ?? "new");
      if (command === "filter") searchFromView();
      if (command === "compose") setComposeOpen(true);
    };
    window.addEventListener("mail:shell-action", run);
    return () => window.removeEventListener("mail:shell-action", run);
  });
  useCommandHandlers({
    "search.focus": () => searchFromView(),
    "compose.new": () => setComposeOpen(true),
    "keybindings.show": () => openSettings({ pane: "keybindings" }),
    "mail.undo": () => {
      const action = takeUndo();
      if (!action) return false;
      undoRunner.current(action);
    },
    "mail.redo": () => redoRunner.current(),
    "go.inbox": () => goTo(INBOX_VIEW_ID, "INBOX"),
    "go.sent": () => goTo(SENT_VIEW_ID, "SENT"),
    "go.starred": () => goTo(STARRED_VIEW_ID, "STARRED"),
    "go.drafts": () => goTo(DRAFTS_VIEW_ID, "DRAFT"),
    "go.allMail": () => goTo(ALL_MAIL_VIEW_ID, ALL_MAIL_LABEL_ID),
    "message.close": () => closeMessage(),
    ...Object.fromEntries(
      MAILBOX_JUMP_COMMANDS.map((command, i) => [command, () => jumpToMailbox(i + 1)]),
    ),
  });

  // A window opened on no place in particular (the index route) goes to the
  // last one, once accounts are known.
  const onIndex = !routeLoc;
  const hasMail = mailLoc !== null;
  const goForEffect = useLatest(go);
  useEffect(() => {
    if (onIndex && hasMail) goForEffect.current({}, true);
  }, [onIndex, hasMail, goForEffect]);

  // Persist where the user is so we can reopen here next launch.
  useEffect(() => {
    if (!initialized || !selectedAccountId) return;
    // The Search mailbox isn't a place to reopen into.
    if (selectedLabelId === SEARCH_MAILBOX) return;
    saveLastLocation({ accountId: selectedAccountId, labelId: selectedLabelId });
  }, [initialized, selectedAccountId, selectedLabelId]);

  // mailto: links (default mail app): pull the pending target on mount (cold
  // start) and whenever the backend broadcasts one, then open the composer
  // prefilled.
  useEffect(() => {
    const pull = async () => {
      const target = await gmailApi.takePendingMailto();
      if (!target) return;
      console.log("[HomeView:mailto]", { to: target.to });
      setMailtoPrefill(target);
      setMailtoSeq((n) => n + 1);
      setComposeOpen(true);
    };
    void pull();
    const unsub = mailBridge.on("compose:mailto", () => void pull());
    return unsub;
  }, []);

  // A conversation clicked in a new-mail notification opens here, in the
  // reader (once there's mail to open it in, when it started the app).
  const [openFromNotification, setOpenFromNotification] = useState<{
    accountId: string;
    messageId: string;
  } | null>(null);
  useEffect(() => {
    const pull = async () => {
      const target = await gmailApi.takePendingOpenMessage().catch(() => null);
      if (!target) return;
      console.log("[HomeView:openFromNotification]", { messageId: target.messageId });
      setOpenFromNotification(target);
    };
    void pull();
    return mailBridge.on("mail:open", () => void pull());
  }, []);

  const effectiveAccountId = space?.id ?? firstRealAccountId;

  // If the selected view disappears (deleted, or it has no rules for the
  // active account), fall back to Inbox.
  const correctForEffect = useLatest(correct);
  /* oxlint-disable react/exhaustive-effect-dependencies -- Explicit DOM and reset triggers must re-run this lifecycle. */
  useEffect(() => {
    if (!initialized || !viewsLoaded || selectedLabelId === SEARCH_MAILBOX) return;
    // A project deleted (here or elsewhere): all of them.
    if (isProjects) {
      if (projectsLoaded && selectedLabelId !== ALL_PROJECTS && !selectedProject)
        correctForEffect.current({ label: ALL_PROJECTS, messageId: null });
      return;
    }
    if (viewSpace) {
      if (selectedLabelId !== VIEW_LIST) correctForEffect.current({ label: VIEW_LIST });
      return;
    }
    // A view as a label (views were once in each mailbox): its own space.
    const view = views.find((v) => v.id === selectedLabelId);
    if (view?.kind === "custom") {
      correctForEffect.current({ mailbox: view.id, label: VIEW_LIST });
      return;
    }
    if (isCombined && !view) correctForEffect.current({ label: INBOX_VIEW_ID });
  }, [
    initialized,
    viewsLoaded,
    isCombined,
    views,
    selectedLabelId,
    effectiveAccountId,
    isProjects,
    projectsLoaded,
    selectedProject,
    viewSpace,
    correctForEffect,
  ]);
  /* oxlint-enable react/exhaustive-effect-dependencies */

  // Local-first: keep the on-disk cache synced in the background. Combined mode
  // refreshes all accounts via its own list handler (sentinel isn't a real account).
  useAccountSync(spansMailboxes ? null : effectiveAccountId);

  // Resolve the selected view to concrete per-account rules. Projects list
  // their conversations like a combined view (every mailbox's), without rules.
  const combined = (() => {
    if (isProjects) {
      return {
        viewId: `projects:${selectedLabelId}`,
        name: selectedProject?.name ?? "All projects",
        rules: [],
      };
    }
    if (viewSpace) {
      return {
        viewId: viewSpace.id,
        name: viewSpace.name,
        rules: resolveRules(viewSpace, accounts),
      };
    }
    if (isCombined) {
      const view = views.find((v) => v.id === selectedLabelId) ?? views[0];
      return {
        viewId: view?.id ?? INBOX_VIEW_ID,
        name: view?.name ?? "Inbox",
        rules: view ? resolveRules(view, accounts) : [],
      };
    }
    return null;
  })();

  const handleSelectAccount = (accountId: string) => {
    console.log("[HomeView:selectAccount]", { accountId });
    setComposeOpen(false);
    go({ mailbox: accountId, label: firstLabelOf(accountId), messageId: null });
  };
  useLayoutEffect(() => {
    accountSwitchRef.current = {
      ids: accountIds,
      combined: mailboxes.combined,
      select: handleSelectAccount,
    };
  });

  // The route's mailbox was turned off (or "All mailboxes" was), or isn't
  // there: the route catches up with what shows instead.
  const misplaced = ready && !!routeLoc && routeLoc.mailbox !== mailLoc?.mailbox;
  const goForAccountEffect = useLatest(go);
  useEffect(() => {
    if (!misplaced) return;
    setComposeOpen(false);
    goForAccountEffect.current({}, true);
  }, [misplaced, goForAccountEffect]);

  const handleSelectLabel = (labelId: string) => {
    console.log("[HomeView:selectLabel]", { labelId });
    setComposeOpen(false);
    go({ label: labelId, messageId: null });
  };

  /** Goes to a space (at its first place, or `label`), closing the peek. */

  /** The view editor ("new", or a view's id). */

  /** A project's page, with its conversations in the list. */
  const openProject = (id: string) => {
    console.log("[HomeView:openProject]");
    setComposeOpen(false);
    go({ mailbox: PROJECTS_SPACE, label: id, messageId: null, account: null, focusId: null });
  };

  const handleSelectMessage = (
    messageId: string,
    accountId: string,
    focusId?: string,
    options?: { autoFocusDraft?: boolean | undefined },
  ) => {
    console.log("[HomeView:selectMessage]", { messageId, accountId, focusId });
    setAutoFocusDraft(options?.autoFocusDraft !== false);
    setComposeOpen(false);
    go({ messageId, account: accountId, focusId: focusId ?? null });
  };

  const queryClient = useQueryClient();
  // A send taken back with Undo reopens its draft here (the reader edits drafts).
  const selectMessageRef = useLatest(handleSelectMessage);
  useEffect(
    () =>
      setDraftOpener(({ accountId, messageId }) => {
        void queryClient.invalidateQueries({ queryKey: ["gmail:messages", accountId] });
        void queryClient.invalidateQueries({ queryKey: ["gmail:combinedMessages"] });
        selectMessageRef.current(messageId, accountId);
      }),
    [queryClient, selectMessageRef],
  );

  // ── Search mailbox ───────────────────────────────────────────────────────
  // Search is a mailbox like Inbox: selecting a search row (the top Search
  // row, or one under the view it was started from) shows Gmail's search in
  // the list pane. Escape clears it, then closes it back to where you were.
  const searchActive = selectedLabelId === SEARCH_MAILBOX;
  const searchReturnRef = useRef<string>("INBOX");
  const searchMailbox = selectedAccountId ?? "";
  const topSearchId = searchTabId(searchMailbox, null);
  const activeSearch = searchActive
    ? (searchTabs.find((t) => t.id === activeSearchId) ?? null)
    : null;
  const patchSearch = (id: string, patch: Partial<SearchTab>) =>
    setSearchTabs((tabs) => tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  // Where a new search looks by default: the mailbox you started it from.
  const defaultScope = (): string[] =>
    spansMailboxes || !effectiveAccountId
      ? combined && selectedLabelId !== SEARCH_MAILBOX
        ? [...new Set(combined.rules.map((r) => r.accountId))]
        : accountIds
      : [effectiveAccountId];
  const focusSearchEnd = () =>
    setTimeout(() => {
      const input = searchRef.current;
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
    }, 0);
  const showSearch = (id: string) => {
    if (!searchActive) searchReturnRef.current = selectedLabelId;
    setComposeOpen(false);
    setActiveSearchId(id);
    go({ label: SEARCH_MAILBOX, messageId: null });
  };
  /** The top Search row (all mail), optionally running `q`. */
  const openSearch = (q?: string) => {
    console.log("[HomeView:openSearch]", { hasQuery: Boolean(q) });
    setSearchTabs((tabs) => {
      const existing = tabs.find((t) => t.id === topSearchId);
      if (existing)
        return q === undefined
          ? tabs
          : tabs.map((t) => (t.id === topSearchId ? { ...t, query: q, draft: q } : t));
      return [
        ...tabs,
        {
          id: topSearchId,
          mailbox: searchMailbox,
          parent: null,
          base: "",
          query: q ?? "",
          draft: q ?? "",
          scope: defaultScope(),
        },
      ];
    });
    showSearch(topSearchId);
    // Focus once the header has mounted (no query: ready to type).
    if (!q) focusSearchEnd();
  };
  // ⌘F / the list's search icon: the view's own search row, opened under it
  // with its operators prefilled (`in:inbox `) and the cursor after them.
  // Already in a search, it just focuses the bar.
  const viewQueryRef = useRef("");
  const searchFromView = () => {
    if (searchActive) {
      searchRef.current?.focus();
      return;
    }
    const base = viewQueryRef.current;
    if (!base) return openSearch();
    const id = searchTabId(searchMailbox, selectedLabelId);
    console.log("[HomeView:searchFromView]", { base });
    setSearchTabs((tabs) =>
      tabs.some((t) => t.id === id)
        ? tabs
        : [
            ...tabs,
            {
              id,
              mailbox: searchMailbox,
              parent: selectedLabelId,
              base,
              query: "",
              draft: `${base} `,
              scope: defaultScope(),
            },
          ],
    );
    showSearch(id);
    focusSearchEnd();
  };
  const runSearch = (q: string) => {
    const tab = activeSearch;
    if (!tab) return openSearch(q);
    // Dropping the view's operators makes it a search of all mail: it moves
    // up to the top Search row.
    if (tab.parent && !q.includes(tab.base)) {
      console.log("[HomeView:searchLeavesView]");
      setSearchTabs((tabs) => [
        ...tabs.filter((t) => t.id !== tab.id && t.id !== topSearchId),
        { ...tab, id: topSearchId, parent: null, base: "", query: q, draft: q },
      ]);
      setActiveSearchId(topSearchId);
      return;
    }
    patchSearch(tab.id, { query: q, draft: q });
  };
  const closeSearch = (id: string) => {
    const tab = searchTabs.find((t) => t.id === id);
    console.log("[HomeView:closeSearch]", { child: Boolean(tab?.parent) });
    setSearchTabs((tabs) => tabs.filter((t) => t.id !== id));
    if (searchActive && activeSearchId === id) {
      go({ label: tab?.parent ?? searchReturnRef.current, messageId: null });
    }
  };
  useEffect(() => {
    useMailStore.setState({
      searches: searchTabs,
      activeSearchId: searchActive ? activeSearchId : null,
    });
  }, [searchTabs, activeSearchId, searchActive]);
  useEffect(() => {
    const act = (event: Event) => {
      const { command, arg } = (event as CustomEvent<{ command: string; arg: string }>).detail;
      if (command === "search.close") closeSearch(arg);
      if (command === "search.select") {
        const tab = searchTabs.find((tab) => tab.id === arg);
        if (tab) {
          setActiveSearchId(tab.id);
          go({ mailbox: tab.mailbox, label: SEARCH_MAILBOX, messageId: null });
        }
      }
    };
    window.addEventListener("mail:shell-action", act);
    return () => window.removeEventListener("mail:shell-action", act);
  });
  const handleSearchChange = (q: string) => openSearch(q);
  // Back/forward (or a reload) into a search that was since closed: the top
  // Search row. Only on arriving: closing the open search leaves it at once.
  const openSearchForEffect = useLatest(openSearch);
  useEffect(() => {
    if (searchActive && !activeSearch) openSearchForEffect.current();
  }, [searchActive, activeSearch, openSearchForEffect]);

  // Palette mail result: jump to the owning account (Combined stays put) and open.

  /** Opens a message of `owner`'s where it is: Combined stays put, another account's inbox opens. */
  const openMessage = (owner: string, messageId: string) => {
    const switching = !spansMailboxes && owner !== effectiveAccountId;
    setAutoFocusDraft(true);
    go({
      ...(switching ? { mailbox: owner, label: "INBOX" } : {}),
      messageId,
      account: owner,
      focusId: null,
    });
  };
  const openMessageForEffect = useLatest(openMessage);
  useEffect(() => {
    if (!openFromNotification || !hasMail) return;
    setOpenFromNotification(null);
    setComposeOpen(false);
    openMessageForEffect.current(openFromNotification.accountId, openFromNotification.messageId);
  }, [openFromNotification, hasMail, openMessageForEffect]);

  // Manual refresh: spin from the click until every account's sync settles
  // (any phase — the passive indicator only shows long full/body syncs), and
  // for at least a beat so a fast incremental sync still reads as feedback.
  const [manualSyncing, setManualSyncing] = useState(false);
  const syncNow = () => {
    if (manualSyncing) return;
    console.log("[HomeView:syncNow]");
    setManualSyncing(true);
    const startedAt = Date.now();
    void (async () => {
      try {
        await Promise.all(accountIds.map((id) => gmailApi.syncAccount(id).catch(() => null)));
        for (let i = 0; i < 150; i++) {
          const statuses = await Promise.all(
            accountIds.map((id) => gmailApi.getSyncStatus(id).catch(() => null)),
          );
          if (!statuses.some((st) => st?.syncing)) break;
          await new Promise((r) => setTimeout(r, 400));
        }
      } finally {
        const remaining = 700 - (Date.now() - startedAt);
        if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
        setManualSyncing(false);
      }
    })();
  };
  // ⌘R (Mailbox › Sync Now in the app menu) is the same manual refresh.
  const syncNowRef = useLatest(syncNow);
  useEffect(() => mailBridge.on("mail:syncNow", () => syncNowRef.current()), [syncNowRef]);

  // From a view, the first of the mailboxes it draws on.
  const composeAccountId = viewSpace
    ? (combined?.rules[0]?.accountId ?? firstRealAccountId)
    : spansMailboxes
      ? firstRealAccountId
      : effectiveAccountId;
  const readerAccount =
    readerAccountId ?? (spansMailboxes ? firstRealAccountId : effectiveAccountId);

  // Without a project yet, Projects is only its overview (which says how to start one).
  const hasListTarget =
    (isCombined || effectiveAccountId != null) && !(isProjects && projectsQuery.data?.length === 0);
  const showMain =
    !wideInbox || !hasListTarget || (fullInbox && !!selectedMessageId) || composeOpen;
  const listVisible = hasListTarget && (!wideInbox || !showMain);

  // Full-height columns: each pane owns its slice of the title band (on the
  // chrome); the content panel is painted behind them from under that band.
  // With a conversation open, its header is the title band (subject, actions
  // and the panel toggle in one row) instead of an empty band above it.

  const titleTrailing = null;
  // A view's space has no sidebar to toggle.

  const titlebarInset = null;
  const readerLeading = fullInbox ? (
    <>
      {sidebarOpen ? null : titlebarInset}
      <HintTooltip label="Back to message list" shortcut="message.close">
        <IconBtn label="Back to message list" onClick={closeMessage}>
          <ArrowLeftIcon className="size-4" />
        </IconBtn>
      </HintTooltip>
    </>
  ) : undefined;
  const renderReader = (
    leading: ReactNode = readerLeading,
    trailing: ReactNode = titleTrailing,
  ) => (
    <MessageReader
      titleLeading={leading}
      titleTrailing={trailing}
      accountId={readerAccount ?? ""}
      messageId={focusedMessageId ?? selectedMessageId}
      autoFocusDraft={autoFocusDraft}
      single={focusedMessageId != null}
      onShowConversation={() => go({ focusId: null })}
      onDeselect={closeMessage}
      onAdvance={handleReaderAdvance}
      onOpenChat={openChat}
      onQuote={(q) => {
        setPendingQuote(q);
        openChat();
      }}
      onComposeTo={(email) => {
        setMailtoPrefill({ to: email, cc: "", subject: "", body: "" });
        setMailtoSeq((n) => n + 1);
        setComposeOpen(true);
      }}
      onSearchSender={(email) => handleSearchChange(`from:${email}`)}
      onOpenProject={openProject}
    />
  );
  // With the sidebar hidden and no list pane, this band is the first after the
  // rail: it needs the traffic-light clearance and the toggle to bring the
  // sidebar (and Settings' Back button) back.

  useEffect(() => {
    mailHost().publishSelection({
      title: selectedProject?.name ?? "Mail",
      accountId: readerAccount,
      messageId: selectedMessageId,
      projectId: selectedProject?.id,
      selected: chatSelection.flatMap((row) => {
        const accountId = row.accountId ?? selectedAccountId;
        return accountId ? [{ accountId, id: row.id, subject: row.subject }] : [];
      }),
      quote: pendingQuote?.text,
    });
  }, [
    readerAccount,
    selectedMessageId,
    selectedProject,
    chatSelection,
    selectedAccountId,
    pendingQuote,
  ]);

  return (
    <>
      <div
        ref={setMailWorkspace}
        className="relative flex h-full min-h-0 flex-1"
        data-mail-workspace=""
        data-mail-layout={mailLayout}
      >
        <div className="relative flex min-h-0 min-w-0 flex-1">
          {hasListTarget ? (
            <>
              {/* Keep the list mounted while reading in Full inbox: its
                    scroll position, selection and next-message shortcuts stay. */}
              <div
                ref={listPaneRef}
                style={{ width: wideInbox ? undefined : listWidth }}
                className={cn(
                  wideInbox ? `${PANE} min-w-0 flex-1` : `${PANE_LIST} shrink-0`,
                  !listVisible && "invisible absolute inset-0",
                )}
                inert={!listVisible}
                data-tour="list"
              >
                <MessageList
                  headerLeading={null}
                  headerTrailing={null}
                  roundedLeft={!sidebarOpen}
                  roundedRight={wideInbox && !chatOpen}
                  renderFloatingReader={
                    floatingLayout && !composeOpen
                      ? (navigation, title) => (
                          <FloatingReader
                            container={mailWorkspace}
                            messageId={selectedMessageId ?? ""}
                            title={title}
                            navigation={navigation}
                            onClose={closeMessage}
                          >
                            {renderReader(null, null)}
                          </FloatingReader>
                        )
                      : undefined
                  }
                  accountId={(spansMailboxes ? firstRealAccountId : effectiveAccountId) ?? ""}
                  labelId={selectedLabelId}
                  combined={combined}
                  accountIds={accountIds}
                  accounts={accounts}
                  selectedMessageId={selectedMessageId}
                  focusedMessageId={focusedMessageId}
                  onSelectMessage={handleSelectMessage}
                  onDeselect={closeMessage}
                  advanceRef={advanceRef}
                  onSelectionChange={setChatSelection}
                  onOpenChat={openChat}
                  onSearchView={searchFromView}
                  viewQueryRef={viewQueryRef}
                  project={isProjects && !activeSearch ? { id: selectedLabelId } : undefined}
                  search={
                    activeSearch
                      ? {
                          id: activeSearch.id,
                          query: activeSearch.query,
                          base: activeSearch.base,
                          accountIds: activeSearch.scope,
                          onSearch: runSearch,
                          onClear: () => {
                            const base = activeSearch.base ? `${activeSearch.base} ` : "";
                            patchSearch(activeSearch.id, { query: "", draft: base });
                            focusSearchEnd();
                          },
                          onExit: () => closeSearch(activeSearch.id),
                          onScope: (scope) => patchSearch(activeSearch.id, { scope }),
                          focusRef: searchRef,
                          draft: activeSearch.draft,
                          onDraftChange: (draft) => patchSearch(activeSearch.id, { draft }),
                          messageOpen: selectedMessageId !== null,
                        }
                      : undefined
                  }
                />
              </div>
              {wideInbox ? null : <PaneResizer onPointerDown={listStart} />}
            </>
          ) : null}
          <div
            className={cn(`${PANE_MAIN} min-w-0 flex-1 flex-col`, showMain ? "flex" : "hidden")}
            data-tour={showMain ? "reader" : undefined}
          >
            <div className="flex min-h-0 flex-1 flex-col">
              {composeOpen && composeAccountId ? (
                <NewMessageView
                  key={mailtoSeq}
                  accounts={accounts}
                  defaultAccountId={composeAccountId}
                  onClose={() => {
                    setComposeOpen(false);
                    setMailtoPrefill(null);
                  }}
                  prefill={mailtoPrefill ?? undefined}
                />
              ) : isProjects && !selectedMessageId && !searchActive ? (
                selectedProject ? (
                  <ProjectView
                    project={selectedProject}
                    onOpenMessage={(accountId, messageId) =>
                      handleSelectMessage(messageId, accountId)
                    }
                    onAskAgent={openChat}
                    onDeleted={() => handleSelectLabel(ALL_PROJECTS)}
                  />
                ) : (
                  <ProjectsOverview onOpenProject={openProject} />
                )
              ) : readerAccount ? (
                showMain ? (
                  renderReader()
                ) : null
              ) : (
                <div className="flex h-full items-center justify-center">
                  <EmptyState
                    title="No account selected"
                    description="Select a mailbox from the sidebar."
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {tourRequested && initialized ? (
        <Tour
          actions={{
            agentOpen: chatOpen,
            setAgentOpen: (open) => (open ? openChat() : closeChat()),
            openMessage: () => {
              if (selectedMessageId) return;
              // A read one where there is one: opening marks a conversation read.
              const row =
                mailDocument.querySelector<HTMLElement>(
                  "[data-message-row]:not([data-draft]):not([data-unread])",
                ) ??
                mailDocument.querySelector<HTMLElement>("[data-message-row]:not([data-draft])");
              row?.click();
            },
          }}
          onClose={endTour}
        />
      ) : null}

      <LabelEditor />
      <ScheduledMailDialog />
      <TodoistDialogs />
      <NewProjectDialog onOpenProject={openProject} />
      <ViewEditorDialog
        key={viewEditor ?? "closed"}
        open={viewEditor !== null}
        view={views.find((v) => v.id === viewEditor) ?? null}
        accounts={accountsQuery.data ?? []}
        // A new view opens in its space once saved.
        onSave={(input) =>
          saveView(input).then((saved) => {
            if (!input.id) handleSelectAccount(saved.id);
          })
        }
        onDelete={deleteView}
        onReset={resetView}
        onClose={() => setViewEditor(null)}
      />
    </>
  );
}
