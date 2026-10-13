import { DriveToolkit, DriveNoCallingThreadError } from "@otterware/drive-contracts";
import { ModuleToolCaller } from "@otterware/module-kit/engine";
import * as Effect from "effect/Effect";
import { DriveService } from "./DriveService.ts";
export const handlers = Effect.gen(function* () {
  const drive = yield* DriveService;
  const suite = Effect.void;
  const callingThread = Effect.service(ModuleToolCaller).pipe(
    Effect.flatMap((scope) =>
      scope.threadId === null
        ? Effect.fail(new DriveNoCallingThreadError({}))
        : Effect.succeed(scope.threadId as string),
    ),
  );
  return DriveToolkit.of({
    drive_list_folders: () =>
      suite.pipe(
        Effect.andThen(drive.listFolders),
        Effect.map((folders) => ({ folders })),
      ),
    drive_list_documents: (input) =>
      suite.pipe(
        Effect.andThen(drive.listDocuments(input)),
        Effect.map((documents) => ({ documents })),
      ),
    drive_get_document: ({ document }) =>
      suite.pipe(
        Effect.andThen(drive.documentDetail(document)),
        Effect.map((detail) => ({ document: detail.document, versions: detail.versions })),
      ),
    drive_read_document: ({ document, version }) =>
      suite.pipe(Effect.andThen(drive.readDocument(document, version))),
    drive_create_document: (input) =>
      suite.pipe(
        Effect.andThen(drive.createDocument(input)),
        Effect.map((document) => ({ document })),
      ),
    drive_update_document: ({ document, content, ifVersion, label }) =>
      suite.pipe(
        Effect.andThen(drive.updateDocument({ reference: document, content, ifVersion, label })),
        Effect.map((updated) => ({ document: updated })),
      ),
    drive_upload_file: (input) =>
      suite.pipe(
        Effect.andThen(drive.uploadFile(input)),
        Effect.map((document) => ({ document })),
      ),
    drive_share_document: ({ document, ...input }) =>
      suite.pipe(Effect.andThen(drive.shareDocument(document, input))),
    drive_get_share_link: ({ document }) =>
      suite.pipe(Effect.andThen(drive.getShareLink(document))),
    drive_share_folder: ({ folder, ...input }) =>
      suite.pipe(Effect.andThen(drive.shareFolder(folder, input))),
    drive_get_folder_sharing: ({ folder }) =>
      suite.pipe(Effect.andThen(drive.getFolderSharing(folder))),
    drive_link_document_to_thread: ({ document }) =>
      callingThread.pipe(
        Effect.flatMap((threadId) =>
          drive.linkDocument({ threadId, reference: document, source: "agent" }),
        ),
      ),
    drive_unlink_document_from_thread: ({ document }) =>
      callingThread.pipe(Effect.flatMap((threadId) => drive.unlinkDocument(threadId, document))),
    drive_list_thread_documents: () =>
      callingThread.pipe(
        Effect.flatMap((threadId) => drive.listThreadLinks(threadId)),
        Effect.map((links) => ({ links })),
      ),
  });
});
