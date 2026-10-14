import { withDriveSearch } from "~/otterware/drive/drivePaths";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogPanel,
} from "~/components/ui/dialog";
import { toastManager } from "~/components/ui/toast";
import {
  ChevronLeftIcon,
  HistoryIcon,
  SparklesIcon,
  MoveRightIcon,
  Trash2Icon,
  ArchiveIcon,
  ArchiveRestoreIcon,
} from "lucide-react";
import type { ModuleHeaderAction } from "@otterware/module-kit/web";
import { useDriveStore, runDriveCommand } from "../../driveStore";
import { useModulePageFrameOverrides } from "~/otterware/ModulePageLayout";
import { useCommandHandlers } from "../keybindings/dispatch";
import { useFolders, folderLabel, folderPath } from "../folders";
import { useDocumentActions } from "./documents";
import { requestDeleteDocument } from "./delete-dialog";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "~/components/ui/empty";

import { Button } from "~/components/ui/button";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { isolatedContentUrl } from "@otterware/otter-cloud-client/drive";
import { useModulePageContext } from "@otterware/module-kit/web";
import { useDriveHost } from "../../host";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  DownloadIcon,
  FileWarningIcon,
  LinkIcon,
  Maximize2Icon,
  Minimize2Icon,
  UserPlusIcon,
} from "lucide-react";
import { documentKind } from "../../lib/document-kind";
import { artifactBootstrapQuery } from "../../lib/artifact-query";

import { cn } from "~/lib/utils";

import { ContentLoading } from "./content-loading";
import {
  copyAgentPrompt,
  useArchiveDocument,
  copyLink,
  downloadDocument,
  shareDocument,
} from "./document-menu";
import { formatRelative } from "./documents";

const DocumentPreview = lazy(() =>
  import("./document-preview").then((module) => ({
    default: module.DocumentPreview,
  })),
);

/** Where a document is, for its links and API calls. */
export interface DocumentLocation {
  /**
   * The folder you reach it through; undefined for a document shared with
   * you on its own, outside every folder you can open.
   */
  folderId: string | undefined;
  /** The folder in its links. */
  folderSlug: string;
  /** How API calls name it: its slug in `folderId`, or its id. */
  reference: string;
}

/**
 * Document content; page actions and title are registered with the host frame.
 */
