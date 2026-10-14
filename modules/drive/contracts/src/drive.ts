import * as Schema from "effect/Schema";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";
import {
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  PositiveInt,
  ThreadId,
  TrimmedNonEmptyString,
} from "@t3tools/contracts";
import { defineModuleContract, moduleRpcErrors } from "@otterware/module-kit/contracts";
import {
  CreateDocumentTool,
  UpdateDocumentTool,
  UploadFileTool,
  ShareDocumentTool,
  GetShareLinkTool,
  ShareFolderTool,
  GetFolderSharingTool,
  ReadDocumentTool,
} from "./tools.ts";
import {
  DriveError,
  DriveConnectionStatus,
  DriveFolder,
  DriveDocumentDetail,
  DriveThreadLink,
  DriveThreadLinkSource,
  DriveDocumentSummary,
} from "./models.ts";
export * from "./models.ts";
const DriveRpcError = moduleRpcErrors(DriveError);

// ---------------------------------------------------------------------------
// RPC
// ---------------------------------------------------------------------------

export const DRIVE_METHODS = {
  createDocument: "drive.createDocument",
  updateDocument: "drive.updateDocument",
  uploadFile: "drive.uploadFile",
  shareDocument: "drive.shareDocument",
  getShareLink: "drive.getShareLink",
  shareFolder: "drive.shareFolder",
  getFolderSharing: "drive.getFolderSharing",
  readDocument: "drive.readDocument",
  status: "drive.status",
  subscribeStatus: "drive.subscribeStatus",
  connect: "drive.connect",
  syncAccount: "drive.syncAccount",
  disconnect: "drive.disconnect",
  listFolders: "drive.listFolders",
  listDocuments: "drive.listDocuments",
  documentDetail: "drive.documentDetail",
  markViewed: "drive.markViewed",
  linkDocument: "drive.linkDocument",
  unlinkDocument: "drive.unlinkDocument",
  listThreadLinks: "drive.listThreadLinks",
  subscribeThreadLinks: "drive.subscribeThreadLinks",
} as const;

export const DriveListDocumentsInput = Schema.Struct({
  /** `recent`: your drives' latest documents; `shared`: shared with you; `folder`: one folder. */
  scope: Schema.Literals(["recent", "shared", "folder"]),
  folderId: Schema.optional(Schema.String),
  /** Filters by title, slug and description (Drive's API has no search). */
  query: Schema.optional(Schema.String),
});
export type DriveListDocumentsInput = typeof DriveListDocumentsInput.Type;

const DriveStatusRpc = Rpc.make(DRIVE_METHODS.status, {
  payload: Schema.Struct({}),
  success: DriveConnectionStatus,
  error: moduleRpcErrors(),
});

const DriveSubscribeStatusRpc = Rpc.make(DRIVE_METHODS.subscribeStatus, {
  payload: Schema.Struct({}),
  success: DriveConnectionStatus,
  error: moduleRpcErrors(),
  stream: true,
});

const DriveConnectRpc = Rpc.make(DRIVE_METHODS.connect, {
  payload: Schema.Struct({}),
  success: DriveConnectionStatus,
  error: DriveRpcError,
});

const DriveDisconnectRpc = Rpc.make(DRIVE_METHODS.disconnect, {
  payload: Schema.Struct({}),
  success: DriveConnectionStatus,
  error: DriveRpcError,
});

const DriveSyncAccountRpc = Rpc.make(DRIVE_METHODS.syncAccount, {
  payload: Schema.Struct({ token: Schema.NullOr(Schema.String) }),
  success: DriveConnectionStatus,
  error: DriveRpcError,
});

const DriveListFoldersRpc = Rpc.make(DRIVE_METHODS.listFolders, {
  payload: Schema.Struct({}),
  success: Schema.Struct({ folders: Schema.Array(DriveFolder) }),
  error: DriveRpcError,
});

const DriveListDocumentsRpc = Rpc.make(DRIVE_METHODS.listDocuments, {
  payload: DriveListDocumentsInput,
  success: Schema.Struct({ documents: Schema.Array(DriveDocumentSummary) }),
  error: DriveRpcError,
});

const DriveDocumentDetailRpc = Rpc.make(DRIVE_METHODS.documentDetail, {
  payload: Schema.Struct({
    /** The artifact id, or any Drive document URL. */
    reference: TrimmedNonEmptyString,
    /** Preview this version instead of the current one. */
    version: Schema.optional(PositiveInt),
  }),
  success: DriveDocumentDetail,
  error: DriveRpcError,
});

const DriveMarkViewedRpc = Rpc.make(DRIVE_METHODS.markViewed, {
  payload: Schema.Struct({ artifactId: TrimmedNonEmptyString, version: Schema.Int }),
  success: Schema.Void,
  error: DriveRpcError,
});

const DriveLinkDocumentRpc = Rpc.make(DRIVE_METHODS.linkDocument, {
  payload: Schema.Struct({
    threadId: ThreadId,
    /** Any Drive document or share URL. */
    url: TrimmedNonEmptyString,
    source: Schema.optional(DriveThreadLinkSource),
  }),
  success: Schema.Struct({ link: DriveThreadLink, alreadyLinked: Schema.Boolean }),
  error: DriveRpcError,
});

