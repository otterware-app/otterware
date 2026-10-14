import { withDriveSearch } from "~/otterware/drive/drivePaths";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "~/components/ui/empty";
import { toastManager } from "~/components/ui/toast";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import type { Artifact, SharedItem } from "@otterware/drive-contracts/api";

import { cn } from "~/lib/utils";
import { useShellSelection, useModulePageContext } from "@otterware/module-kit/web";
import { useDriveHost } from "../host";
import { folderUrl } from "../lib/links";
import { UsersIcon } from "lucide-react";
import { DeleteDocumentDialogHost } from "./drive/delete-dialog";
import {
  Breadcrumbs,
  DocumentList,
  requestOpenSearch,
  type ListEntry,
} from "./drive/document-list";
import {
  documentKind,
  inView,
  useDocumentActions,
  useDocuments,
  visibleDocuments,
  type DriveSearch,
} from "./drive/documents";
import { DropOverlay, useDropUpload } from "./drive/drop-upload";
import { FolderDialogsHost } from "./drive/folder-dialogs";
import { NewFolderDialog, NewFolderDialogHost } from "./drive/new-folder-dialog";
import { ShareDialogHost } from "./drive/share-dialog";
import { UploadDialogHost, requestUpload } from "./drive/upload-dialog";
import { useCommandHandlers } from "./keybindings/dispatch";
import { DocumentListResizer, useDocumentListWidth } from "./drive/document-split";
import { useIsMobile } from "~/hooks/useMediaQuery";
import { useDriveStore } from "../driveStore";
import { useFolderRole } from "./folder-role";
import {
  driveForFolder,
  folderLabel,
  folderPath,
  isInSharedFolder,
  useFolders,
  useSharedWithMe,
  type Folder,
} from "./folders";

/** Drive content and document actions inside the host frame. */
export type Place =
  | { kind: "home" }
  | { kind: "document"; folderSlug: string; slug: string }
  | { kind: "settings"; pane: string };

interface DriveContextValue {
  /** The folder showing: the open document's, else the open one. */
  folder: Folder | null;
  folders: Folder[];
  /** Your folders are known. */
  foldersLoaded: boolean;
  /** Folders are known and there are none. */
  noFolder: boolean;
  /** The folder's active documents (the overview's and the counts'). */
  documents: Artifact[];
  documentsLoading: boolean;
  /** "Shared with me" is showing. */
  sharedView: boolean;
  /** What other people shared with you, archived documents included. */
  sharedItems: SharedItem[];
  /** What Shared with me lists. */
  sharedListed: SharedItem[];
  sharedLoading: boolean;
  openFolder: (folder: Folder) => void;
  openShared: () => void;
  narrow: boolean;
  /** The viewer has the window: sidebar and list hidden. */
  expanded: boolean;
  toggleExpanded: () => void;
  /** Nothing sits left of the main pane (its corner follows the panel's). */
  mainIsLeftmost: boolean;
}

const DriveContext = createContext<DriveContextValue | null>(null);

export function useDrive(): DriveContextValue {
  const value = useContext(DriveContext);
  if (!value) throw new Error("useDrive() outside the drive window");
  return value;
}

function matches(needle: string, ...values: string[]) {
  return !needle || values.join(" ").toLowerCase().includes(needle);
}

