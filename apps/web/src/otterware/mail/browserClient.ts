import { MailOperations } from "@otterware/mail-contracts/rpc";
import { browserMailPage, serveMailPage } from "@otterware/mail-browser/page";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Schedule from "effect/Schedule";
import * as Stream from "effect/Stream";
import { useEffect, useState } from "react";
import type { ServerModuleAvailability } from "../moduleState";
import { browserClient, runInBrowser } from "../browser/runtime";
import type { MailTransport } from "./rpc/host";

function operation<P, A, E>(
  decode: (input: unknown) => P,
  call: (client: Effect.Success<typeof browserClient>, input: P) => Effect.Effect<A, E>,
) {
  return (input: unknown): Promise<unknown> =>
    runInBrowser(Effect.flatMap(browserClient, (client) => call(client, decode(input ?? {}))));
}

// Every operation is a concrete typed RPC on the browser environment's client.
const operations: Record<string, (input: unknown) => Promise<unknown>> = {
  "gmail:addOutlookAccount": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:addOutlookAccount"].payloadSchema),
    (client, input) => client["mail.gmail.addOutlookAccount"](input),
  ),
  "gmail:mailProviders": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:mailProviders"].payloadSchema),
    (client, input) => client["mail.gmail.mailProviders"](input),
  ),
  "gmail:getUnreadCount": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:getUnreadCount"].payloadSchema),
    (client, input) => client["mail.gmail.getUnreadCount"](input),
  ),
  "gmail:listAccounts": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:listAccounts"].payloadSchema),
    (client, input) => client["mail.gmail.listAccounts"](input),
  ),
  "gmail:listSchedules": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:listSchedules"].payloadSchema),
    (client, input) => client["mail.gmail.listSchedules"](input),
  ),
  "gmail:refreshSignatures": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:refreshSignatures"].payloadSchema),
    (client, input) => client["mail.gmail.refreshSignatures"](input),
  ),
  "gmail:cancelAddAccount": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:cancelAddAccount"].payloadSchema),
    (client, input) => client["mail.gmail.cancelAddAccount"](input),
  ),
  "gmail:listViews": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:listViews"].payloadSchema),
    (client, input) => client["mail.gmail.listViews"](input),
  ),
  "gmail:getSyncSettings": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:getSyncSettings"].payloadSchema),
    (client, input) => client["mail.gmail.getSyncSettings"](input),
  ),
  "gmail:addAccount": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:addAccount"].payloadSchema),
    (client, input) => client["mail.gmail.addAccount"](input),
  ),
  "gmail:removeAccount": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:removeAccount"].payloadSchema),
    (client, input) => client["mail.gmail.removeAccount"](input),
  ),
  "gmail:syncAccount": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:syncAccount"].payloadSchema),
    (client, input) => client["mail.gmail.syncAccount"](input),
  ),
  "gmail:listLabels": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:listLabels"].payloadSchema),
    (client, input) => client["mail.gmail.listLabels"](input),
  ),
  "gmail:getSyncStatus": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:getSyncStatus"].payloadSchema),
    (client, input) => client["mail.gmail.getSyncStatus"](input),
  ),
  "gmail:updateAccount": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:updateAccount"].payloadSchema),
    (client, input) => client["mail.gmail.updateAccount"](input),
  ),
  "gmail:createLabel": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:createLabel"].payloadSchema),
    (client, input) => client["mail.gmail.createLabel"](input),
  ),
  "gmail:updateLabel": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:updateLabel"].payloadSchema),
    (client, input) => client["mail.gmail.updateLabel"](input),
  ),
  "gmail:deleteLabel": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:deleteLabel"].payloadSchema),
    (client, input) => client["mail.gmail.deleteLabel"](input),
  ),
  "gmail:listMessages": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:listMessages"].payloadSchema),
    (client, input) => client["mail.gmail.listMessages"](input),
  ),
  "gmail:searchMessages": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:searchMessages"].payloadSchema),
    (client, input) => client["mail.gmail.searchMessages"](input),
  ),
  "gmail:search": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:search"].payloadSchema),
    (client, input) => client["mail.gmail.search"](input),
  ),
  "gmail:listCombinedMessages": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:listCombinedMessages"].payloadSchema),
    (client, input) => client["mail.gmail.listCombinedMessages"](input),
  ),
  "gmail:countCombinedMessages": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:countCombinedMessages"].payloadSchema),
    (client, input) => client["mail.gmail.countCombinedMessages"](input),
  ),
  "gmail:getMessage": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:getMessage"].payloadSchema),
    (client, input) => client["mail.gmail.getMessage"](input),
  ),
  "gmail:getDraftForMessage": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:getDraftForMessage"].payloadSchema),
    (client, input) => client["mail.gmail.getDraftForMessage"](input),
  ),
  "gmail:getThread": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:getThread"].payloadSchema),
    (client, input) => client["mail.gmail.getThread"](input),
  ),
  "gmail:modifyMessage": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:modifyMessage"].payloadSchema),
    (client, input) => client["mail.gmail.modifyMessage"](input),
  ),
  "gmail:modifyThread": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:modifyThread"].payloadSchema),
    (client, input) => client["mail.gmail.modifyThread"](input),
  ),
  "gmail:trashMessage": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:trashMessage"].payloadSchema),
    (client, input) => client["mail.gmail.trashMessage"](input),
  ),
  "gmail:untrashMessage": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:untrashMessage"].payloadSchema),
    (client, input) => client["mail.gmail.untrashMessage"](input),
  ),
  "gmail:trashThread": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:trashThread"].payloadSchema),
    (client, input) => client["mail.gmail.trashThread"](input),
  ),
  "gmail:untrashThread": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:untrashThread"].payloadSchema),
    (client, input) => client["mail.gmail.untrashThread"](input),
  ),
  "gmail:deleteThreadsForever": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:deleteThreadsForever"].payloadSchema),
    (client, input) => client["mail.gmail.deleteThreadsForever"](input),
  ),
  "gmail:emptyFolder": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:emptyFolder"].payloadSchema),
    (client, input) => client["mail.gmail.emptyFolder"](input),
  ),
  "gmail:sendMessage": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:sendMessage"].payloadSchema),
    (client, input) => client["mail.gmail.sendMessage"](input),
  ),
  "gmail:scheduleMessage": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:scheduleMessage"].payloadSchema),
    (client, input) => client["mail.gmail.scheduleMessage"](input),
  ),
  "gmail:saveDraft": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:saveDraft"].payloadSchema),
    (client, input) => client["mail.gmail.saveDraft"](input),
  ),
  "gmail:getDraftVersion": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:getDraftVersion"].payloadSchema),
    (client, input) => client["mail.gmail.getDraftVersion"](input),
  ),
  "gmail:loadDraftVersion": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:loadDraftVersion"].payloadSchema),
    (client, input) => client["mail.gmail.loadDraftVersion"](input),
  ),
  "gmail:deleteDraft": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:deleteDraft"].payloadSchema),
    (client, input) => client["mail.gmail.deleteDraft"](input),
  ),
  "gmail:snoozeThread": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:snoozeThread"].payloadSchema),
    (client, input) => client["mail.gmail.snoozeThread"](input),
  ),
  "gmail:cancelSchedule": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:cancelSchedule"].payloadSchema),
    (client, input) => client["mail.gmail.cancelSchedule"](input),
  ),
  "gmail:pickAttachments": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:pickAttachments"].payloadSchema),
    (client, input) => client["mail.gmail.pickAttachments"](input),
  ),
  "gmail:getAttachmentData": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:getAttachmentData"].payloadSchema),
    (client, input) => client["mail.gmail.getAttachmentData"](input),
  ),
  "gmail:getAttachment": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:getAttachment"].payloadSchema),
    (client, input) => client["mail.gmail.getAttachment"](input),
  ),
  "gmail:openAttachment": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:openAttachment"].payloadSchema),
    (client, input) => client["mail.gmail.openAttachment"](input),
  ),
  "gmail:openComposeAttachment": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:openComposeAttachment"].payloadSchema),
    (client, input) => client["mail.gmail.openComposeAttachment"](input),
  ),
  "gmail:proxyImage": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:proxyImage"].payloadSchema),
    (client, input) => client["mail.gmail.proxyImage"](input),
  ),
  "gmail:suggestContacts": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:suggestContacts"].payloadSchema),
    (client, input) => client["mail.gmail.suggestContacts"](input),
  ),
  "gmail:getSenderAvatar": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:getSenderAvatar"].payloadSchema),
    (client, input) => client["mail.gmail.getSenderAvatar"](input),
  ),
  "gmail:getUnsubscribe": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:getUnsubscribe"].payloadSchema),
    (client, input) => client["mail.gmail.getUnsubscribe"](input),
  ),
  "gmail:unsubscribe": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:unsubscribe"].payloadSchema),
    (client, input) => client["mail.gmail.unsubscribe"](input),
  ),
  "gmail:setSyncSettings": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:setSyncSettings"].payloadSchema),
    (client, input) => client["mail.gmail.setSyncSettings"](input),
  ),
  "gmail:saveView": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:saveView"].payloadSchema),
    (client, input) => client["mail.gmail.saveView"](input),
  ),
  "gmail:deleteView": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:deleteView"].payloadSchema),
    (client, input) => client["mail.gmail.deleteView"](input),
  ),
  "gmail:resetView": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:resetView"].payloadSchema),
    (client, input) => client["mail.gmail.resetView"](input),
  ),
  "gmail:importViews": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:importViews"].payloadSchema),
    (client, input) => client["mail.gmail.importViews"](input),
  ),
  "gmail:discoverImap": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:discoverImap"].payloadSchema),
    (client, input) => client["mail.gmail.discoverImap"](input),
  ),
  "gmail:addImapAccount": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:addImapAccount"].payloadSchema),
    (client, input) => client["mail.gmail.addImapAccount"](input),
  ),
  "gmail:signInImap": operation(
    Schema.decodeUnknownSync(MailOperations["gmail:signInImap"].payloadSchema),
    (client, input) => client["mail.gmail.signInImap"](input),
  ),
  "calendar:getInvite": operation(
    Schema.decodeUnknownSync(MailOperations["calendar:getInvite"].payloadSchema),
    (client, input) => client["mail.calendar.getInvite"](input),
  ),
  "calendar:respond": operation(
    Schema.decodeUnknownSync(MailOperations["calendar:respond"].payloadSchema),
    (client, input) => client["mail.calendar.respond"](input),
  ),
  "projects:list": operation(
    Schema.decodeUnknownSync(MailOperations["projects:list"].payloadSchema),
    (client, input) => client["mail.projects.list"](input),
  ),
  "projects:unreadCounts": operation(
    Schema.decodeUnknownSync(MailOperations["projects:unreadCounts"].payloadSchema),
    (client, input) => client["mail.projects.unreadCounts"](input),
  ),
  "projects:create": operation(
    Schema.decodeUnknownSync(MailOperations["projects:create"].payloadSchema),
    (client, input) => client["mail.projects.create"](input),
  ),
  "projects:update": operation(
    Schema.decodeUnknownSync(MailOperations["projects:update"].payloadSchema),
    (client, input) => client["mail.projects.update"](input),
  ),
  "projects:delete": operation(
    Schema.decodeUnknownSync(MailOperations["projects:delete"].payloadSchema),
    (client, input) => client["mail.projects.delete"](input),
  ),
  "projects:addThreads": operation(
    Schema.decodeUnknownSync(MailOperations["projects:addThreads"].payloadSchema),
    (client, input) => client["mail.projects.addThreads"](input),
  ),
  "projects:removeThread": operation(
    Schema.decodeUnknownSync(MailOperations["projects:removeThread"].payloadSchema),
    (client, input) => client["mail.projects.removeThread"](input),
  ),
  "projects:addLink": operation(
    Schema.decodeUnknownSync(MailOperations["projects:addLink"].payloadSchema),
    (client, input) => client["mail.projects.addLink"](input),
  ),
  "projects:removeLink": operation(
    Schema.decodeUnknownSync(MailOperations["projects:removeLink"].payloadSchema),
    (client, input) => client["mail.projects.removeLink"](input),
  ),
  "projects:threads": operation(
    Schema.decodeUnknownSync(MailOperations["projects:threads"].payloadSchema),
    (client, input) => client["mail.projects.threads"](input),
  ),
  "projects:documents": operation(
    Schema.decodeUnknownSync(MailOperations["projects:documents"].payloadSchema),
    (client, input) => client["mail.projects.documents"](input),
  ),
  "translation:getSettings": operation(
    Schema.decodeUnknownSync(MailOperations["translation:getSettings"].payloadSchema),
    (client, input) => client["mail.translation.getSettings"](input),
  ),
  "translation:setSettings": operation(
    Schema.decodeUnknownSync(MailOperations["translation:setSettings"].payloadSchema),
    (client, input) => client["mail.translation.setSettings"](input),
  ),
  "translation:detect": operation(
    Schema.decodeUnknownSync(MailOperations["translation:detect"].payloadSchema),
    (client, input) => client["mail.translation.detect"](input),
  ),
  "translation:translate": operation(
    Schema.decodeUnknownSync(MailOperations["translation:translate"].payloadSchema),
    (client, input) => client["mail.translation.translate"](input),
  ),
  "preferences:getUi": operation(
    Schema.decodeUnknownSync(MailOperations["preferences:getUi"].payloadSchema),
    (client, input) => client["mail.preferences.getUi"](input),
  ),
  "preferences:setUi": operation(
    Schema.decodeUnknownSync(MailOperations["preferences:setUi"].payloadSchema),
    (client, input) => client["mail.preferences.setUi"](input),
  ),
  "keybindings:read": operation(
    Schema.decodeUnknownSync(MailOperations["keybindings:read"].payloadSchema),
    (client, input) => client["mail.keybindings.read"](input),
  ),
  "keybindings:write": operation(
    Schema.decodeUnknownSync(MailOperations["keybindings:write"].payloadSchema),
    (client, input) => client["mail.keybindings.write"](input),
  ),
  "support:diagnostics": operation(
    Schema.decodeUnknownSync(MailOperations["support:diagnostics"].payloadSchema),
    (client, input) => client["mail.support.diagnostics"](input),
  ),
  "support:saveReport": operation(
    Schema.decodeUnknownSync(MailOperations["support:saveReport"].payloadSchema),
    (client, input) => client["mail.support.saveReport"](input),
  ),
  "otter:getState": operation(
    Schema.decodeUnknownSync(MailOperations["otter:getState"].payloadSchema),
    (client, input) => client["mail.otter.getState"](input),
  ),
  "otter:listDevices": operation(
    Schema.decodeUnknownSync(MailOperations["otter:listDevices"].payloadSchema),
    (client, input) => client["mail.otter.listDevices"](input),
  ),
  "otter:signIn": operation(
    Schema.decodeUnknownSync(MailOperations["otter:signIn"].payloadSchema),
    (client, input) => client["mail.otter.signIn"](input),
  ),
  "otter:cancelSignIn": operation(
    Schema.decodeUnknownSync(MailOperations["otter:cancelSignIn"].payloadSchema),
    (client, input) => client["mail.otter.cancelSignIn"](input),
  ),
  "otter:signOut": operation(
    Schema.decodeUnknownSync(MailOperations["otter:signOut"].payloadSchema),
    (client, input) => client["mail.otter.signOut"](input),
  ),
  "otter:deleteAccount": operation(
    Schema.decodeUnknownSync(MailOperations["otter:deleteAccount"].payloadSchema),
    (client, input) => client["mail.otter.deleteAccount"](input),
  ),
  "otter:signOutDevice": operation(
    Schema.decodeUnknownSync(MailOperations["otter:signOutDevice"].payloadSchema),
    (client, input) => client["mail.otter.signOutDevice"](input),
  ),
  "otter:listAgentTokens": operation(
    Schema.decodeUnknownSync(MailOperations["otter:listAgentTokens"].payloadSchema),
    (client, input) => client["mail.otter.listAgentTokens"](input),
  ),
  "otter:createAgentToken": operation(
    Schema.decodeUnknownSync(MailOperations["otter:createAgentToken"].payloadSchema),
    (client, input) => client["mail.otter.createAgentToken"](input),
  ),
  "otter:deleteAgentToken": operation(
    Schema.decodeUnknownSync(MailOperations["otter:deleteAgentToken"].payloadSchema),
    (client, input) => client["mail.otter.deleteAgentToken"](input),
  ),
  "todoist:status": operation(
    Schema.decodeUnknownSync(MailOperations["todoist:status"].payloadSchema),
    (client, input) => client["mail.todoist.status"](input),
  ),
  "todoist:signIn": operation(
    Schema.decodeUnknownSync(MailOperations["todoist:signIn"].payloadSchema),
    (client, input) => client["mail.todoist.signIn"](input),
  ),
  "todoist:disconnect": operation(
    Schema.decodeUnknownSync(MailOperations["todoist:disconnect"].payloadSchema),
    (client, input) => client["mail.todoist.disconnect"](input),
  ),
  "todoist:connect": operation(
    Schema.decodeUnknownSync(MailOperations["todoist:connect"].payloadSchema),
    (client, input) => client["mail.todoist.connect"](input),
  ),
  "todoist:projects": operation(
    Schema.decodeUnknownSync(MailOperations["todoist:projects"].payloadSchema),
    (client, input) => client["mail.todoist.projects"](input),
  ),
  "todoist:labels": operation(
    Schema.decodeUnknownSync(MailOperations["todoist:labels"].payloadSchema),
    (client, input) => client["mail.todoist.labels"](input),
  ),
  "todoist:tasks": operation(
    Schema.decodeUnknownSync(MailOperations["todoist:tasks"].payloadSchema),
    (client, input) => client["mail.todoist.tasks"](input),
  ),
  "todoist:sections": operation(
    Schema.decodeUnknownSync(MailOperations["todoist:sections"].payloadSchema),
    (client, input) => client["mail.todoist.sections"](input),
  ),
  "todoist:collaborators": operation(
    Schema.decodeUnknownSync(MailOperations["todoist:collaborators"].payloadSchema),
    (client, input) => client["mail.todoist.collaborators"](input),
  ),
  "todoist:reminders": operation(
    Schema.decodeUnknownSync(MailOperations["todoist:reminders"].payloadSchema),
    (client, input) => client["mail.todoist.reminders"](input),
  ),
  "todoist:create": operation(
    Schema.decodeUnknownSync(MailOperations["todoist:create"].payloadSchema),
    (client, input) => client["mail.todoist.create"](input),
  ),
  "todoist:update": operation(
    Schema.decodeUnknownSync(MailOperations["todoist:update"].payloadSchema),
    (client, input) => client["mail.todoist.update"](input),
  ),
  "todoist:addReminder": operation(
    Schema.decodeUnknownSync(MailOperations["todoist:addReminder"].payloadSchema),
    (client, input) => client["mail.todoist.addReminder"](input),
  ),
  "todoist:deleteReminder": operation(
    Schema.decodeUnknownSync(MailOperations["todoist:deleteReminder"].payloadSchema),
    (client, input) => client["mail.todoist.deleteReminder"](input),
  ),
  "todoist:complete": operation(
    Schema.decodeUnknownSync(MailOperations["todoist:complete"].payloadSchema),
    (client, input) => client["mail.todoist.complete"](input),
  ),
};
export const browserMailTransport: MailTransport = {
  id: "browser",
  call(channel, input) {
    const call = operations[channel];
    if (!call) return Promise.reject(new Error(`Mail operation is unavailable: ${channel}`));
    return call(input);
  },
  subscribe(publish) {
    const controller = new AbortController();
    const listen = Effect.flatMap(browserClient, (client) =>
      client["mail.events"]({}).pipe(
        Stream.runForEach((event) => Effect.sync(() => publish(event.channel, event.params))),
      ),
    );
    // Re-open after Mail's worker restarts on an account change or module toggle.
    void runInBrowser(
      Effect.repeat(Effect.ignore(listen), Schedule.spaced("1 second")),
      controller.signal,
    ).catch(() => {});
    return () => controller.abort();
  },
};

