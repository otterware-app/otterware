import { DriveContract, DriveSettings, DRIVE_METHODS } from "@otterware/drive-contracts";
import { defineServerModule } from "@otterware/module-kit/engine";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as DriveService from "./DriveService.ts";
import { DRIVE_MIGRATIONS } from "./DriveStore.ts";
import { DriveToolkit } from "@otterware/drive-contracts";
import { handlers } from "./DriveToolkit.ts";
import { homeContributor } from "./DriveHome.ts";
import { DriveAccountSession } from "./DriveConnection.ts";
import { DriveUploadSources, uploadInputError } from "./DriveUploadSource.ts";

const rpcHandlers = Effect.gen(function* () {
  const drive = yield* DriveService.DriveService;
  return DriveContract.group.of({
    [DRIVE_METHODS.status]: () => drive.status,
    [DRIVE_METHODS.subscribeStatus]: () => drive.statusChanges,
    [DRIVE_METHODS.connect]: () => drive.connect,
    [DRIVE_METHODS.disconnect]: () => drive.disconnect,
    [DRIVE_METHODS.syncAccount]: ({ token }) => drive.syncAccount(token),
    [DRIVE_METHODS.listFolders]: () =>
      drive.listFolders.pipe(Effect.map((folders) => ({ folders }))),
    [DRIVE_METHODS.listDocuments]: (input) =>
      drive.listDocuments(input).pipe(Effect.map((documents) => ({ documents }))),
    [DRIVE_METHODS.documentDetail]: ({ reference, version }) =>
      drive.documentDetail(reference, version),
    [DRIVE_METHODS.readDocument]: ({ document, version }) => drive.readDocument(document, version),
    [DRIVE_METHODS.createDocument]: (input) =>
      drive.createDocument(input).pipe(Effect.map((document) => ({ document }))),
    [DRIVE_METHODS.updateDocument]: ({ document, ...input }) =>
      drive
        .updateDocument({ reference: document, ...input })
        .pipe(Effect.map((document) => ({ document }))),
    [DRIVE_METHODS.uploadFile]: (input) =>
      drive.uploadFile(input).pipe(Effect.map((document) => ({ document }))),
    [DRIVE_METHODS.shareDocument]: ({ document, ...input }) => drive.shareDocument(document, input),
    [DRIVE_METHODS.getShareLink]: ({ document }) => drive.getShareLink(document),
    [DRIVE_METHODS.shareFolder]: ({ folder, ...input }) => drive.shareFolder(folder, input),
    [DRIVE_METHODS.getFolderSharing]: ({ folder }) => drive.getFolderSharing(folder),
    [DRIVE_METHODS.markViewed]: ({ artifactId, version }) => drive.markViewed(artifactId, version),
    [DRIVE_METHODS.linkDocument]: ({ threadId, url, source }) =>
      drive.linkDocument({ threadId, reference: url, source: source ?? "manual" }),
    [DRIVE_METHODS.unlinkDocument]: ({ threadId, linkId }) =>
      drive.unlinkDocument(threadId, linkId),
    [DRIVE_METHODS.listThreadLinks]: ({ threadId }) =>
      drive.listThreadLinks(threadId).pipe(Effect.map((links) => ({ links }))),
    [DRIVE_METHODS.subscribeThreadLinks]: () => drive.linkChanges,
  });
});

export const makeDriveModule = <E, R, E2, R2>(
  account: Layer.Layer<DriveAccountSession, E, R>,
  uploads: Layer.Layer<DriveUploadSources, E2, R2>,
) =>
  defineServerModule({
    contract: DriveContract,
    migrations: DRIVE_MIGRATIONS,
    layer: DriveService.layerStart.pipe(
      Layer.provideMerge(DriveService.layer),
      Layer.provide(account),
      Layer.provide(uploads),
    ),
    rpcHandlers,
    tools: { toolkit: DriveToolkit, handlers },
    homeContributor,
    settings: DriveSettings,
    agentInstructions: `## Otter Drive

The user's documents live in Otter Drive (drive.otterware.app). Use the \`drive_\` tools for them, not the \`otterdrive\` CLI. Inspect before changing (\`drive_get_document\`), and pass the inspected version as \`ifVersion\` to \`drive_update_document\`; on a conflict, re-read and report it instead of retrying. Use \`drive_upload_file\` for any binary or text file (streamed uploads and multipart), including a new version with the inspected \`ifVersion\`. Paths refer to the server machine, including workspace files and its attachments directory. If the file is on another machine you can reach (e.g. over SSH), copy it to a temporary local path first, then upload that path; only ask the user to attach the file if you can't reach it. Use \`drive_get_share_link\` or \`drive_get_folder_sharing\` to inspect access, and \`drive_share_document\` or \`drive_share_folder\` to change it. Link sharing requires recipients to sign in. Folder sharing applies recursively; shared-drive email grants manage membership. Versions are immutable. Never share a document unless the user asks. Link the Drive documents a thread works on with \`drive_link_document_to_thread\`, and report a document's URL after creating or updating it.`,
  });

export const DriveModule = makeDriveModule(
  Layer.succeed(DriveAccountSession, { current: Effect.succeed(null) }),
  Layer.succeed(DriveUploadSources, {
    prepare: () => Effect.fail(uploadInputError("This host has no file source adapter.")),
  }),
);
