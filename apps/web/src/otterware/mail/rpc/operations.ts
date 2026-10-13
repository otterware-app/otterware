import { MailOperations } from "@otterware/mail-contracts/rpc";
import {
  createEnvironmentRpcCommand,
  runAtomCommand,
  squashAtomCommandFailure,
  type AtomCommand,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { connectionAtomRuntime } from "../../../connection/runtime";
import { appAtomRegistry } from "../../../rpc/atomRegistry";

function operation<P, A, E>(
  command: AtomCommand<{ environmentId: EnvironmentId; input: P }, A, E>,
  decode: (value: unknown) => P,
) {
  return async (environmentId: EnvironmentId, input: unknown): Promise<unknown> => {
    const result = await runAtomCommand(
      appAtomRegistry,
      command,
      { environmentId, input: decode(input ?? {}) },
      { reportFailure: false },
    );
    if (result._tag === "Failure") throw squashAtomCommandFailure(result);
    return result.value;
  };
}
export const mailWriteCommand = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "mail:write-permission",
  tag: "mail.gmail.sendMessage",
});
/** Concrete RPC tags, schemas and destination grants; no generic invoke method crosses the wire. */
export const mailOperations: Record<
  string,
  (environmentId: EnvironmentId, input: unknown) => Promise<unknown>
