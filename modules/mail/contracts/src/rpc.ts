/** Named Mail RPCs. Legacy channels are private engine dispatch keys, never a wire tunnel. */
import * as Schema from "effect/Schema";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";
import { AuthOrchestrationReadScope, AuthOrchestrationOperateScope } from "@t3tools/contracts";
import { defineModuleContract, moduleRpcErrors } from "@otterware/module-kit/contracts";

export class MailError extends Schema.TaggedError<MailError>()("MailError", {
  operation: Schema.String,
  message: Schema.String,
}) {}
const S = Schema.String,
  N = Schema.Number,
  B = Schema.Boolean;
const Strings = Schema.Array(S);
const NullableString = Schema.NullOr(S);
const LabelColor = Schema.Struct({ backgroundColor: S, textColor: S });
const Rules = Schema.Array(Schema.Struct({ accountId: S, allOf: Strings, noneOf: Strings }));
const Views = Schema.Array(
  Schema.Struct({
    id: S,
    name: S,
    kind: Schema.Literals([
      "inbox",
      "starred",
      "sent",
      "drafts",
      "important",
      "allmail",
      "junk",
      "trash",
      "custom",
    ]),
    rules: Schema.NullOr(Rules),
  }),
);
const Attachments = Schema.Array(Schema.Struct({ name: S, mimeType: S, size: N, base64: S }));
const Folder = Schema.Literals(["SPAM", "TRASH"]);
const Notifications = Schema.Literals(["off", "inbox", "all"]);
const Rsvp = Schema.Literals(["accepted", "declined", "tentative"]);
const ProjectStatus = Schema.Literals(["active", "settled"]);
const ProjectThreads = Schema.Array(
  Schema.Struct({ accountId: S, threadId: S, subject: Schema.optional(S) }),
);
const EmailReference = Schema.Struct({ accountId: S, messageId: S });
const Server = Schema.Struct({ host: S, port: N, security: Schema.Literals(["tls", "starttls"]) });
const Imap = Schema.Struct({ username: S, imap: Server, smtp: Server });
const Cursors = Schema.Record(S, NullableString);
const Keybindings = Schema.Array(Schema.Struct({ key: S, command: S, when: Schema.optional(S) }));

