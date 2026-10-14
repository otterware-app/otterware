import { HomeActionError, type HomeItem } from "@otterware/module-kit/contracts";
import type { HomeContributor } from "@otterware/module-kit/engine";
import * as Effect from "effect/Effect";
import * as DriveService from "./DriveService.ts";
const HOME_ITEM_PREFIX = "drive-document:";

/** Linked or shared documents with versions the user has not seen. */
export const homeContributor = Effect.gen(function* () {
  const drive = yield* DriveService.DriveService;
  return {
    module: "drive",
    needsYou: drive.changedDocuments.pipe(
      Effect.map((entries) =>
        entries.map((entry): HomeItem => {
          const delta = entry.version - entry.viewedVersion;
          const versions =
            delta === 1 ? `v${entry.version}` : `v${entry.viewedVersion} → v${entry.version}`;
          return {
            id: `${HOME_ITEM_PREFIX}${entry.artifactId}`,
            module: "drive",
            kind: "drive.document-changed",
            title: entry.title,
            subtitle: [
              entry.updatedBy
                ? `${entry.updatedBy} published ${versions}`
                : `${versions} published`,
              entry.threadIds.length > 0
                ? `linked to ${entry.threadIds.length} thread${entry.threadIds.length === 1 ? "" : "s"}`
                : entry.shared
                  ? "shared with you"
                  : null,
            ]
              .filter((part) => part !== null)
              .join(" · "),
            occurredAt: entry.updatedAt,
            priority: entry.threadIds.length > 0 ? 40 : 30,
            actions: [
              { id: "see-changes", label: "See changes", primary: true },
              { id: "open", label: "Open" },
              { id: "mark-seen", label: "Mark as seen" },
            ],
            target: {
              route: `/drive${new URL(entry.url).pathname}`,
              params: {
                url: entry.url,
                artifactId: entry.artifactId,
                folderId: entry.folderId,
                folderSlug: entry.folderSlug,
                version: String(entry.version),
                viewedVersion: String(entry.viewedVersion),
                threadIds: entry.threadIds.join(","),
              },
            },
          };
        }),
      ),
    ),
    // Every action means the user looked (or chose not to): it stops being new.
    performAction: (itemId, actionId) =>
      Effect.gen(function* () {
        const artifactId = itemId.startsWith(HOME_ITEM_PREFIX)
          ? itemId.slice(HOME_ITEM_PREFIX.length)
          : null;
        const entry = (yield* drive.changedDocuments).find(
          (candidate) => candidate.artifactId === artifactId,
        );
        if (!entry) return;
        yield* drive.markViewed(entry.artifactId, entry.version);
      }).pipe(
        Effect.mapError(
          (cause) => new HomeActionError({ module: "drive", itemId, actionId, cause }),
        ),
      ),
  } satisfies HomeContributor;
});