const DriveUnlinkDocumentRpc = Rpc.make(DRIVE_METHODS.unlinkDocument, {
  payload: Schema.Struct({ threadId: ThreadId, linkId: TrimmedNonEmptyString }),
  success: Schema.Struct({ wasLinked: Schema.Boolean }),
  error: DriveRpcError,
});

const DriveListThreadLinksRpc = Rpc.make(DRIVE_METHODS.listThreadLinks, {
  payload: Schema.Struct({ threadId: ThreadId }),
  success: Schema.Struct({ links: Schema.Array(DriveThreadLink) }),
  error: DriveRpcError,
});

/** Every thread's links, re-sent whole whenever one changes. Few enough to send whole. */
const DriveSubscribeThreadLinksRpc = Rpc.make(DRIVE_METHODS.subscribeThreadLinks, {
  payload: Schema.Struct({}),
  success: Schema.Struct({ links: Schema.Array(DriveThreadLink) }),
  error: moduleRpcErrors(),
  stream: true,
});

export const DriveRpcGroup = RpcGroup.make(
  Rpc.make(DRIVE_METHODS.createDocument, {
    payload: CreateDocumentTool.parametersSchema,
    success: CreateDocumentTool.successSchema,
    error: DriveRpcError,
  }),
  Rpc.make(DRIVE_METHODS.updateDocument, {
    payload: UpdateDocumentTool.parametersSchema,
    success: UpdateDocumentTool.successSchema,
    error: DriveRpcError,
  }),
  Rpc.make(DRIVE_METHODS.uploadFile, {
    payload: UploadFileTool.parametersSchema,
    success: UploadFileTool.successSchema,
    error: DriveRpcError,
  }),
  Rpc.make(DRIVE_METHODS.shareDocument, {
    payload: ShareDocumentTool.parametersSchema,
    success: ShareDocumentTool.successSchema,
    error: DriveRpcError,
  }),
  Rpc.make(DRIVE_METHODS.getShareLink, {
    payload: GetShareLinkTool.parametersSchema,
    success: GetShareLinkTool.successSchema,
    error: DriveRpcError,
  }),
  Rpc.make(DRIVE_METHODS.shareFolder, {
    payload: ShareFolderTool.parametersSchema,
    success: ShareFolderTool.successSchema,
    error: DriveRpcError,
  }),
  Rpc.make(DRIVE_METHODS.getFolderSharing, {
    payload: GetFolderSharingTool.parametersSchema,
    success: GetFolderSharingTool.successSchema,
    error: DriveRpcError,
  }),
  Rpc.make(DRIVE_METHODS.readDocument, {
    payload: ReadDocumentTool.parametersSchema,
    success: ReadDocumentTool.successSchema,
    error: DriveRpcError,
  }),
  DriveStatusRpc,
  DriveSubscribeStatusRpc,
  DriveConnectRpc,
  DriveDisconnectRpc,
  DriveSyncAccountRpc,
  DriveListFoldersRpc,
  DriveListDocumentsRpc,
  DriveDocumentDetailRpc,
  DriveMarkViewedRpc,
  DriveLinkDocumentRpc,
  DriveUnlinkDocumentRpc,
  DriveListThreadLinksRpc,
  DriveSubscribeThreadLinksRpc,
);

export const DriveContract = defineModuleContract({
  id: "drive",
  group: DriveRpcGroup,
  scopes: {
    [DRIVE_METHODS.createDocument]: AuthOrchestrationOperateScope,
    [DRIVE_METHODS.updateDocument]: AuthOrchestrationOperateScope,
    [DRIVE_METHODS.uploadFile]: AuthOrchestrationOperateScope,
    [DRIVE_METHODS.shareDocument]: AuthOrchestrationOperateScope,
    [DRIVE_METHODS.getShareLink]: AuthOrchestrationReadScope,
    [DRIVE_METHODS.shareFolder]: AuthOrchestrationOperateScope,
    [DRIVE_METHODS.getFolderSharing]: AuthOrchestrationReadScope,
    [DRIVE_METHODS.readDocument]: AuthOrchestrationReadScope,
    [DRIVE_METHODS.status]: AuthOrchestrationReadScope,
    [DRIVE_METHODS.subscribeStatus]: AuthOrchestrationReadScope,
    [DRIVE_METHODS.connect]: AuthOrchestrationOperateScope,
    [DRIVE_METHODS.disconnect]: AuthOrchestrationOperateScope,
    [DRIVE_METHODS.syncAccount]: AuthOrchestrationOperateScope,
    [DRIVE_METHODS.listFolders]: AuthOrchestrationReadScope,
    [DRIVE_METHODS.listDocuments]: AuthOrchestrationReadScope,
    [DRIVE_METHODS.documentDetail]: AuthOrchestrationReadScope,
    [DRIVE_METHODS.markViewed]: AuthOrchestrationOperateScope,
    [DRIVE_METHODS.linkDocument]: AuthOrchestrationOperateScope,
    [DRIVE_METHODS.unlinkDocument]: AuthOrchestrationOperateScope,
    [DRIVE_METHODS.listThreadLinks]: AuthOrchestrationReadScope,
    [DRIVE_METHODS.subscribeThreadLinks]: AuthOrchestrationReadScope,
  },
});