export function DocumentViewer({
  location,
  slug,
  version,
  sheet,
  onSheetChange,
  expanded,
  onToggleExpanded,
  roundedLeft,
}: {
  location: DocumentLocation;
  /** The document's slug, from its link. */
  slug: string;
  version?: number | undefined;
  sheet?: string | undefined;
  onSheetChange: (sheet: string | undefined) => void;
  /** The sidebar and list are hidden, giving the document the window. */
  expanded: boolean;
  /** Absent on a phone, where the document always has the window. */
  onToggleExpanded?: (() => void) | undefined;
  /** Nothing to the viewer's left: its bottom-left corner follows the panel's. */
  roundedLeft: boolean;
}) {
  const navigate = useNavigate();
  const [editorActions, setEditorActions] = useState<HTMLDivElement | null>(null);
  const { folderId, folderSlug, reference } = location;
  const bootstrap = useQuery(artifactBootstrapQuery(folderId, reference, version));
  const artifact = bootstrap.data?.artifact ?? null;
  const versions = bootstrap.data?.versions ?? [];
  const bootstrapPreview = bootstrap.data?.preview ?? null;
  // Uploaded content (HTML, video) only ever loads from the isolated content
  // origin, never the app's: a preview anywhere else is refused.
  const preview = useMemo(() => {
    if (!bootstrapPreview) return null;
    try {
      // The signed URL needs no content cookie, so it loads outside otterware.app too.
      return {
        ...bootstrapPreview,
        url: isolatedContentUrl(bootstrapPreview.signedUrl ?? bootstrapPreview.url),
      };
    } catch {
      return null;
    }
  }, [bootstrapPreview]);
  const previewRefused = bootstrapPreview !== null && preview === null;
  const selected =
    versions.find((item) => item.number === version) ??
    versions.find((item) => item.id === artifact?.currentVersion?.id) ??
    artifact?.currentVersion ??
    null;
  const error =
    bootstrap.error instanceof Error
      ? bootstrap.error.message
      : previewRefused
        ? "This document’s preview isn’t on Drive’s content site, so it isn’t shown."
        : null;
  const host = useDriveHost();
  const seen = host.active && artifact && selected ? selected.number : null;
  const artifactId = artifact?.id;
  const onDocumentViewed = host.onDocumentViewed;
  useEffect(() => {
    if (artifactId && seen !== null) onDocumentViewed?.(artifactId, seen);
  }, [artifactId, seen, onDocumentViewed]);
  // What the side chat tells the agent about: this document, at this version.
  useModulePageContext(
    artifact
      ? {
          module: "drive",
          title: artifact.title,
          refs: [
            {
              kind: "drive.document",
              id: artifact.id,
              label: selected
                ? `${artifact.title} (version ${selected.number}${selected.number === artifact.currentVersion?.number ? ", current" : ""})`
                : artifact.title,
              href: artifact.url,
            },
          ],
        }
      : null,
    host.active,
  );
  const latest = artifact?.currentVersion?.number ?? 1;
  const kind =
    preview && selected ? documentKind(preview.contentType, selected.entryPath) : "frame";

  const [actionsOpen, setActionsOpen] = useState(false);
  const documentActions = useDriveStore((state) => state.documentActions);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const { folders } = useFolders();
  const { move } = useDocumentActions(folderId);
  const archive = useArchiveDocument(folderId);
  const destinations = folders.filter(
    (folder) => folder.id !== artifact?.folderId && folder.role === "owner",
  );
  const openVersion = (number: number) => {
    void navigate({
      href: withDriveSearch(
        host.href(
          `/${encodeURIComponent(folderSlug)}/a/${encodeURIComponent(slug)}${number === latest ? "" : `/v${number}`}`,
        ),
        Object.fromEntries(new URLSearchParams(host.location.search)),
      ),
    });
    setVersionsOpen(false);
  };
  useCommandHandlers({
    "document.actions": () => setActionsOpen(true),
    "document.versions": () => setVersionsOpen(true),
    "document.share": () => {
      if (artifact) shareDocument(artifact, folderId);
    },
    "document.copyLink": () => {
      if (artifact) void copyLink(artifact);
    },
    "document.copyPrompt": () => {
      if (artifact) void copyAgentPrompt(artifact);
    },
    "document.download": () => {
      if (artifact) void downloadDocument(artifact, folderId, selected?.number);
    },
    "document.move": () => setMoveOpen(true),
    "document.archive": () => {
      if (artifact && artifact.role !== "viewer") void archive(artifact, !artifact.archivedAt);
    },
    "document.delete": () => {
      if (artifact?.archivedAt && artifact.role === "owner")
        requestDeleteDocument({
          artifact,
          folderId,
          onDeleted: () => {
            void navigate({ to: host.href("/home") });
          },
        });
    },
    "document.expand": () => onToggleExpanded?.(),
  });
  const frame = useMemo(() => ({ title: artifact?.title ?? "Document" }), [artifact?.title]);
  useModulePageFrameOverrides(frame, host.active);
  const documentRole = artifact?.role;
  const archivedAt = artifact?.archivedAt;
  const versionNumber = selected?.number;
  const canExpand = Boolean(onToggleExpanded);
  useEffect(() => {
    if (!host.active || !artifactId) return;
    const action = (
      id: string,
      label: string,
      icon: ModuleHeaderAction["icon"],
    ): ModuleHeaderAction => ({
      id,
      label,
      icon,
      onSelect: () => runDriveCommand(`document.${id}`),
    });
    useDriveStore.setState({
      documentActions: [
        action("close", "Back to documents", ChevronLeftIcon),
        action("versions", `Version ${versionNumber ?? latest} · Choose version`, HistoryIcon),
        action("share", "Share document", UserPlusIcon),
        action("copyLink", "Copy link", LinkIcon),
        action("copyPrompt", "Copy prompt for an agent", SparklesIcon),
        action("download", "Download", DownloadIcon),
        ...(documentRole === "owner" && destinations.length
          ? [action("move", "Move document", MoveRightIcon)]
          : []),
        ...(documentRole !== "viewer"
          ? [
              action(
                "archive",
                archivedAt ? "Restore document" : "Archive document",
                archivedAt ? ArchiveRestoreIcon : ArchiveIcon,
              ),
            ]
          : []),
        ...(documentRole === "owner" && archivedAt
          ? [action("delete", "Delete permanently", Trash2Icon)]
          : []),
        ...(canExpand
          ? [
              action(
                "expand",
                expanded ? "Show the list" : "Full width",
                expanded ? Minimize2Icon : Maximize2Icon,
              ),
            ]
          : []),
      ],
    });
    return () => useDriveStore.setState({ documentActions: [] });
  }, [
    host.active,
    artifactId,
    documentRole,
    archivedAt,
    versionNumber,
    latest,
    destinations.length,
    canExpand,
    expanded,
  ]);

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div ref={setEditorActions} className="flex justify-end px-4 empty:hidden" />
      <Dialog open={actionsOpen} onOpenChange={setActionsOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Document actions</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            <div className="flex flex-col gap-2">
              {documentActions
                .filter((action) => !["close", "versions", "share"].includes(action.id))
                .map((action) => (
                  <Button
                    key={action.id}
                    variant={action.id === "delete" ? "destructive-outline" : "outline"}
                    onClick={() => {
                      setActionsOpen(false);
                      action.onSelect();
                    }}
                  >
                    <action.icon />
                    {action.label}
                  </Button>
                ))}
            </div>
          </DialogPanel>
        </DialogPopup>
      </Dialog>
      <Dialog open={versionsOpen} onOpenChange={setVersionsOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Versions of {artifact?.title}</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            <div className="flex flex-col gap-2">
              {versions.map((item) => (
                <Button
                  key={item.id}
                  variant={item.number === selected?.number ? "secondary" : "outline"}
                  onClick={() => openVersion(item.number)}
                >
                  v{item.number} · {item.label || "Untitled version"} ·{" "}
                  {formatRelative(item.createdAt)}
                  {item.createdBy ? ` · ${item.createdBy.name}` : ""}
                </Button>
              ))}
            </div>
          </DialogPanel>
        </DialogPopup>
      </Dialog>
      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Move {artifact?.title}</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            <div className="flex flex-col gap-2">
              {destinations.map((destination) => (
                <Button
                  key={destination.id}
                  variant="outline"
                  onClick={() => {
                    if (!artifact) return;
                    void move(artifact, destination.id).then(
                      (moved) => {
                        toastManager.add({
                          type: "success",
                          title: `Moved “${moved.title}” to ${folderLabel(destination)}`,
                        });
                        setMoveOpen(false);
                        void navigate({
                          to: host.href(
                            `/${encodeURIComponent(destination.slug)}/a/${encodeURIComponent(moved.slug)}`,
                          ),
                        });
                      },
                      (reason: unknown) =>
                        toastManager.add({
                          type: "error",
                          title: "Could not move the document",
                          description: reason instanceof Error ? reason.message : String(reason),
                        }),
                    );
                  }}
                >
                  {folderPath(folders, destination).map(folderLabel).join(" › ")}
                </Button>
              ))}
            </div>
          </DialogPanel>
        </DialogPopup>
      </Dialog>

      {/* The document, inside the panel's 1px edge and clipped to its
          rounded corners: the right ones, and the left ones with nothing to
          its left. */}
      <div className={cn("flex min-h-0 flex-1 pt-px pr-px pb-px", roundedLeft && "pl-px")}>
        <div
          className={cn(
            "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-r-xl",
            roundedLeft && "rounded-l-xl",
          )}
        >
          {error ? (
            <div className={"h-full"}>
              <Empty size="compact">
                <EmptyMedia variant="icon">
                  <FileWarningIcon />
                </EmptyMedia>
                <EmptyHeader>
                  <EmptyTitle>{"Couldn’t open this document"}</EmptyTitle>
                  <EmptyDescription>{error}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          ) : !artifact || !selected || !preview ? (
            <ContentLoading />
          ) : kind !== "frame" && kind !== "video" ? (
            <Suspense fallback={<ContentLoading />}>
              <DocumentPreview
                readOnly={artifact.role === "viewer"}
                actionsContainer={editorActions}
                kind={kind}
                entryPath={selected.entryPath}
                expectedCurrentVersion={artifact.versionCount}
                onSheetChange={onSheetChange}
                folderId={folderId}
                folderSlug={folderSlug}
                selectedSheet={sheet}
                slug={slug}
                reference={reference}
                version={selected.number}
              />
            </Suspense>
          ) : kind === "video" ? (
            <VideoPlayer
              key={`${slug}:${selected.number}`}
              src={preview.url}
              title={`${artifact.title}, version ${selected.number}`}
            />
          ) : (
            <iframe
              key={`${slug}:${selected.number}:${preview.url}`}
              className="size-full border-0 bg-white [color-scheme:light]"
              src={preview.url}
              title={`${artifact.title}, version ${selected.number}`}
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-downloads allow-modals"
              referrerPolicy="no-referrer"
            />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * A video document. The preview URL starts a content session and redirects to
 * the file, so it's kept from the first render: a refetched bootstrap brings
 * a new URL, which would restart the video.
 */
function VideoPlayer({ src, title }: { src: string; title: string }) {
  const [source] = useState(src);
  return (
    <div className="flex size-full items-center justify-center bg-black">
      <video
        className="size-full object-contain"
        src={source}
        aria-label={title}
        controls
        playsInline
        preload="metadata"
      />
    </div>
  );
}
