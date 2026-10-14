import { withDriveSearch } from "~/otterware/drive/drivePaths";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogPanel,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { useDriveHost } from "../../host";
import { ContextMenu } from "@base-ui/react/context-menu";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
  EmptyContent,
} from "~/components/ui/empty";
import { MenuTrigger, MenuPopup, Menu } from "~/components/ui/menu";

import { Button } from "~/components/ui/button";
import { Fragment, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArchiveIcon,
  ChevronRightIcon,
  EllipsisIcon,
  FilesIcon,
  FolderIcon,
  SearchXIcon,
  UsersIcon,
} from "lucide-react";
import type { Artifact, Person } from "@otterware/drive-contracts/api";
import { artifactBootstrapQuery } from "../../lib/artifact-query";

import { cn } from "~/lib/utils";
import { useListDensity } from "../../lib/density";

import { useCommandHandlers } from "../keybindings/dispatch";

import { folderLabel, type Folder } from "../folders";
import { DocumentMenuItems } from "./document-menu";
import { KIND_META, documentKind, formatListDate, type DriveSearch } from "./documents";
import { FolderMenuItems } from "./folder-menu";
import { requestUpload } from "./upload-dialog";

const OPEN_SEARCH_EVENT = "otterdrive:open-search";
let searchRequested = false;

/** Opens the list's search field (the sidebar's Search row, /), now or as
 *  soon as the list shows. */
export function requestOpenSearch() {
  searchRequested = true;
  window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));
}

const SORTS = [
  { value: "updated", label: "Last updated" },
  { value: "az", label: "Title, A to Z" },
  { value: "za", label: "Title, Z to A" },
] as const;

/** Who shared something with you, and when (Shared with me's rows). */
export interface SharedBy {
  person: Person | null;
  at: string;
}

/** A row of the list: a folder, which opens in the list, or a document. */
export type ListEntry =
  | { type: "folder"; folder: Folder; sharedBy?: SharedBy | undefined }
  | {
      type: "document";
      artifact: Artifact;
      /** The folder in its link. */
      folderSlug: string;
      /**
       * The folder its API calls go through; undefined for a document
       * shared on its own, which is addressed by its id.
       */
      folderId: string | undefined;
      sharedBy?: SharedBy | undefined;
    };

type DocumentEntry = Extract<ListEntry, { type: "document" }>;

/**
 * Folder contents with breadcrumbs and a search field. The host owns search
 * and sort actions. The open document stays lit; ↑↓ (or J/K) walk the
 * documents, opening as they go.
 */