export function useBrowserMailAvailability(enabled: boolean): ServerModuleAvailability {
  const [availability, setAvailability] = useState<ServerModuleAvailability>("loading");
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const read = Effect.flatMap(browserClient, (client) => client["modules.list"]({})).pipe(
      Effect.tap((state) =>
        Effect.sync(() =>
          setAvailability(
            state.modules.find((module) => module.id === "mail")?.state ?? "not-installed",
          ),
        ),
      ),
      Effect.catch(() => Effect.sync(() => setAvailability("failed"))),
    );
    void runInBrowser(Effect.repeat(read, Schedule.spaced("5 seconds")), controller.signal).catch(
      () => {},
    );
    return () => controller.abort();
  }, [enabled]);
  return availability;
}

/** Exactly one handler while this Mail page (or its Settings page) is active. */
export function useMailPageCapabilities(enabled: boolean, navigate: (path: string) => void) {
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const handlers = browserMailPage({
      onOpenMessage: ({ accountId, messageId }) =>
        navigate(`/mail/${encodeURIComponent(accountId)}/INBOX/${encodeURIComponent(messageId)}`),
    });
    void runInBrowser(
      Effect.flatMap(browserClient, (client) => serveMailPage(client, handlers)),
      controller.signal,
    ).catch(() => {});
    return () => controller.abort();
  }, [enabled, navigate]);
}

/** Separate retained drafts and query caches when the browser's signed-in account changes. */
export function useBrowserMailIdentity(enabled: boolean) {
  const [identity, setIdentity] = useState("signed-out");
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void runInBrowser(
      Effect.flatMap(browserClient, (client) =>
        client["browser.account.watch"]({}).pipe(
          Stream.runForEach((state) =>
            Effect.sync(() => setIdentity(state.userId ?? "signed-out")),
          ),
        ),
      ),
      controller.signal,
    ).catch(() => {});
    return () => controller.abort();
  }, [enabled]);
  return identity;
}