> = {
  "gmail:addOutlookAccount": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.addOutlookAccount",
      tag: "mail.gmail.addOutlookAccount",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:addOutlookAccount"].payloadSchema),
  ),
  "gmail:mailProviders": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.mailProviders",
      tag: "mail.gmail.mailProviders",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:mailProviders"].payloadSchema),
  ),
  "gmail:listAccounts": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.listAccounts",
      tag: "mail.gmail.listAccounts",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:listAccounts"].payloadSchema),
  ),
  "gmail:listSchedules": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.listSchedules",
      tag: "mail.gmail.listSchedules",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:listSchedules"].payloadSchema),
  ),
  "gmail:refreshSignatures": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.refreshSignatures",
      tag: "mail.gmail.refreshSignatures",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:refreshSignatures"].payloadSchema),
  ),
  "gmail:cancelAddAccount": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.cancelAddAccount",
      tag: "mail.gmail.cancelAddAccount",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:cancelAddAccount"].payloadSchema),
  ),
  "gmail:listViews": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.listViews",
      tag: "mail.gmail.listViews",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:listViews"].payloadSchema),
  ),
  "gmail:getSyncSettings": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.getSyncSettings",
      tag: "mail.gmail.getSyncSettings",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:getSyncSettings"].payloadSchema),
  ),
  "gmail:addAccount": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.addAccount",
      tag: "mail.gmail.addAccount",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:addAccount"].payloadSchema),
  ),
  "gmail:removeAccount": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.removeAccount",
      tag: "mail.gmail.removeAccount",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:removeAccount"].payloadSchema),
  ),
  "gmail:syncAccount": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.syncAccount",
      tag: "mail.gmail.syncAccount",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:syncAccount"].payloadSchema),
  ),
  "gmail:listLabels": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.listLabels",
      tag: "mail.gmail.listLabels",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:listLabels"].payloadSchema),
  ),
  "gmail:getSyncStatus": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.getSyncStatus",
      tag: "mail.gmail.getSyncStatus",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:getSyncStatus"].payloadSchema),
  ),
  "gmail:updateAccount": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.updateAccount",
      tag: "mail.gmail.updateAccount",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:updateAccount"].payloadSchema),
  ),
  "gmail:createLabel": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.createLabel",
      tag: "mail.gmail.createLabel",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:createLabel"].payloadSchema),
  ),
  "gmail:updateLabel": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.updateLabel",
      tag: "mail.gmail.updateLabel",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:updateLabel"].payloadSchema),
  ),
  "gmail:deleteLabel": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.deleteLabel",
      tag: "mail.gmail.deleteLabel",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:deleteLabel"].payloadSchema),
  ),
  "gmail:listMessages": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.listMessages",
      tag: "mail.gmail.listMessages",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:listMessages"].payloadSchema),
  ),
  "gmail:searchMessages": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.searchMessages",
      tag: "mail.gmail.searchMessages",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:searchMessages"].payloadSchema),
  ),
  "gmail:search": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.search",
      tag: "mail.gmail.search",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:search"].payloadSchema),
  ),
  "gmail:listCombinedMessages": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.listCombinedMessages",
      tag: "mail.gmail.listCombinedMessages",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:listCombinedMessages"].payloadSchema),
  ),
  "gmail:countCombinedMessages": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.countCombinedMessages",
      tag: "mail.gmail.countCombinedMessages",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:countCombinedMessages"].payloadSchema),
  ),
  "gmail:getMessage": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.getMessage",
      tag: "mail.gmail.getMessage",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:getMessage"].payloadSchema),
  ),
  "gmail:getDraftForMessage": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.getDraftForMessage",
      tag: "mail.gmail.getDraftForMessage",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:getDraftForMessage"].payloadSchema),
  ),
  "gmail:getThread": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.getThread",
      tag: "mail.gmail.getThread",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:getThread"].payloadSchema),
  ),
  "gmail:modifyMessage": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.modifyMessage",
      tag: "mail.gmail.modifyMessage",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:modifyMessage"].payloadSchema),
  ),
  "gmail:modifyThread": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.modifyThread",
      tag: "mail.gmail.modifyThread",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:modifyThread"].payloadSchema),
  ),
  "gmail:trashMessage": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.trashMessage",
      tag: "mail.gmail.trashMessage",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:trashMessage"].payloadSchema),
  ),
  "gmail:untrashMessage": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.untrashMessage",
      tag: "mail.gmail.untrashMessage",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:untrashMessage"].payloadSchema),
  ),
  "gmail:trashThread": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.trashThread",
      tag: "mail.gmail.trashThread",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:trashThread"].payloadSchema),
  ),
  "gmail:untrashThread": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.untrashThread",
      tag: "mail.gmail.untrashThread",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:untrashThread"].payloadSchema),
  ),
  "gmail:deleteThreadsForever": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.deleteThreadsForever",
      tag: "mail.gmail.deleteThreadsForever",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:deleteThreadsForever"].payloadSchema),
  ),
  "gmail:emptyFolder": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.emptyFolder",
      tag: "mail.gmail.emptyFolder",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:emptyFolder"].payloadSchema),
  ),
  "gmail:sendMessage": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.sendMessage",
      tag: "mail.gmail.sendMessage",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:sendMessage"].payloadSchema),
  ),
  "gmail:scheduleMessage": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.scheduleMessage",
      tag: "mail.gmail.scheduleMessage",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:scheduleMessage"].payloadSchema),
  ),
  "gmail:saveDraft": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.saveDraft",
      tag: "mail.gmail.saveDraft",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:saveDraft"].payloadSchema),
  ),
  "gmail:getDraftVersion": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.getDraftVersion",
      tag: "mail.gmail.getDraftVersion",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:getDraftVersion"].payloadSchema),
  ),
  "gmail:loadDraftVersion": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.loadDraftVersion",
      tag: "mail.gmail.loadDraftVersion",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:loadDraftVersion"].payloadSchema),
  ),
  "gmail:deleteDraft": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.deleteDraft",
      tag: "mail.gmail.deleteDraft",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:deleteDraft"].payloadSchema),
  ),
  "gmail:snoozeThread": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.snoozeThread",
      tag: "mail.gmail.snoozeThread",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:snoozeThread"].payloadSchema),
  ),
  "gmail:cancelSchedule": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.cancelSchedule",
      tag: "mail.gmail.cancelSchedule",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:cancelSchedule"].payloadSchema),
  ),
  "gmail:pickAttachments": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.pickAttachments",
      tag: "mail.gmail.pickAttachments",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:pickAttachments"].payloadSchema),
  ),
  "gmail:getAttachmentData": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.getAttachmentData",
      tag: "mail.gmail.getAttachmentData",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:getAttachmentData"].payloadSchema),
  ),
  "gmail:getAttachment": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.getAttachment",
      tag: "mail.gmail.getAttachment",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:getAttachment"].payloadSchema),
  ),
  "gmail:openAttachment": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.openAttachment",
      tag: "mail.gmail.openAttachment",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:openAttachment"].payloadSchema),
  ),
  "gmail:openComposeAttachment": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.openComposeAttachment",
      tag: "mail.gmail.openComposeAttachment",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:openComposeAttachment"].payloadSchema),
  ),
  "gmail:proxyImage": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.proxyImage",
      tag: "mail.gmail.proxyImage",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:proxyImage"].payloadSchema),
  ),
  "gmail:suggestContacts": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.suggestContacts",
      tag: "mail.gmail.suggestContacts",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:suggestContacts"].payloadSchema),
  ),
  "gmail:getSenderAvatar": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.getSenderAvatar",
      tag: "mail.gmail.getSenderAvatar",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:getSenderAvatar"].payloadSchema),
  ),
  "gmail:getUnsubscribe": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.getUnsubscribe",
      tag: "mail.gmail.getUnsubscribe",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:getUnsubscribe"].payloadSchema),
  ),
  "gmail:unsubscribe": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.unsubscribe",
      tag: "mail.gmail.unsubscribe",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:unsubscribe"].payloadSchema),
  ),
  "gmail:setSyncSettings": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.setSyncSettings",
      tag: "mail.gmail.setSyncSettings",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:setSyncSettings"].payloadSchema),
  ),
  "gmail:saveView": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.saveView",
      tag: "mail.gmail.saveView",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:saveView"].payloadSchema),
  ),
  "gmail:deleteView": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.deleteView",
      tag: "mail.gmail.deleteView",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:deleteView"].payloadSchema),
  ),
  "gmail:resetView": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.resetView",
      tag: "mail.gmail.resetView",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:resetView"].payloadSchema),
  ),
  "gmail:importViews": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.importViews",
      tag: "mail.gmail.importViews",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:importViews"].payloadSchema),
  ),
  "gmail:discoverImap": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.discoverImap",
      tag: "mail.gmail.discoverImap",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:discoverImap"].payloadSchema),
  ),
  "gmail:addImapAccount": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.addImapAccount",
      tag: "mail.gmail.addImapAccount",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:addImapAccount"].payloadSchema),
  ),
  "gmail:signInImap": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.gmail.signInImap",
      tag: "mail.gmail.signInImap",
    }),
    Schema.decodeUnknownSync(MailOperations["gmail:signInImap"].payloadSchema),
  ),
  "calendar:getInvite": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.calendar.getInvite",
      tag: "mail.calendar.getInvite",
    }),
    Schema.decodeUnknownSync(MailOperations["calendar:getInvite"].payloadSchema),
  ),
  "calendar:respond": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.calendar.respond",
      tag: "mail.calendar.respond",
    }),
    Schema.decodeUnknownSync(MailOperations["calendar:respond"].payloadSchema),
  ),
  "projects:list": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.projects.list",
      tag: "mail.projects.list",
    }),
    Schema.decodeUnknownSync(MailOperations["projects:list"].payloadSchema),
  ),
  "projects:unreadCounts": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.projects.unreadCounts",
      tag: "mail.projects.unreadCounts",
    }),
    Schema.decodeUnknownSync(MailOperations["projects:unreadCounts"].payloadSchema),
  ),
  "projects:create": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.projects.create",
      tag: "mail.projects.create",
    }),
    Schema.decodeUnknownSync(MailOperations["projects:create"].payloadSchema),
  ),
  "projects:update": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.projects.update",
      tag: "mail.projects.update",
    }),
    Schema.decodeUnknownSync(MailOperations["projects:update"].payloadSchema),
  ),
  "projects:delete": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.projects.delete",
      tag: "mail.projects.delete",
    }),
    Schema.decodeUnknownSync(MailOperations["projects:delete"].payloadSchema),
  ),
  "projects:addThreads": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.projects.addThreads",
      tag: "mail.projects.addThreads",
    }),
    Schema.decodeUnknownSync(MailOperations["projects:addThreads"].payloadSchema),
  ),
  "projects:removeThread": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.projects.removeThread",
      tag: "mail.projects.removeThread",
    }),
    Schema.decodeUnknownSync(MailOperations["projects:removeThread"].payloadSchema),
  ),
  "projects:addLink": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.projects.addLink",
      tag: "mail.projects.addLink",
    }),
    Schema.decodeUnknownSync(MailOperations["projects:addLink"].payloadSchema),
  ),
  "projects:removeLink": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.projects.removeLink",
      tag: "mail.projects.removeLink",
    }),
    Schema.decodeUnknownSync(MailOperations["projects:removeLink"].payloadSchema),
  ),
  "projects:threads": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.projects.threads",
      tag: "mail.projects.threads",
    }),
    Schema.decodeUnknownSync(MailOperations["projects:threads"].payloadSchema),
  ),
  "projects:documents": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.projects.documents",
      tag: "mail.projects.documents",
    }),
    Schema.decodeUnknownSync(MailOperations["projects:documents"].payloadSchema),
  ),
  "translation:getSettings": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.translation.getSettings",
      tag: "mail.translation.getSettings",
    }),
    Schema.decodeUnknownSync(MailOperations["translation:getSettings"].payloadSchema),
  ),
  "translation:setSettings": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.translation.setSettings",
      tag: "mail.translation.setSettings",
    }),
    Schema.decodeUnknownSync(MailOperations["translation:setSettings"].payloadSchema),
  ),
  "translation:detect": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.translation.detect",
      tag: "mail.translation.detect",
    }),
    Schema.decodeUnknownSync(MailOperations["translation:detect"].payloadSchema),
  ),
  "translation:translate": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.translation.translate",
      tag: "mail.translation.translate",
    }),
    Schema.decodeUnknownSync(MailOperations["translation:translate"].payloadSchema),
  ),
  "preferences:getUi": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.preferences.getUi",
      tag: "mail.preferences.getUi",
    }),
    Schema.decodeUnknownSync(MailOperations["preferences:getUi"].payloadSchema),
  ),
  "preferences:setUi": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.preferences.setUi",
      tag: "mail.preferences.setUi",
    }),
    Schema.decodeUnknownSync(MailOperations["preferences:setUi"].payloadSchema),
  ),
  "keybindings:read": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.keybindings.read",
      tag: "mail.keybindings.read",
    }),
    Schema.decodeUnknownSync(MailOperations["keybindings:read"].payloadSchema),
  ),
  "keybindings:write": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.keybindings.write",
      tag: "mail.keybindings.write",
    }),
    Schema.decodeUnknownSync(MailOperations["keybindings:write"].payloadSchema),
  ),
  "support:diagnostics": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.support.diagnostics",
      tag: "mail.support.diagnostics",
    }),
    Schema.decodeUnknownSync(MailOperations["support:diagnostics"].payloadSchema),
  ),
  "support:saveReport": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.support.saveReport",
      tag: "mail.support.saveReport",
    }),
    Schema.decodeUnknownSync(MailOperations["support:saveReport"].payloadSchema),
  ),
  "otter:getState": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.otter.getState",
      tag: "mail.otter.getState",
    }),
    Schema.decodeUnknownSync(MailOperations["otter:getState"].payloadSchema),
  ),
  "otter:listDevices": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.otter.listDevices",
      tag: "mail.otter.listDevices",
    }),
    Schema.decodeUnknownSync(MailOperations["otter:listDevices"].payloadSchema),
  ),
  "otter:signIn": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.otter.signIn",
      tag: "mail.otter.signIn",
    }),
    Schema.decodeUnknownSync(MailOperations["otter:signIn"].payloadSchema),
  ),
  "otter:cancelSignIn": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.otter.cancelSignIn",
      tag: "mail.otter.cancelSignIn",
    }),
    Schema.decodeUnknownSync(MailOperations["otter:cancelSignIn"].payloadSchema),
  ),
  "otter:signOut": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.otter.signOut",
      tag: "mail.otter.signOut",
    }),
    Schema.decodeUnknownSync(MailOperations["otter:signOut"].payloadSchema),
  ),
  "otter:deleteAccount": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.otter.deleteAccount",
      tag: "mail.otter.deleteAccount",
    }),
    Schema.decodeUnknownSync(MailOperations["otter:deleteAccount"].payloadSchema),
  ),
  "otter:signOutDevice": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.otter.signOutDevice",
      tag: "mail.otter.signOutDevice",
    }),
    Schema.decodeUnknownSync(MailOperations["otter:signOutDevice"].payloadSchema),
  ),
  "otter:listAgentTokens": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.otter.listAgentTokens",
      tag: "mail.otter.listAgentTokens",
    }),
    Schema.decodeUnknownSync(MailOperations["otter:listAgentTokens"].payloadSchema),
  ),
  "otter:createAgentToken": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.otter.createAgentToken",
      tag: "mail.otter.createAgentToken",
    }),
    Schema.decodeUnknownSync(MailOperations["otter:createAgentToken"].payloadSchema),
  ),
  "otter:deleteAgentToken": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.otter.deleteAgentToken",
      tag: "mail.otter.deleteAgentToken",
    }),
    Schema.decodeUnknownSync(MailOperations["otter:deleteAgentToken"].payloadSchema),
  ),
  "todoist:status": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.todoist.status",
      tag: "mail.todoist.status",
    }),
    Schema.decodeUnknownSync(MailOperations["todoist:status"].payloadSchema),
  ),
  "todoist:signIn": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.todoist.signIn",
      tag: "mail.todoist.signIn",
    }),
    Schema.decodeUnknownSync(MailOperations["todoist:signIn"].payloadSchema),
  ),
  "todoist:disconnect": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.todoist.disconnect",
      tag: "mail.todoist.disconnect",
    }),
    Schema.decodeUnknownSync(MailOperations["todoist:disconnect"].payloadSchema),
  ),
  "todoist:connect": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.todoist.connect",
      tag: "mail.todoist.connect",
    }),
    Schema.decodeUnknownSync(MailOperations["todoist:connect"].payloadSchema),
  ),
  "todoist:projects": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.todoist.projects",
      tag: "mail.todoist.projects",
    }),
    Schema.decodeUnknownSync(MailOperations["todoist:projects"].payloadSchema),
  ),
  "todoist:labels": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.todoist.labels",
      tag: "mail.todoist.labels",
    }),
    Schema.decodeUnknownSync(MailOperations["todoist:labels"].payloadSchema),
  ),
  "todoist:tasks": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.todoist.tasks",
      tag: "mail.todoist.tasks",
    }),
    Schema.decodeUnknownSync(MailOperations["todoist:tasks"].payloadSchema),
  ),
  "todoist:sections": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.todoist.sections",
      tag: "mail.todoist.sections",
    }),
    Schema.decodeUnknownSync(MailOperations["todoist:sections"].payloadSchema),
  ),
  "todoist:collaborators": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.todoist.collaborators",
      tag: "mail.todoist.collaborators",
    }),
    Schema.decodeUnknownSync(MailOperations["todoist:collaborators"].payloadSchema),
  ),
  "todoist:reminders": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.todoist.reminders",
      tag: "mail.todoist.reminders",
    }),
    Schema.decodeUnknownSync(MailOperations["todoist:reminders"].payloadSchema),
  ),
  "todoist:create": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.todoist.create",
      tag: "mail.todoist.create",
    }),
    Schema.decodeUnknownSync(MailOperations["todoist:create"].payloadSchema),
  ),
  "todoist:update": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.todoist.update",
      tag: "mail.todoist.update",
    }),
    Schema.decodeUnknownSync(MailOperations["todoist:update"].payloadSchema),
  ),
  "todoist:addReminder": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.todoist.addReminder",
      tag: "mail.todoist.addReminder",
    }),
    Schema.decodeUnknownSync(MailOperations["todoist:addReminder"].payloadSchema),
  ),
  "todoist:deleteReminder": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.todoist.deleteReminder",
      tag: "mail.todoist.deleteReminder",
    }),
    Schema.decodeUnknownSync(MailOperations["todoist:deleteReminder"].payloadSchema),
  ),
  "todoist:complete": operation(
    createEnvironmentRpcCommand(connectionAtomRuntime, {
      label: "mail.todoist.complete",
      tag: "mail.todoist.complete",
    }),
    Schema.decodeUnknownSync(MailOperations["todoist:complete"].payloadSchema),
  ),
};