export function DocumentList({
  entries,
  heading,
  searchPlaceholder,
  totalInView,
  loading,
  error,
  search,
  selectedSlug,
  searchRef,
  emptyState,
  onOpenFolder,
  onSearchChange,
}: {
  /** What shows, after search, kind and sort: folders first. */
  entries: ListEntry[];
  /** Where you are: breadcrumbs, or a view's summary. */
  heading: ReactNode;
  searchPlaceholder: string;
  /** The view's documents and folders before search and kind. */
  totalInView: number;
  loading: boolean;
  error: string | null;
  search: DriveSearch;
  selectedSlug: string | null;
  searchRef: RefObject<HTMLInputElement | null>;
  /** Replaces the default empty state (Shared with me's). */
  emptyState?: ReactNode;
  onOpenFolder: (folder: Folder) => void;
  onSearchChange: (update: Partial<DriveSearch>) => void;
}) {
  const host = useDriveHost();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const [searching, setSearching] = useState(Boolean(search.q));
  const query = search.q ?? "";
  const showSearch = searching || Boolean(query);
  const documents = entries.filter((entry): entry is DocumentEntry => entry.type === "document");

  // "Search" in the sidebar (or /) opens the field; it closes when emptied
  // and left.
  useEffect(() => {
    if (query) setSearching(true);
  }, [query]);
  useEffect(() => {
    const openSearch = () => {
      searchRequested = false;
      setSearching(true);
      requestAnimationFrame(() => {
        searchRef.current?.focus();
        searchRef.current?.select();
      });
    };
    window.addEventListener(OPEN_SEARCH_EVENT, openSearch);
    if (searchRequested) openSearch();
    return () => window.removeEventListener(OPEN_SEARCH_EVENT, openSearch);
  }, [searchRef]);

  const open = (entry: DocumentEntry, replace = false) => {
    void navigate({
      href: withDriveSearch(
        host.href(
          "/" +
            encodeURIComponent(entry.folderSlug) +
            "/a/" +
            encodeURIComponent(entry.artifact.slug),
        ),
        {
          ...Object.fromEntries(new URLSearchParams(host.location.search)),
          sheet: undefined,
        },
      ),
      replace,
    });
  };

  /** J/K anywhere, ↑↓ with the list focused; a key that moves nothing passes. */
  const step = (delta: 1 | -1) => {
    const inList = scrollRef.current?.contains(document.activeElement) ?? false;
    if (documents.length === 0) return false;
    const index = documents.findIndex((item) => item.artifact.slug === selectedSlug);
    const next =
      index < 0
        ? delta > 0
          ? 0
          : documents.length - 1
        : Math.min(documents.length - 1, Math.max(0, index + delta));
    const entry = documents[next];
    if (!entry || entry.artifact.slug === selectedSlug) return false;
    open(entry, index >= 0);
    const row = scrollRef.current?.querySelector<HTMLElement>(
      `[data-slug="${CSS.escape(entry.artifact.slug)}"]`,
    );
    row?.scrollIntoView({ block: "nearest" });
    // Arrowing through the list keeps the focus on the open row.
    if (inList) row?.focus({ preventScroll: true });
  };

  useCommandHandlers({
    "list.sort": () => setSortOpen(true),
    "list.next": () => step(1),
    "list.previous": () => step(-1),
  });

  const prefetch = (entry: DocumentEntry) =>
    void queryClient.prefetchQuery(
      artifactBootstrapQuery(
        entry.folderId,
        entry.folderId ? entry.artifact.slug : entry.artifact.id,
      ),
    );

  return (
    <div className="relative flex h-full min-w-0 flex-col">
      <div className="flex flex-col gap-2 px-4 pt-3">
        <div className="text-sm text-muted-foreground">{loading ? " " : heading}</div>
        {showSearch ? (
          <Input
            ref={searchRef}
            type="search"
            autoFocus
            value={query}
            placeholder={searchPlaceholder}
            aria-label="Search documents"
            onChange={(event) => onSearchChange({ q: event.target.value || undefined })}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onSearchChange({ q: undefined });
                setSearching(false);
              }
              if (event.key === "Enter" || event.key === "ArrowDown") {
                const first = documents[0];
                if (first) {
                  event.preventDefault();
                  event.currentTarget.blur();
                  open(first);
                }
              }
            }}
          />
        ) : null}
      </div>
      <Dialog open={sortOpen} onOpenChange={setSortOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Sort documents</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            <div className="flex flex-col gap-2">
              {SORTS.map((sort) => (
                <Button
                  key={sort.value}
                  variant={(search.sort ?? "updated") === sort.value ? "secondary" : "outline"}
                  onClick={() => {
                    onSearchChange({ sort: sort.value === "updated" ? undefined : sort.value });
                    setSortOpen(false);
                  }}
                >
                  {sort.label}
                </Button>
              ))}
            </div>
          </DialogPanel>
        </DialogPopup>
      </Dialog>

      <div
        ref={scrollRef}
        role="list"
        aria-label="Folders and documents"
        className="min-h-0 flex-1 overflow-y-auto pt-2.25 pb-1 [scrollbar-gutter:stable_both-edges]"
      >
        {error ? (
          <div className={"h-full px-6"}>
            <Empty size="compact">
              <EmptyMedia variant="icon">
                <SearchXIcon />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>{"Couldn’t load documents"}</EmptyTitle>
                <EmptyDescription>{error}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        ) : loading ? (
          <DocumentListSkeleton />
        ) : entries.length === 0 ? (
          (emptyState ?? <EmptyList search={search} total={totalInView} />)
        ) : (
          entries.map((entry) =>
            entry.type === "folder" ? (
              <FolderRow
                key={`folder:${entry.folder.id}`}
                folder={entry.folder}
                sharedBy={entry.sharedBy}
                onOpen={() => onOpenFolder(entry.folder)}
              />
            ) : (
              <DocumentRow
                key={entry.artifact.id}
                entry={entry}
                selected={entry.artifact.slug === selectedSlug}
                onPrefetch={() => prefetch(entry)}
              />
            ),
          )
        )}
      </div>
    </div>
  );
}