export function DriveHome({
  place,
  search,
  onSearchChange,
  children,
}: {
  place: Place;
  search: DriveSearch;
  /** Changes the list's URL state (typing replaces, clicks push). */
  onSearchChange: (update: Partial<DriveSearch>, replace?: boolean) => void;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const narrow = useIsMobile();
  const { activeFolder, loaded, folders, selectFolder } = useFolders();
  const shared = useSharedWithMe();

  // The folder showing: the open document's (by its URL), else the open one.
  const routeFolder =
    place.kind === "document"
      ? (folders.find((folder) => folder.slug === place.folderSlug) ?? null)
      : null;
  // A document shared on its own lives in a folder you can't open: the list
  // shows what's shared with you instead.
  const sharedDocumentOpen = place.kind === "document" && loaded && !routeFolder;
  const sharedView = search.view === "shared" || sharedDocumentOpen;
  const folder = sharedView ? null : place.kind === "document" ? routeFolder : activeFolder;

  // The open folder follows the URL (links, Back), and the URL names the
  // open folder once it's known.
  useEffect(() => {
    if (!loaded || place.kind !== "home" || search.view === "shared") return;
    if (search.folder && search.folder !== activeFolder?.id) {
      if (folders.some((item) => item.id === search.folder)) void selectFolder(search.folder);
    } else if (!search.folder && activeFolder) onSearchChange({ folder: activeFolder.id }, true);
  }, [
    loaded,
    place.kind,
    search.view,
    search.folder,
    activeFolder,
    folders,
    selectFolder,
    onSearchChange,
  ]);

  // A document opened from another folder (a link, the palette) makes that
  // folder the open one, so closing it, uploads and Settings follow it.
  const selecting = useRef<string | null>(null);
  useEffect(() => {
    if (!routeFolder || !activeFolder || routeFolder.id === activeFolder.id) return;
    if (search.view === "shared") return;
    if (selecting.current === routeFolder.id) return;
    selecting.current = routeFolder.id;
    // A failure keeps the mark, so it isn't retried on every render.
    void selectFolder(routeFolder.id).then(
      () => {
        selecting.current = null;
      },
      () => undefined,
    );
  }, [routeFolder, activeFolder, selectFolder, search.view]);

  // The side chat's context: the folder or view showing (a document's own
  // viewer publishes it instead while one is open).
  const host = useDriveHost();
  const driveId = driveForFolder(folders, folder)?.id ?? null;
  useEffect(() => {
    if (host.active && driveId) useShellSelection.getState().selectSpace("drive", driveId);
  }, [host.active, driveId]);
  useModulePageContext(
    sharedView
      ? { module: "drive", title: "Shared with me", refs: [] }
      : folder
        ? {
            module: "drive",
            title: folderLabel(folder),
            refs: [
              {
                kind: "drive.folder",
                id: folder.id,
                label: folderPath(folders, folder).map(folderLabel).join(" › "),
                href: folderUrl(folder.id),
              },
            ],
          }
        : null,
    host.active && place.kind !== "document",
  );

  useFolderRole(folder?.id, Boolean(folder));
  const status = search.view === "archived" ? "archived" : "active";
  const active = useDocuments(folder?.id, "active");
  // The list's own source: the same query as `active` unless it's Archived.
  const listSource = useDocuments(folder?.id, status);
  const { put, removed } = useDocumentActions(folder?.id);

  // The list: the folder's folders (Google Drive puts them first) and its
  // documents, or what's shared with you.
  const { entries, totalInView } = useMemo((): {
    entries: ListEntry[];
    totalInView: number;
  } => {
    const needle = search.q?.trim().toLowerCase() ?? "";
    const byName = (left: string, right: string) =>
      search.sort === "za" ? right.localeCompare(left) : left.localeCompare(right);
    if (sharedView) {
      const items = shared.listed.filter((item) =>
        item.type === "folder"
          ? !search.kind && matches(needle, item.folder!.name)
          : (!search.kind || documentKind(item.artifact!) === search.kind) &&
            matches(needle, item.artifact!.title, item.artifact!.slug, item.artifact!.description),
      );
      const name = (item: SharedItem) => item.folder?.name ?? item.artifact!.title;
      items.sort((left, right) => {
        if (left.type !== right.type) return left.type === "folder" ? -1 : 1;
        if (search.sort === "az" || search.sort === "za") return byName(name(left), name(right));
        return right.sharedAt.localeCompare(left.sharedAt);
      });
      return {
        totalInView: shared.listed.length,
        entries: items.map((item): ListEntry => {
          const sharedBy = { person: item.sharedBy, at: item.sharedAt };
          if (item.type === "folder") return { type: "folder", folder: item.folder!, sharedBy };
          const artifact = item.artifact!;
          // Through a folder you can open, or on its own, by id.
          const via = folders.find((entry) => entry.id === artifact.folderId);
          return {
            type: "document",
            artifact,
            folderSlug: item.folderSlug,
            folderId: via?.id,
            sharedBy,
          };
        }),
      };
    }
    if (!folder) return { entries: [], totalInView: 0 };
    const view = search.view ?? "all";
    const subfolders =
      view === "all" && !search.kind
        ? folders
            .filter((item) => item.parentId === folder.id && matches(needle, item.name))
            .sort((left, right) => byName(left.name, right.name))
        : [];
    return {
      totalInView:
        listSource.documents.filter((artifact) => inView(artifact, view)).length +
        subfolders.length,
      entries: [
        ...subfolders.map((item): ListEntry => ({
          type: "folder",
          folder: item,
        })),
        ...visibleDocuments(listSource.documents, search).map((artifact): ListEntry => ({
          type: "document",
          artifact,
          folderSlug: folder.slug,
          folderId: folder.id,
        })),
      ],
    };
  }, [sharedView, shared.listed, folder, folders, listSource.documents, search]);

  const expanded = useDriveStore((state) => state.viewerExpanded);
  const setExpanded = (value: boolean) => useDriveStore.setState({ viewerExpanded: value });
  const listPane = useDocumentListWidth();
  const settingsOpen = place.kind === "settings";
  const documentOpen = place.kind === "document";
  const viewerExpanded = documentOpen && expanded && !narrow;
  const showList = !settingsOpen && !viewerExpanded && (!narrow || !documentOpen);
  const showMain = !narrow || documentOpen || settingsOpen;
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const goHome = (update: Partial<DriveSearch> = {}) =>
    void navigate({ href: withDriveSearch(host.href("/home"), { ...search, ...update }) });

  const openFolder = (next: Folder) => {
    void selectFolder(next.id).catch((reason: unknown) =>
      toastManager.add({
        type: "error",
        title: "Could not open the folder",
        description: reason instanceof Error ? reason.message : String(reason),
      }),
    );
    // Leave an open document: its folder would otherwise stay the open one.
    goHome({ folder: next.id, view: undefined, kind: undefined, q: undefined });
  };

  const openShared = () => {
    goHome({ folder: undefined, view: "shared", kind: undefined, q: undefined });
  };

  const focusSearch = () => {
    if (!showList) {
      if (settingsOpen || narrow) goHome();
      else setExpanded(false);
    }
    requestOpenSearch();
  };

  const drives = folders.filter((item) => !item.parentId);
  useCommandHandlers({
    "folder.new": () => {
      if (folder && folder.role !== "viewer") setNewFolderOpen(true);
    },
    "search.focus": () => focusSearch(),
    "document.upload": () => {
      if (!folder || folder.role === "viewer") return false;
      requestUpload();
    },
    "document.close": () => {
      if (!documentOpen) return false;
      goHome();
    },
    ...Object.fromEntries(
      drives.slice(0, 9).map((item, index) => [`folder.jump.${index + 1}`, () => openFolder(item)]),
    ),
  });

  const drop = useDropUpload(folder, put);

  const context: DriveContextValue = {
    folder,
    folders,
    foldersLoaded: loaded,
    noFolder: loaded && folders.length === 0,
    documents: active.documents,
    documentsLoading: active.loading,
    sharedView,
    sharedItems: shared.items,
    sharedListed: shared.listed,
    sharedLoading: shared.loading,
    openFolder,
    openShared,
    narrow,
    expanded: viewerExpanded,
    toggleExpanded: () => setExpanded(!expanded),
    mainIsLeftmost: !showList,
  };

  const inSharedFolder = isInSharedFolder(folders, folder);
  const view = search.view ?? "all";
  const heading = sharedView ? (
    <Breadcrumbs trail={[{ label: "Shared with me" }]} />
  ) : folder && view === "all" ? (
    <Breadcrumbs
      trail={[
        ...(inSharedFolder ? [{ label: "Shared with me", onClick: openShared }] : []),
        ...folderPath(folders, folder).map((item) => ({
          label: folderLabel(item),
          onClick: () => openFolder(item),
        })),
      ]}
    />
  ) : (
    <span className="truncate">
      {`${totalInView} ${totalInView === 1 ? "document" : "documents"}${
        view === "archived" ? " archived" : view === "recent" ? " this week" : ""
      }`}
      {folder ? ` in ${folderLabel(folder)}` : ""}
    </span>
  );

  return (
    <DriveContext value={context}>
      <div className="relative flex h-full min-h-0 flex-1 overflow-hidden" {...drop.handlers}>
        {showList ? (
          <>
            <div
              ref={listPane.paneRef}
              style={narrow ? undefined : { width: listPane.width }}
              className={cn(
                "min-h-0 overflow-hidden border-r border-border",
                narrow ? "min-w-0 flex-1" : "shrink-0",
              )}
            >
              <DocumentList
                entries={entries}
                heading={heading}
                searchPlaceholder={
                  sharedView
                    ? "Search Shared with me"
                    : `Search ${folder ? folderLabel(folder) : "documents"}`
                }
                totalInView={totalInView}
                loading={
                  sharedView ? shared.loading : !context.noFolder && (!folder || listSource.loading)
                }
                error={sharedView ? shared.error : listSource.error}
                search={search}
                selectedSlug={documentOpen ? place.slug : null}
                searchRef={searchRef}
                emptyState={
                  sharedView && !search.q && !search.kind ? (
                    <div className={"h-full px-6"}>
                      <Empty size="compact">
                        <EmptyMedia variant="icon">
                          <UsersIcon />
                        </EmptyMedia>
                        <EmptyHeader>
                          <EmptyTitle>{"Nothing shared with you yet"}</EmptyTitle>
                          <EmptyDescription>
                            {
                              "When someone shares a folder or a document with you, it shows up here."
                            }
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    </div>
                  ) : undefined
                }
                onOpenFolder={openFolder}
                onSearchChange={(update) => onSearchChange(update, "q" in update)}
              />
            </div>
            {narrow ? null : (
              <DocumentListResizer label="Resize list" onPointerDown={listPane.start} />
            )}
          </>
        ) : null}
        {showMain ? (
          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
        ) : null}

        {drop.dragging ? <DropOverlay folder={folder} /> : null}
      </div>
      <NewFolderDialog open={newFolderOpen} onOpenChange={setNewFolderOpen} parent={folder} />
      <NewFolderDialogHost />
      <FolderDialogsHost />
      <ShareDialogHost />
      <UploadDialogHost
        folder={folder}
        onUploaded={(uploaded) => {
          put(uploaded);
          if (folder)
            void navigate({
              to: host.href(
                "/" + encodeURIComponent(folder.slug) + "/a/" + encodeURIComponent(uploaded.slug),
              ),
            });
        }}
      />
      <DeleteDocumentDialogHost
        onDeleted={(artifact, folderId) => {
          if (folderId === folder?.id) removed(artifact);
          if (documentOpen && place.slug === artifact.slug) goHome();
        }}
      />
    </DriveContext>
  );
}