export const MailOperations = {
  "gmail:listAccounts": Rpc.make("mail.gmail.listAccounts", {
    payload: Schema.Struct({ taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:listSchedules": Rpc.make("mail.gmail.listSchedules", {
    payload: Schema.Struct({ taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:refreshSignatures": Rpc.make("mail.gmail.refreshSignatures", {
    payload: Schema.Struct({ taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:cancelAddAccount": Rpc.make("mail.gmail.cancelAddAccount", {
    payload: Schema.Struct({ taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:listViews": Rpc.make("mail.gmail.listViews", {
    payload: Schema.Struct({ taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:getSyncSettings": Rpc.make("mail.gmail.getSyncSettings", {
    payload: Schema.Struct({ taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:addAccount": Rpc.make("mail.gmail.addAccount", {
    payload: Schema.Struct({ email: Schema.optional(S), taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:removeAccount": Rpc.make("mail.gmail.removeAccount", {
    payload: Schema.Struct({ accountId: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:syncAccount": Rpc.make("mail.gmail.syncAccount", {
    payload: Schema.Struct({ accountId: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:listLabels": Rpc.make("mail.gmail.listLabels", {
    payload: Schema.Struct({ accountId: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:getSyncStatus": Rpc.make("mail.gmail.getSyncStatus", {
    payload: Schema.Struct({ accountId: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:updateAccount": Rpc.make("mail.gmail.updateAccount", {
    payload: Schema.Struct({
      accountId: S,
      displayName: Schema.optional(S),
      color: Schema.optional(S),
      signature: Schema.optional(S),
      taskId: Schema.optional(S),
    }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:createLabel": Rpc.make("mail.gmail.createLabel", {
    payload: Schema.Struct({ accountId: S, name: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:updateLabel": Rpc.make("mail.gmail.updateLabel", {
    payload: Schema.Struct({
      accountId: S,
      labelId: S,
      name: Schema.optional(S),
      color: Schema.optional(LabelColor),
      taskId: Schema.optional(S),
    }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:deleteLabel": Rpc.make("mail.gmail.deleteLabel", {
    payload: Schema.Struct({ accountId: S, labelId: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:listMessages": Rpc.make("mail.gmail.listMessages", {
    payload: Schema.Struct({
      accountId: S,
      labelIds: Schema.optional(Strings),
      pageToken: Schema.optional(S),
      maxResults: Schema.optional(N),
      taskId: Schema.optional(S),
    }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:searchMessages": Rpc.make("mail.gmail.searchMessages", {
    payload: Schema.Struct({
      q: S,
      accountId: Schema.optional(S),
      labelId: Schema.optional(S),
      rules: Schema.optional(Rules),
      starred: Schema.optional(B),
      important: Schema.optional(B),
      hasAttachments: Schema.optional(B),
      withinDays: Schema.optional(N),
      pageToken: Schema.optional(S),
      maxResults: Schema.optional(N),
      taskId: Schema.optional(S),
    }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:search": Rpc.make("mail.gmail.search", {
    payload: Schema.Struct({
      q: S,
      accountIds: Strings,
      cursors: Schema.optional(Cursors),
      taskId: Schema.optional(S),
    }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:listCombinedMessages": Rpc.make("mail.gmail.listCombinedMessages", {
    payload: Schema.Struct({
      rules: Rules,
      pageToken: Schema.optional(S),
      maxResults: Schema.optional(N),
      taskId: Schema.optional(S),
    }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:countCombinedMessages": Rpc.make("mail.gmail.countCombinedMessages", {
    payload: Schema.Struct({ rules: Rules, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:getMessage": Rpc.make("mail.gmail.getMessage", {
    payload: Schema.Struct({
      accountId: S,
      messageId: S,
      threadId: Schema.optional(S),
      taskId: Schema.optional(S),
    }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:getDraftForMessage": Rpc.make("mail.gmail.getDraftForMessage", {
    payload: Schema.Struct({
      accountId: S,
      messageId: S,
      threadId: Schema.optional(S),
      taskId: Schema.optional(S),
    }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:getThread": Rpc.make("mail.gmail.getThread", {
    payload: Schema.Struct({ accountId: S, threadId: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:modifyMessage": Rpc.make("mail.gmail.modifyMessage", {
    payload: Schema.Struct({
      accountId: S,
      messageId: S,
      addLabelIds: Schema.optional(Strings),
      removeLabelIds: Schema.optional(Strings),
      taskId: Schema.optional(S),
    }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:modifyThread": Rpc.make("mail.gmail.modifyThread", {
    payload: Schema.Struct({
      accountId: S,
      threadId: S,
      addLabelIds: Schema.optional(Strings),
      removeLabelIds: Schema.optional(Strings),
      taskId: Schema.optional(S),
    }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:trashMessage": Rpc.make("mail.gmail.trashMessage", {
    payload: Schema.Struct({ accountId: S, messageId: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:untrashMessage": Rpc.make("mail.gmail.untrashMessage", {
    payload: Schema.Struct({ accountId: S, messageId: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:trashThread": Rpc.make("mail.gmail.trashThread", {
    payload: Schema.Struct({ accountId: S, threadId: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:untrashThread": Rpc.make("mail.gmail.untrashThread", {
    payload: Schema.Struct({ accountId: S, threadId: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:deleteThreadsForever": Rpc.make("mail.gmail.deleteThreadsForever", {
    payload: Schema.Struct({ accountId: S, threadIds: Strings, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:emptyFolder": Rpc.make("mail.gmail.emptyFolder", {
    payload: Schema.Struct({ accountId: S, labelId: Folder, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:sendMessage": Rpc.make("mail.gmail.sendMessage", {
    payload: Schema.Struct({
      accountId: S,
      to: S,
      cc: Schema.optional(S),
      bcc: Schema.optional(S),
      subject: S,
      body: S,
      bodyHtml: Schema.optional(S),
      threadId: Schema.optional(S),
      attachments: Schema.optional(Attachments),
      replyToMessageId: Schema.optional(S),
      scheduledAt: Schema.optional(N),
      taskId: Schema.optional(S),
    }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:scheduleMessage": Rpc.make("mail.gmail.scheduleMessage", {
    payload: Schema.Struct({
      accountId: S,
      to: S,
      cc: Schema.optional(S),
      bcc: Schema.optional(S),
      subject: S,
      body: S,
      bodyHtml: Schema.optional(S),
      threadId: Schema.optional(S),
      attachments: Schema.optional(Attachments),
      replyToMessageId: Schema.optional(S),
      scheduledAt: Schema.optional(N),
      taskId: Schema.optional(S),
    }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:saveDraft": Rpc.make("mail.gmail.saveDraft", {
    payload: Schema.Struct({
      accountId: S,
      to: S,
      cc: Schema.optional(S),
      bcc: Schema.optional(S),
      subject: S,
      body: S,
      bodyHtml: Schema.optional(S),
      threadId: Schema.optional(S),
      attachments: Schema.optional(Attachments),
      draftId: Schema.optional(S),
      sessionKey: Schema.optional(S),
      expectMessageId: Schema.optional(S),
      taskId: Schema.optional(S),
    }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:getDraftVersion": Rpc.make("mail.gmail.getDraftVersion", {
    payload: Schema.Struct({ accountId: S, draftId: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:loadDraftVersion": Rpc.make("mail.gmail.loadDraftVersion", {
    payload: Schema.Struct({ accountId: S, draftId: S, messageId: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:deleteDraft": Rpc.make("mail.gmail.deleteDraft", {
    payload: Schema.Struct({
      accountId: S,
      draftId: Schema.optional(S),
      sessionKey: Schema.optional(S),
      taskId: Schema.optional(S),
    }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:snoozeThread": Rpc.make("mail.gmail.snoozeThread", {
    payload: Schema.Struct({ accountId: S, threadId: S, dueAt: N, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:cancelSchedule": Rpc.make("mail.gmail.cancelSchedule", {
    payload: Schema.Struct({ id: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:pickAttachments": Rpc.make("mail.gmail.pickAttachments", {
    payload: Schema.Struct({ existingBytes: Schema.optional(N), taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:getAttachmentData": Rpc.make("mail.gmail.getAttachmentData", {
    payload: Schema.Struct({
      accountId: S,
      messageId: S,
      attachmentId: S,
      taskId: Schema.optional(S),
    }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:getAttachment": Rpc.make("mail.gmail.getAttachment", {
    payload: Schema.Struct({
      accountId: S,
      messageId: S,
      attachmentId: S,
      filename: S,
      mimeType: Schema.optional(S),
      taskId: Schema.optional(S),
    }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:openAttachment": Rpc.make("mail.gmail.openAttachment", {
    payload: Schema.Struct({
      accountId: S,
      messageId: S,
      attachmentId: S,
      filename: S,
      mimeType: Schema.optional(S),
      taskId: Schema.optional(S),
    }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:openComposeAttachment": Rpc.make("mail.gmail.openComposeAttachment", {
    payload: Schema.Struct({ name: S, base64: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:proxyImage": Rpc.make("mail.gmail.proxyImage", {
    payload: Schema.Struct({ url: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:suggestContacts": Rpc.make("mail.gmail.suggestContacts", {
    payload: Schema.Struct({ q: S, limit: Schema.optional(N), taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:getSenderAvatar": Rpc.make("mail.gmail.getSenderAvatar", {
    payload: Schema.Struct({ accountId: S, email: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:getUnsubscribe": Rpc.make("mail.gmail.getUnsubscribe", {
    payload: Schema.Struct({
      accountId: S,
      messageId: S,
      fromEmail: S,
      taskId: Schema.optional(S),
    }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:unsubscribe": Rpc.make("mail.gmail.unsubscribe", {
    payload: Schema.Struct({ accountId: S, messageId: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:setSyncSettings": Rpc.make("mail.gmail.setSyncSettings", {
    payload: Schema.Struct({
      syncIntervalSeconds: Schema.optional(N),
      notificationsMode: Schema.optional(Notifications),
      launchAtLogin: Schema.optional(B),
      dockBadgeEnabled: Schema.optional(B),
      taskId: Schema.optional(S),
    }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:saveView": Rpc.make("mail.gmail.saveView", {
    payload: Schema.Struct({
      id: Schema.optional(S),
      name: S,
      rules: Rules,
      mailbox: Schema.optional(S),
      icon: Schema.optional(NullableString),
      color: Schema.optional(NullableString),
      taskId: Schema.optional(S),
    }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:deleteView": Rpc.make("mail.gmail.deleteView", {
    payload: Schema.Struct({ viewId: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:resetView": Rpc.make("mail.gmail.resetView", {
    payload: Schema.Struct({ viewId: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:importViews": Rpc.make("mail.gmail.importViews", {
    payload: Schema.Struct({ views: Views, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:discoverImap": Rpc.make("mail.gmail.discoverImap", {
    payload: Schema.Struct({ email: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:addImapAccount": Rpc.make("mail.gmail.addImapAccount", {
    payload: Schema.Struct({
      email: S,
      name: Schema.optional(S),
      password: S,
      imap: Imap,
      taskId: Schema.optional(S),
    }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "gmail:signInImap": Rpc.make("mail.gmail.signInImap", {
    payload: Schema.Struct({ accountId: S, password: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "calendar:getInvite": Rpc.make("mail.calendar.getInvite", {
    payload: Schema.Struct({ accountId: S, messageId: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "calendar:respond": Rpc.make("mail.calendar.respond", {
    payload: Schema.Struct({
      accountId: S,
      messageId: S,
      response: Rsvp,
      taskId: Schema.optional(S),
    }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "projects:list": Rpc.make("mail.projects.list", {
    payload: Schema.Struct({ taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "projects:unreadCounts": Rpc.make("mail.projects.unreadCounts", {
    payload: Schema.Struct({ taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "projects:create": Rpc.make("mail.projects.create", {
    payload: Schema.Struct({
      name: S,
      notes: Schema.optional(S),
      threads: Schema.optional(ProjectThreads),
      taskId: Schema.optional(S),
    }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "projects:update": Rpc.make("mail.projects.update", {
    payload: Schema.Struct({
      id: S,
      name: Schema.optional(S),
      notes: Schema.optional(S),
      status: Schema.optional(ProjectStatus),
      taskId: Schema.optional(S),
    }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "projects:delete": Rpc.make("mail.projects.delete", {
    payload: Schema.Struct({ id: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "projects:addThreads": Rpc.make("mail.projects.addThreads", {
    payload: Schema.Struct({ id: S, threads: ProjectThreads, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "projects:removeThread": Rpc.make("mail.projects.removeThread", {
    payload: Schema.Struct({ id: S, email: S, threadId: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "projects:addLink": Rpc.make("mail.projects.addLink", {
    payload: Schema.Struct({
      id: S,
      url: S,
      title: Schema.optional(S),
      taskId: Schema.optional(S),
    }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "projects:removeLink": Rpc.make("mail.projects.removeLink", {
    payload: Schema.Struct({ id: S, linkId: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "projects:threads": Rpc.make("mail.projects.threads", {
    payload: Schema.Struct({ id: Schema.optional(S), taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "projects:documents": Rpc.make("mail.projects.documents", {
    payload: Schema.Struct({ id: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "translation:getSettings": Rpc.make("mail.translation.getSettings", {
    payload: Schema.Struct({ taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "translation:setSettings": Rpc.make("mail.translation.setSettings", {
    payload: Schema.Struct({
      readLanguages: Schema.optional(Strings),
      autoTranslate: Schema.optional(B),
      taskId: Schema.optional(S),
    }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "translation:detect": Rpc.make("mail.translation.detect", {
    payload: Schema.Struct({ text: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "translation:translate": Rpc.make("mail.translation.translate", {
    payload: Schema.Struct({ segments: Strings, source: S, target: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "preferences:getUi": Rpc.make("mail.preferences.getUi", {
    payload: Schema.Struct({ initialize: Schema.optional(B), taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "preferences:setUi": Rpc.make("mail.preferences.setUi", {
    payload: Schema.Struct({ key: S, value: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "keybindings:read": Rpc.make("mail.keybindings.read", {
    payload: Schema.Struct({ taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "keybindings:write": Rpc.make("mail.keybindings.write", {
    payload: Schema.Struct({ rules: Keybindings, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "support:diagnostics": Rpc.make("mail.support.diagnostics", {
    payload: Schema.Struct({ taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "support:saveReport": Rpc.make("mail.support.saveReport", {
    payload: Schema.Struct({
      contents: S,
      filename: Schema.optional(S),
      taskId: Schema.optional(S),
    }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "otter:getState": Rpc.make("mail.otter.getState", {
    payload: Schema.Struct({ taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "otter:listDevices": Rpc.make("mail.otter.listDevices", {
    payload: Schema.Struct({ taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "otter:signIn": Rpc.make("mail.otter.signIn", {
    payload: Schema.Struct({ callbackURL: Schema.optional(S), taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "otter:cancelSignIn": Rpc.make("mail.otter.cancelSignIn", {
    payload: Schema.Struct({ taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "otter:signOut": Rpc.make("mail.otter.signOut", {
    payload: Schema.Struct({ taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "otter:deleteAccount": Rpc.make("mail.otter.deleteAccount", {
    payload: Schema.Struct({ taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "otter:signOutDevice": Rpc.make("mail.otter.signOutDevice", {
    payload: Schema.Struct({ token: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "otter:listAgentTokens": Rpc.make("mail.otter.listAgentTokens", {
    payload: Schema.Struct({ taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "otter:createAgentToken": Rpc.make("mail.otter.createAgentToken", {
    payload: Schema.Struct({ name: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "otter:deleteAgentToken": Rpc.make("mail.otter.deleteAgentToken", {
    payload: Schema.Struct({ id: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "todoist:status": Rpc.make("mail.todoist.status", {
    payload: Schema.Struct({ taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "todoist:signIn": Rpc.make("mail.todoist.signIn", {
    payload: Schema.Struct({ taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "todoist:disconnect": Rpc.make("mail.todoist.disconnect", {
    payload: Schema.Struct({ taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "todoist:connect": Rpc.make("mail.todoist.connect", {
    payload: Schema.Struct({ token: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "todoist:projects": Rpc.make("mail.todoist.projects", {
    payload: Schema.Struct({ taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "todoist:labels": Rpc.make("mail.todoist.labels", {
    payload: Schema.Struct({ taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "todoist:tasks": Rpc.make("mail.todoist.tasks", {
    payload: Schema.Struct({
      projectId: Schema.optional(S),
      cursor: Schema.optional(S),
      filter: Schema.optional(S),
      taskId: Schema.optional(S),
    }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "todoist:sections": Rpc.make("mail.todoist.sections", {
    payload: Schema.Struct({ projectId: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "todoist:collaborators": Rpc.make("mail.todoist.collaborators", {
    payload: Schema.Struct({ projectId: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "todoist:reminders": Rpc.make("mail.todoist.reminders", {
    payload: Schema.Struct({ id: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "todoist:create": Rpc.make("mail.todoist.create", {
    payload: Schema.Struct({
      content: S,
      description: Schema.optional(S),
      projectId: Schema.optional(S),
      sectionId: Schema.optional(S),
      assigneeId: Schema.optional(NullableString),
      labels: Schema.optional(Strings),
      due: Schema.optional(S),
      priority: Schema.optional(N),
      requestId: S,
      email: Schema.optional(EmailReference),
      taskId: Schema.optional(S),
    }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "todoist:update": Rpc.make("mail.todoist.update", {
    payload: Schema.Struct({
      id: S,
      content: Schema.optional(S),
      description: Schema.optional(S),
      projectId: Schema.optional(S),
      sectionId: Schema.optional(NullableString),
      assigneeId: Schema.optional(NullableString),
      labels: Schema.optional(Strings),
      due: Schema.optional(S),
      priority: Schema.optional(N),
      requestId: S,
      moveRequestId: S,
      taskId: Schema.optional(S),
    }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "todoist:addReminder": Rpc.make("mail.todoist.addReminder", {
    payload: Schema.Struct({ itemId: S, due: S, requestId: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "todoist:deleteReminder": Rpc.make("mail.todoist.deleteReminder", {
    payload: Schema.Struct({ id: S, requestId: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
  "todoist:complete": Rpc.make("mail.todoist.complete", {
    payload: Schema.Struct({ id: S, requestId: S, taskId: Schema.optional(S) }),
    success: Schema.Unknown,
    error: moduleRpcErrors(MailError),
  }),
} as const;

export const MailEvent = Schema.Union([
  Schema.Struct({
    channel: Schema.Literal("gmail:accounts-changed"),
    params: Schema.optional(Schema.Unknown),
  }),
  Schema.Struct({
    channel: Schema.Literal("gmail:views-changed"),
    params: Schema.optional(Schema.Unknown),
  }),
  Schema.Struct({
    channel: Schema.Literal("gmail:mail-changed"),
    params: Schema.optional(Schema.Unknown),
  }),
  Schema.Struct({
    channel: Schema.Literal("gmail:sync-started"),
    params: Schema.optional(Schema.Unknown),
  }),
  Schema.Struct({
    channel: Schema.Literal("gmail:sync-finished"),
    params: Schema.optional(Schema.Unknown),
  }),
  Schema.Struct({
    channel: Schema.Literal("gmail:sync-status"),
    params: Schema.optional(Schema.Unknown),
  }),
  Schema.Struct({
    channel: Schema.Literal("gmail:schedule-changed"),
    params: Schema.optional(Schema.Unknown),
  }),
  Schema.Struct({
    channel: Schema.Literal("gmail:schedule-failed"),
    params: Schema.optional(Schema.Unknown),
  }),
  Schema.Struct({
    channel: Schema.Literal("projects:changed"),
    params: Schema.optional(Schema.Unknown),
  }),
  Schema.Struct({
    channel: Schema.Literal("keybindings:updated"),
    params: Schema.optional(Schema.Unknown),
  }),
  Schema.Struct({
    channel: Schema.Literal("todoist:changed"),
    params: Schema.optional(Schema.Unknown),
  }),
  Schema.Struct({
    channel: Schema.Literal("todoist:tasksChanged"),
    params: Schema.optional(Schema.Unknown),
  }),
  Schema.Struct({
    channel: Schema.Literal("translation:settingsChanged"),
    params: Schema.optional(Schema.Unknown),
  }),
  Schema.Struct({
    channel: Schema.Literal("settings:changed"),
    params: Schema.optional(Schema.Unknown),
  }),
  Schema.Struct({
    channel: Schema.Literal("preferences:uiChanged"),
    params: Schema.optional(Schema.Record(S, S)),
  }),
  Schema.Struct({
    channel: Schema.Literal("otter:state"),
    params: Schema.optional(Schema.Unknown),
  }),
  Schema.Struct({
    channel: Schema.Literal("gmail:send-failed"),
    params: Schema.optional(Schema.Struct({ subject: S, savedToDrafts: B })),
  }),
  Schema.Struct({
    channel: Schema.Literal("gmail:write-failed"),
    params: Schema.optional(Schema.Unknown),
  }),
  Schema.Struct({
    channel: Schema.Literal("task:done"),
    params: Schema.optional(
      Schema.Struct({
        taskId: S,
        result: Schema.optional(Schema.Unknown),
        error: Schema.optional(S),
      }),
    ),
  }),
]);
export type MailEvent = typeof MailEvent.Type;
export const MailEventsRpc = Rpc.make("mail.events", {
  payload: Schema.Struct({}),
  success: MailEvent,
  error: moduleRpcErrors(MailError),
  stream: true,
});
export const MailRpcGroup = RpcGroup.make(...Object.values(MailOperations), MailEventsRpc);
export const MailContract = defineModuleContract({
  id: "mail",
  group: MailRpcGroup,
  scopes: {
    "mail.gmail.listAccounts": AuthOrchestrationReadScope,
    "mail.gmail.listSchedules": AuthOrchestrationReadScope,
    "mail.gmail.refreshSignatures": AuthOrchestrationReadScope,
    "mail.gmail.cancelAddAccount": AuthOrchestrationReadScope,
    "mail.gmail.listViews": AuthOrchestrationReadScope,
    "mail.gmail.getSyncSettings": AuthOrchestrationReadScope,
    "mail.gmail.addAccount": AuthOrchestrationOperateScope,
    "mail.gmail.removeAccount": AuthOrchestrationOperateScope,
    "mail.gmail.syncAccount": AuthOrchestrationOperateScope,
    "mail.gmail.listLabels": AuthOrchestrationReadScope,
    "mail.gmail.getSyncStatus": AuthOrchestrationReadScope,
    "mail.gmail.updateAccount": AuthOrchestrationOperateScope,
    "mail.gmail.createLabel": AuthOrchestrationOperateScope,
    "mail.gmail.updateLabel": AuthOrchestrationOperateScope,
    "mail.gmail.deleteLabel": AuthOrchestrationOperateScope,
    "mail.gmail.listMessages": AuthOrchestrationReadScope,
    "mail.gmail.searchMessages": AuthOrchestrationReadScope,
    "mail.gmail.search": AuthOrchestrationReadScope,
    "mail.gmail.listCombinedMessages": AuthOrchestrationReadScope,
    "mail.gmail.countCombinedMessages": AuthOrchestrationReadScope,
    "mail.gmail.getMessage": AuthOrchestrationReadScope,
    "mail.gmail.getDraftForMessage": AuthOrchestrationReadScope,
    "mail.gmail.getThread": AuthOrchestrationReadScope,
    "mail.gmail.modifyMessage": AuthOrchestrationOperateScope,
    "mail.gmail.modifyThread": AuthOrchestrationOperateScope,
    "mail.gmail.trashMessage": AuthOrchestrationOperateScope,
    "mail.gmail.untrashMessage": AuthOrchestrationOperateScope,
    "mail.gmail.trashThread": AuthOrchestrationOperateScope,
    "mail.gmail.untrashThread": AuthOrchestrationOperateScope,
    "mail.gmail.deleteThreadsForever": AuthOrchestrationOperateScope,
    "mail.gmail.emptyFolder": AuthOrchestrationOperateScope,
    "mail.gmail.sendMessage": AuthOrchestrationOperateScope,
    "mail.gmail.scheduleMessage": AuthOrchestrationOperateScope,
    "mail.gmail.saveDraft": AuthOrchestrationOperateScope,
    "mail.gmail.getDraftVersion": AuthOrchestrationReadScope,
    "mail.gmail.loadDraftVersion": AuthOrchestrationReadScope,
    "mail.gmail.deleteDraft": AuthOrchestrationOperateScope,
    "mail.gmail.snoozeThread": AuthOrchestrationOperateScope,
    "mail.gmail.cancelSchedule": AuthOrchestrationOperateScope,
    "mail.gmail.pickAttachments": AuthOrchestrationOperateScope,
    "mail.gmail.getAttachmentData": AuthOrchestrationReadScope,
    "mail.gmail.getAttachment": AuthOrchestrationReadScope,
    "mail.gmail.openAttachment": AuthOrchestrationReadScope,
    "mail.gmail.openComposeAttachment": AuthOrchestrationReadScope,
    "mail.gmail.proxyImage": AuthOrchestrationReadScope,
    "mail.gmail.suggestContacts": AuthOrchestrationReadScope,
    "mail.gmail.getSenderAvatar": AuthOrchestrationReadScope,
    "mail.gmail.getUnsubscribe": AuthOrchestrationReadScope,
    "mail.gmail.unsubscribe": AuthOrchestrationOperateScope,
    "mail.gmail.setSyncSettings": AuthOrchestrationOperateScope,
    "mail.gmail.saveView": AuthOrchestrationOperateScope,
    "mail.gmail.deleteView": AuthOrchestrationOperateScope,
    "mail.gmail.resetView": AuthOrchestrationOperateScope,
    "mail.gmail.importViews": AuthOrchestrationOperateScope,
    "mail.gmail.discoverImap": AuthOrchestrationReadScope,
    "mail.gmail.addImapAccount": AuthOrchestrationOperateScope,
    "mail.gmail.signInImap": AuthOrchestrationOperateScope,
    "mail.calendar.getInvite": AuthOrchestrationReadScope,
    "mail.calendar.respond": AuthOrchestrationOperateScope,
    "mail.projects.list": AuthOrchestrationReadScope,
    "mail.projects.unreadCounts": AuthOrchestrationReadScope,
    "mail.projects.create": AuthOrchestrationOperateScope,
    "mail.projects.update": AuthOrchestrationOperateScope,
    "mail.projects.delete": AuthOrchestrationOperateScope,
    "mail.projects.addThreads": AuthOrchestrationOperateScope,
    "mail.projects.removeThread": AuthOrchestrationOperateScope,
    "mail.projects.addLink": AuthOrchestrationOperateScope,
    "mail.projects.removeLink": AuthOrchestrationOperateScope,
    "mail.projects.threads": AuthOrchestrationReadScope,
    "mail.projects.documents": AuthOrchestrationReadScope,
    "mail.translation.getSettings": AuthOrchestrationReadScope,
    "mail.translation.setSettings": AuthOrchestrationOperateScope,
    "mail.translation.detect": AuthOrchestrationReadScope,
    "mail.translation.translate": AuthOrchestrationReadScope,
    "mail.preferences.getUi": AuthOrchestrationReadScope,
    "mail.preferences.setUi": AuthOrchestrationOperateScope,
    "mail.keybindings.read": AuthOrchestrationReadScope,
    "mail.keybindings.write": AuthOrchestrationOperateScope,
    "mail.support.diagnostics": AuthOrchestrationReadScope,
    "mail.support.saveReport": AuthOrchestrationReadScope,
    "mail.otter.getState": AuthOrchestrationReadScope,
    "mail.otter.listDevices": AuthOrchestrationReadScope,
    "mail.otter.signIn": AuthOrchestrationOperateScope,
    "mail.otter.cancelSignIn": AuthOrchestrationOperateScope,
    "mail.otter.signOut": AuthOrchestrationOperateScope,
    "mail.otter.deleteAccount": AuthOrchestrationOperateScope,
    "mail.otter.signOutDevice": AuthOrchestrationOperateScope,
    "mail.otter.listAgentTokens": AuthOrchestrationOperateScope,
    "mail.otter.createAgentToken": AuthOrchestrationOperateScope,
    "mail.otter.deleteAgentToken": AuthOrchestrationOperateScope,
    "mail.todoist.status": AuthOrchestrationReadScope,
    "mail.todoist.signIn": AuthOrchestrationOperateScope,
    "mail.todoist.disconnect": AuthOrchestrationOperateScope,
    "mail.todoist.connect": AuthOrchestrationOperateScope,
    "mail.todoist.projects": AuthOrchestrationReadScope,
    "mail.todoist.labels": AuthOrchestrationReadScope,
    "mail.todoist.tasks": AuthOrchestrationReadScope,
    "mail.todoist.sections": AuthOrchestrationReadScope,
    "mail.todoist.collaborators": AuthOrchestrationReadScope,
    "mail.todoist.reminders": AuthOrchestrationReadScope,
    "mail.todoist.create": AuthOrchestrationOperateScope,
    "mail.todoist.update": AuthOrchestrationOperateScope,
    "mail.todoist.addReminder": AuthOrchestrationOperateScope,
    "mail.todoist.deleteReminder": AuthOrchestrationOperateScope,
    "mail.todoist.complete": AuthOrchestrationOperateScope,
    "mail.events": AuthOrchestrationReadScope,
  },
});