/**
 * Where you are, Google Drive's way: each folder up to the drive (or to
 * "Shared with me"), the open one last. A long way folds into "…".
 */
export function Breadcrumbs({
  trail,
}: {
  trail: Array<{ label: string; onClick?: (() => void) | undefined }>;
}) {
  const shown = trail.length > 3 ? [trail[0]!, { label: "…" }, ...trail.slice(-2)] : trail;
  return (
    <nav aria-label="Location" className="flex min-w-0 items-center">
      <ol className="flex min-w-0 items-center">
        {shown.map((crumb, index) => {
          const last = index === shown.length - 1;
          return (
            <Fragment key={`${index}:${crumb.label}`}>
              {index > 0 ? (
                <ChevronRightIcon
                  aria-hidden
                  className="mx-0.5 size-3.5 shrink-0 text-muted-foreground/70"
                />
              ) : null}
              <li
                className={cn("min-w-0", last ? "shrink truncate" : "max-w-32 shrink-0 truncate")}
              >
                {crumb.onClick && !last ? (
                  <button
                    type="button"
                    onClick={crumb.onClick}
                    className="max-w-full truncate rounded-md px-1 py-0.5 text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    {crumb.label}
                  </button>
                ) : (
                  <span
                    aria-current={last ? "page" : undefined}
                    className={cn(
                      "block truncate px-1",
                      last ? "font-medium text-foreground" : undefined,
                    )}
                  >
                    {crumb.label}
                  </span>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}

function EmptyList({ search, total }: { search: DriveSearch; total: number }) {
  if (search.q || (search.kind && total > 0)) {
    return (
      <div className={"h-full px-6"}>
        <Empty size="compact">
          <EmptyMedia variant="icon">
            <SearchXIcon />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{"No matches"}</EmptyTitle>
            <EmptyDescription>
              {search.q ? `Nothing here matches “${search.q}”.` : "Nothing of that kind here."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }
  if (search.view === "archived") {
    return (
      <div className={"h-full px-6"}>
        <Empty size="compact">
          <EmptyMedia variant="icon">
            <ArchiveIcon />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{"Nothing archived"}</EmptyTitle>
            <EmptyDescription>
              {"Archived documents wait here until you restore or delete them."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }
  if (search.view === "recent") {
    return (
      <div className={"h-full px-6"}>
        <Empty size="compact">
          <EmptyMedia variant="icon">
            <FilesIcon />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{"A quiet week"}</EmptyTitle>
            <EmptyDescription>{"Nothing changed in the last seven days."}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }
  // Beside the main pane (which invites the first upload), one quiet line;
  // on a phone, the list is all there is, so it invites the upload itself.
  return (
    <>
      <p className="hidden px-6 pt-4 text-center text-sm text-muted-foreground md:block">
        This folder is empty
      </p>
      <div className={"h-full px-6 md:hidden"}>
        <Empty size="compact">
          <EmptyMedia variant="icon">
            <FilesIcon />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{"This folder is empty"}</EmptyTitle>
            <EmptyDescription>{"Upload a file or a folder to start."}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {
              <Button onClick={requestUpload} variant="default">
                Upload
              </Button>
            }
          </EmptyContent>
        </Empty>
      </div>
    </>
  );
}

/** A document's face in lists: its thumbnail, or its kind's icon. */
export function DocumentThumb({ artifact, className }: { artifact: Artifact; className?: string }) {
  const [failed, setFailed] = useState(false);
  const Icon = KIND_META[documentKind(artifact)].icon;
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-surface-raised/70 text-icon-muted",
        className,
      )}
    >
      {artifact.thumbnailUrl && !failed ? (
        <img
          src={artifact.thumbnailUrl}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="size-full object-cover object-top"
          onError={() => setFailed(true)}
        />
      ) : (
        <Icon className="size-4" strokeWidth={1.75} />
      )}
    </span>
  );
}

/** "Shared by Chris", for Shared with me's rows. */
function sharedByLabel(sharedBy: SharedBy) {
  const who = sharedBy.person?.name || sharedBy.person?.email;
  return who ? `Shared by ${who}` : "Shared with you";
}

/** The row's "…" menu, where its date sits until it's hovered. */
const ROW_MENU_BUTTON =
  "absolute top-2 right-3.5 flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none transition-opacity hover:bg-foreground/[0.07] hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

function FolderRow({
  folder,
  sharedBy,
  onOpen,
}: {
  folder: Folder;
  sharedBy?: SharedBy | undefined;
  onOpen: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const compact = useListDensity() === "compact";
  const details = [
    "Folder",
    folder.shared ? "Shared" : null,
    folder.role === "viewer"
      ? "Can view"
      : sharedBy && folder.role === "editor"
        ? "Can edit"
        : null,
  ].filter(Boolean);
  return (
    <div role="listitem" className="group/row relative px-1 py-px">
      <ContextMenu.Root>
        <ContextMenu.Trigger
          render={
            <button type="button" onClick={onOpen} data-folder={folder.id} draggable={false} />
          }
          className={cn(
            "group relative flex w-full items-center gap-3 overflow-hidden rounded-lg px-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
            compact ? "py-1.5" : "py-2.5",
            menuOpen ? "bg-sidebar-row-hover" : "group-hover/row:bg-sidebar-row-hover",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "relative flex shrink-0 items-center justify-center rounded-md bg-accent/70 text-icon-muted",
              compact ? "size-6" : "size-9",
            )}
          >
            <FolderIcon className="size-4.5" strokeWidth={1.75} />
            {folder.shared || sharedBy ? (
              <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full border border-background bg-foreground text-background">
                <UsersIcon className="size-2.5" strokeWidth={2.5} />
              </span>
            ) : null}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="min-w-0 truncate text-sm leading-snug font-medium text-foreground">
              {folderLabel(folder)}
            </span>
            {compact ? null : (
              <span className="truncate text-sm leading-snug text-muted-foreground">
                {sharedBy
                  ? `${sharedByLabel(sharedBy)} · ${formatListDate(sharedBy.at)}`
                  : details.join(" · ")}
              </span>
            )}
          </div>
        </ContextMenu.Trigger>
        <MenuPopup>
          <FolderMenuItems folder={folder} onOpen={onOpen} />
        </MenuPopup>
      </ContextMenu.Root>
      <Menu open={menuOpen} onOpenChange={setMenuOpen}>
        <MenuTrigger
          render={
            <button
              type="button"
              aria-label={`Actions for ${folderLabel(folder)}`}
              className={cn(
                ROW_MENU_BUTTON,
                "top-1/2 -translate-y-1/2",
                menuOpen
                  ? "opacity-100"
                  : "opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100",
              )}
            />
          }
        >
          <EllipsisIcon className="size-4" />
        </MenuTrigger>
        <MenuPopup align="end">
          <FolderMenuItems folder={folder} onOpen={onOpen} />
        </MenuPopup>
      </Menu>
    </div>
  );
}

function DocumentRow({
  entry,
  selected,
  onPrefetch,
}: {
  entry: DocumentEntry;
  selected: boolean;
  onPrefetch: () => void;
}) {
  const host = useDriveHost();
  const { artifact, folderSlug, folderId, sharedBy } = entry;
  const [menuOpen, setMenuOpen] = useState(false);
  const compact = useListDensity() === "compact";
  const kind = KIND_META[documentKind(artifact)].one;
  const version = artifact.currentVersion?.number ?? 1;
  const href = `/${folderSlug}/a/${artifact.slug}`;
  const details = [
    kind,
    version > 1 ? `v${version}` : null,
    artifact.shared && !sharedBy ? "Shared" : null,
    sharedBy ? (artifact.role === "viewer" ? "Can view" : "Can edit") : null,
    artifact.archivedAt ? "Archived" : null,
  ].filter(Boolean);
  const menu = <DocumentMenuItems artifact={artifact} folderId={folderId} href={href} />;

  return (
    // Off-screen rows skip layout and paint; `auto` remembers each row's
    // real height once it has rendered.
    <div
      role="listitem"
      className={cn(
        "group/row relative px-1 py-px [content-visibility:auto]",
        compact ? "[contain-intrinsic-size:auto_38px]" : "[contain-intrinsic-size:auto_68px]",
      )}
    >
      <ContextMenu.Root>
        <ContextMenu.Trigger
          render={
            <Link
              to={host.href(
                "/" + encodeURIComponent(folderSlug) + "/a/" + encodeURIComponent(artifact.slug),
              )}

              search={(current) => ({ ...current, sheet: undefined })}
              data-slug={artifact.slug}
              aria-current={selected ? "page" : undefined}
              onMouseEnter={onPrefetch}
              onFocus={onPrefetch}
              draggable={false}
            />
          }
          className={cn(
            "group relative flex w-full gap-3 overflow-hidden rounded-lg px-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
            compact ? "items-center py-1.5" : "items-start py-2.5",
            selected
              ? "bg-sidebar-row-active"
              : menuOpen
                ? "bg-sidebar-row-hover"
                : "group-hover/row:bg-sidebar-row-hover",
          )}
        >
          <DocumentThumb artifact={artifact} className={compact ? "size-6" : "mt-0.5 size-9"} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-sm leading-snug font-medium text-foreground">
                {artifact.title}
              </span>
              <span
                className={cn(
                  "shrink-0 text-xs text-muted-foreground tabular-nums",
                  "group-focus-within/row:invisible group-hover/row:invisible",
                  menuOpen && "invisible",
                )}
              >
                {formatListDate(sharedBy?.at ?? artifact.updatedAt)}
              </span>
            </div>
            {compact ? null : (
              <>
                <span
                  className={cn(
                    "truncate text-sm leading-snug",
                    artifact.description || sharedBy
                      ? "text-muted-foreground"
                      : "text-muted-foreground/60",
                  )}
                >
                  {sharedBy
                    ? sharedByLabel(sharedBy)
                    : artifact.description || artifact.currentVersion?.entryPath || artifact.slug}
                </span>
                <span className="flex min-w-0 items-center gap-1 truncate text-2xs text-muted-foreground/75">
                  {artifact.shared && !sharedBy ? (
                    <UsersIcon aria-hidden className="size-3 shrink-0" />
                  ) : null}
                  <span className="truncate">{details.join(" · ")}</span>
                </span>
              </>
            )}
          </div>
        </ContextMenu.Trigger>
        <MenuPopup>{menu}</MenuPopup>
      </ContextMenu.Root>
      <Menu open={menuOpen} onOpenChange={setMenuOpen}>
        <MenuTrigger
          render={
            <button
              type="button"
              aria-label={`Actions for ${artifact.title}`}
              className={cn(
                ROW_MENU_BUTTON,
                menuOpen
                  ? "opacity-100"
                  : "opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100",
              )}
            />
          }
        >
          <EllipsisIcon className="size-4" />
        </MenuTrigger>
        <MenuPopup align="end">{menu}</MenuPopup>
      </Menu>
    </div>
  );
}

function DocumentListSkeleton() {
  return (
    <div className="flex flex-col" aria-hidden>
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="flex w-full items-start gap-3 px-4 py-3">
          <div className="size-9 shrink-0 animate-skeleton rounded-md bg-accent" />
          <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
            <div className="h-3.5 w-32 animate-skeleton rounded-full bg-secondary" />
            <div className="h-3 w-48 animate-skeleton rounded-full bg-accent" />
            <div className="h-2.5 w-20 animate-skeleton rounded-full bg-accent" />
          </div>
        </div>
      ))}
    </div>
  );
}
