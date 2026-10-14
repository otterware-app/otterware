import { withDriveSearch } from "~/otterware/drive/drivePaths";
import { useDriveHost } from "../../host";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "~/components/ui/empty";

import { useNavigate } from "@tanstack/react-router";
import { LockIcon } from "lucide-react";

import { useDrive } from "../home-view";

import { ContentLoading } from "./content-loading";
import { DocumentViewer, type DocumentLocation } from "./document-viewer";

/**
 * A document's route in the window: the viewer, scoped to the folder its URL
 * names (not the open one). A document shared with you on its own lives in a
 * folder you can't open: it's found among what's shared with you and opened
 * by its id. Anything else asks for access.
 */
export function DocumentRoute({
  folderSlug,
  slug,
  version,
  sheet,
}: {
  folderSlug: string;
  slug: string;
  version?: number | undefined;
  sheet?: string | undefined;
}) {
  const host = useDriveHost();
  const {
    folders,
    foldersLoaded,
    sharedItems,
    sharedLoading,
    narrow,
    expanded,
    toggleExpanded,
    mainIsLeftmost,
  } = useDrive();
  const navigate = useNavigate();
  const folder = folders.find((item) => item.slug === folderSlug);
  const shared = folder
    ? undefined
    : sharedItems.find(
        (item) =>
          item.artifact &&
          item.folderSlug === folderSlug &&
          (item.artifact.slug === slug || item.artifact.id === slug),
      )?.artifact;
  const location: DocumentLocation | null = folder
    ? { folderId: folder.id, folderSlug, reference: slug }
    : shared
      ? { folderId: undefined, folderSlug, reference: shared.id }
      : null;

  if (!location) {
    return (
      <>
        {foldersLoaded && !sharedLoading ? (
          <div className="flex h-full items-center justify-center">
            <div>
              <Empty size="compact">
                <EmptyMedia variant="icon">
                  <LockIcon />
                </EmptyMedia>
                <EmptyHeader>
                  <EmptyTitle>{"You need access"}</EmptyTitle>
                  <EmptyDescription>
                    {
                      "This document hasn’t been shared with you. Ask its owner to share it, or open the link they sent you."
                    }
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          </div>
        ) : (
          <ContentLoading />
        )}
      </>
    );
  }

  return (
    <DocumentViewer
      key={`${location.folderId ?? "shared"}:${location.reference}:${version ?? "current"}`}
      location={location}
      slug={shared?.slug ?? slug}
      version={version}
      sheet={sheet}
      onSheetChange={(next) =>
        void navigate({
          href: withDriveSearch(host.href(host.location.pathname), {
            ...Object.fromEntries(new URLSearchParams(host.location.search)),
            sheet: next,
          }),
          replace: true,
        })
      }
      expanded={expanded}
      onToggleExpanded={narrow ? undefined : toggleExpanded}
      roundedLeft={mainIsLeftmost}
    />
  );
}
