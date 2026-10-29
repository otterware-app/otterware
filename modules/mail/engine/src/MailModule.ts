import mailScheduleMigration from "./mailScheduleMigration.ts";
import { mailHomeContributor } from "./MailHome.ts";
import { MailSettings } from "@otterware/mail-contracts/settings";
import { MailContract } from "@otterware/mail-contracts/rpc";
import { defineServerModule } from "@otterware/module-kit/engine";
import * as Layer from "effect/Layer";
import { MailError } from "@otterware/mail-contracts/rpc";
import * as Effect from "effect/Effect";

import { MailRuntime } from "./MailRuntime.ts";
import { MailToolkit, toolHandlers } from "./MailToolkit.ts";
export { MailRuntime } from "./MailRuntime.ts";

/**
 * An engine answer as the JSON the wire carries. RPC encodes `Unknown` successes as strict
 * JSON, so an `undefined` field (a label without a color) or an answer of `undefined` would
 * fail the whole reply; this drops such fields and answers null instead.
 */
export const jsonReply = (value: unknown): unknown =>
  value === undefined ? null : JSON.parse(JSON.stringify(value));

const rpcHandlers = Effect.gen(function* () {
  const engine = yield* MailRuntime;
  const runtime: typeof engine = {
    ...engine,
    call: (operation, input) => Effect.map(engine.call(operation, input), jsonReply),
  };
  return MailContract.group.of({
    "mail.gmail.addOutlookAccount": (input) => runtime.call("gmail:addOutlookAccount", input),
    "mail.gmail.mailProviders": (input) =>
      Effect.map(runtime.call("gmail:mailProviders", input), (value) => ({
        outlook: (value as { outlook: boolean }).outlook,
      })),
    "mail.gmail.getUnreadCount": (input) =>
      Effect.map(runtime.call("gmail:getUnreadCount", input), (value) => Number(value)),
    "mail.gmail.listAccounts": (input) => runtime.call("gmail:listAccounts", input),
    "mail.gmail.listSchedules": (input) => runtime.call("gmail:listSchedules", input),
    "mail.gmail.refreshSignatures": (input) => runtime.call("gmail:refreshSignatures", input),
    "mail.gmail.cancelAddAccount": (input) => runtime.call("gmail:cancelAddAccount", input),
    "mail.gmail.listViews": (input) => runtime.call("gmail:listViews", input),
    "mail.gmail.getSyncSettings": (input) => runtime.call("gmail:getSyncSettings", input),
    "mail.gmail.addAccount": (input) => runtime.call("gmail:addAccount", input),
    "mail.gmail.removeAccount": (input) => runtime.call("gmail:removeAccount", input),
    "mail.gmail.syncAccount": (input) => runtime.call("gmail:syncAccount", input),
    "mail.gmail.listLabels": (input) => runtime.call("gmail:listLabels", input),
    "mail.gmail.getSyncStatus": (input) => runtime.call("gmail:getSyncStatus", input),
    "mail.gmail.updateAccount": (input) => runtime.call("gmail:updateAccount", input),
    "mail.gmail.createLabel": (input) => runtime.call("gmail:createLabel", input),
    "mail.gmail.updateLabel": (input) => runtime.call("gmail:updateLabel", input),
    "mail.gmail.deleteLabel": (input) => runtime.call("gmail:deleteLabel", input),
    "mail.gmail.listMessages": (input) => runtime.call("gmail:listMessages", input),
    "mail.gmail.searchMessages": (input) => runtime.call("gmail:searchMessages", input),
    "mail.gmail.search": (input) => runtime.call("gmail:search", input),
    "mail.gmail.listCombinedMessages": (input) => runtime.call("gmail:listCombinedMessages", input),
    "mail.gmail.countCombinedMessages": (input) =>
      runtime.call("gmail:countCombinedMessages", input),
    "mail.gmail.getMessage": (input) => runtime.call("gmail:getMessage", input),
    "mail.gmail.getDraftForMessage": (input) => runtime.call("gmail:getDraftForMessage", input),
    "mail.gmail.getThread": (input) => runtime.call("gmail:getThread", input),
    "mail.gmail.modifyMessage": (input) => runtime.call("gmail:modifyMessage", input),
    "mail.gmail.modifyThread": (input) => runtime.call("gmail:modifyThread", input),
    "mail.gmail.trashMessage": (input) => runtime.call("gmail:trashMessage", input),
    "mail.gmail.untrashMessage": (input) => runtime.call("gmail:untrashMessage", input),
    "mail.gmail.trashThread": (input) => runtime.call("gmail:trashThread", input),
    "mail.gmail.untrashThread": (input) => runtime.call("gmail:untrashThread", input),
    "mail.gmail.deleteThreadsForever": (input) => runtime.call("gmail:deleteThreadsForever", input),
    "mail.gmail.emptyFolder": (input) => runtime.call("gmail:emptyFolder", input),
    "mail.gmail.sendMessage": (input) => runtime.call("gmail:sendMessage", input),
    "mail.gmail.scheduleMessage": (input) => runtime.call("gmail:scheduleMessage", input),
    "mail.gmail.saveDraft": (input) => runtime.call("gmail:saveDraft", input),
    "mail.gmail.getDraftVersion": (input) => runtime.call("gmail:getDraftVersion", input),
    "mail.gmail.loadDraftVersion": (input) => runtime.call("gmail:loadDraftVersion", input),
    "mail.gmail.deleteDraft": (input) => runtime.call("gmail:deleteDraft", input),
    "mail.gmail.snoozeThread": (input) => runtime.call("gmail:snoozeThread", input),
    "mail.gmail.cancelSchedule": (input) => runtime.call("gmail:cancelSchedule", input),
    "mail.gmail.pickAttachments": (input) => runtime.call("gmail:pickAttachments", input),
    "mail.gmail.getAttachmentData": (input) => runtime.call("gmail:getAttachmentData", input),
    "mail.gmail.getAttachment": (input) => runtime.call("gmail:getAttachment", input),
    "mail.gmail.openAttachment": (input) => runtime.call("gmail:openAttachment", input),
    "mail.gmail.openComposeAttachment": (input) =>
      runtime.call("gmail:openComposeAttachment", input),
    "mail.gmail.proxyImage": (input) => runtime.call("gmail:proxyImage", input),
    "mail.gmail.suggestContacts": (input) => runtime.call("gmail:suggestContacts", input),
    "mail.gmail.getSenderAvatar": (input) => runtime.call("gmail:getSenderAvatar", input),
    "mail.gmail.getUnsubscribe": (input) => runtime.call("gmail:getUnsubscribe", input),
    "mail.gmail.unsubscribe": (input) => runtime.call("gmail:unsubscribe", input),
    "mail.gmail.setSyncSettings": (input) => runtime.call("gmail:setSyncSettings", input),
    "mail.gmail.saveView": (input) => runtime.call("gmail:saveView", input),
    "mail.gmail.deleteView": (input) => runtime.call("gmail:deleteView", input),
    "mail.gmail.resetView": (input) => runtime.call("gmail:resetView", input),
    "mail.gmail.importViews": (input) => runtime.call("gmail:importViews", input),
    "mail.gmail.discoverImap": (input) => runtime.call("gmail:discoverImap", input),
    "mail.gmail.addImapAccount": (input) => runtime.call("gmail:addImapAccount", input),
    "mail.gmail.signInImap": (input) => runtime.call("gmail:signInImap", input),
    "mail.calendar.getInvite": (input) => runtime.call("calendar:getInvite", input),
    "mail.calendar.respond": (input) => runtime.call("calendar:respond", input),
    "mail.projects.list": (input) => runtime.call("projects:list", input),
    "mail.projects.unreadCounts": (input) => runtime.call("projects:unreadCounts", input),
    "mail.projects.create": (input) => runtime.call("projects:create", input),
    "mail.projects.update": (input) => runtime.call("projects:update", input),
    "mail.projects.delete": (input) => runtime.call("projects:delete", input),
    "mail.projects.addThreads": (input) => runtime.call("projects:addThreads", input),
    "mail.projects.removeThread": (input) => runtime.call("projects:removeThread", input),
    "mail.projects.addLink": (input) => runtime.call("projects:addLink", input),
    "mail.projects.removeLink": (input) => runtime.call("projects:removeLink", input),
    "mail.projects.threads": (input) => runtime.call("projects:threads", input),
    "mail.projects.documents": (input) => runtime.call("projects:documents", input),
    "mail.translation.getSettings": (input) => runtime.call("translation:getSettings", input),
    "mail.translation.setSettings": (input) => runtime.call("translation:setSettings", input),
    "mail.translation.detect": (input) => runtime.call("translation:detect", input),
    "mail.translation.translate": (input) => runtime.call("translation:translate", input),
    "mail.preferences.getUi": (input) => runtime.call("preferences:getUi", input),
    "mail.preferences.setUi": (input) => runtime.call("preferences:setUi", input),
    "mail.keybindings.read": (input) => runtime.call("keybindings:read", input),
    "mail.keybindings.write": (input) => runtime.call("keybindings:write", input),
    "mail.support.diagnostics": (input) => runtime.call("support:diagnostics", input),
    "mail.support.saveReport": (input) => runtime.call("support:saveReport", input),
    "mail.otter.getState": (input) => runtime.call("otter:getState", input),
    "mail.otter.listDevices": (input) => runtime.call("otter:listDevices", input),
    "mail.otter.signIn": (input) => runtime.call("otter:signIn", input),
    "mail.otter.cancelSignIn": (input) => runtime.call("otter:cancelSignIn", input),
    "mail.otter.signOut": (input) => runtime.call("otter:signOut", input),
    "mail.otter.deleteAccount": (input) => runtime.call("otter:deleteAccount", input),
    "mail.otter.signOutDevice": (input) => runtime.call("otter:signOutDevice", input),
    "mail.otter.listAgentTokens": (input) => runtime.call("otter:listAgentTokens", input),
    "mail.otter.createAgentToken": (input) => runtime.call("otter:createAgentToken", input),
    "mail.otter.deleteAgentToken": (input) => runtime.call("otter:deleteAgentToken", input),
    "mail.todoist.status": (input) => runtime.call("todoist:status", input),
    "mail.todoist.signIn": (input) => runtime.call("todoist:signIn", input),
    "mail.todoist.disconnect": (input) => runtime.call("todoist:disconnect", input),
    "mail.todoist.connect": (input) => runtime.call("todoist:connect", input),
    "mail.todoist.projects": (input) => runtime.call("todoist:projects", input),
    "mail.todoist.labels": (input) => runtime.call("todoist:labels", input),
    "mail.todoist.tasks": (input) => runtime.call("todoist:tasks", input),
    "mail.todoist.sections": (input) => runtime.call("todoist:sections", input),
    "mail.todoist.collaborators": (input) => runtime.call("todoist:collaborators", input),
    "mail.todoist.reminders": (input) => runtime.call("todoist:reminders", input),
    "mail.todoist.create": (input) => runtime.call("todoist:create", input),
    "mail.todoist.update": (input) => runtime.call("todoist:update", input),
    "mail.todoist.addReminder": (input) => runtime.call("todoist:addReminder", input),
    "mail.todoist.deleteReminder": (input) => runtime.call("todoist:deleteReminder", input),
    "mail.todoist.complete": (input) => runtime.call("todoist:complete", input),
    "mail.events": () => runtime.events,
  });
});

export const MailModule = defineServerModule({
  contract: MailContract,
  migrations: [
    { module: "mail", id: 2, name: "server-scheduled-send", run: mailScheduleMigration },
  ],
  layer: Layer.effect(
    MailRuntime,
    Effect.fail(
      new MailError({
        operation: "start",
        message: "Mail requires a node or browser worker adapter.",
      }),
    ),
  ),
  settings: MailSettings,
  homeContributor: mailHomeContributor,
  rpcHandlers,
  tools: { toolkit: MailToolkit, handlers: toolHandlers },
  agentInstructions:
    "Mail tools read the environment's mailboxes. Prepare drafts unless the user explicitly asks to send. Calendar-in-Mail, projects, views and themes use the same access tiers. Never send invitations or mail without an explicit user request.",
});
