import * as Schema from "effect/Schema";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";
import { defineModuleContract, moduleRpcErrors } from "@otterware/module-kit/contracts";
import { AuthOrchestrationReadScope, AuthOrchestrationOperateScope } from "@t3tools/contracts";
import {
  CalendarEnvironmentPreferences,
  CalendarAccountRefInput,
  CalendarAddDemoInput,
  CalendarApplyChangesInput,
  CalendarCreateEventInput,
  CalendarDeleteEventInput,
  CalendarDirectory,
  CalendarError,
  CalendarEventDetails,
  CalendarEventRefInput,
  CalendarMutationResult,
  CalendarPreferencesPatch,
  CalendarRespondInput,
  CalendarRestoreEventInput,
  CalendarSearchInput,
  CalendarSearchResult,
  CalendarSyncInput,
  CalendarUpdateCalendarInput,
  CalendarUpdateEventInput,
  CalendarWeekEvent,
  CalendarWeekInput,
  GoogleClientInput,
  GoogleConnectCompleteInput,
  GoogleConnectInput,
  GoogleConnectState,
} from "./calendar.ts";
export const WS_METHODS = {
  calendarUpdateEnvironmentPreferences: "calendar.updateEnvironmentPreferences",
  calendarSubscribeDirectory: "calendar.subscribeDirectory",
  calendarSubscribeWeek: "calendar.subscribeWeek",
  calendarGetEvent: "calendar.getEvent",
  calendarSearch: "calendar.search",
  calendarCreateEvent: "calendar.createEvent",
  calendarUpdateEvent: "calendar.updateEvent",
  calendarDeleteEvent: "calendar.deleteEvent",
  calendarRespond: "calendar.respond",
  calendarRestoreEvent: "calendar.restoreEvent",
  calendarApplyChanges: "calendar.applyChanges",
  calendarUpdateCalendar: "calendar.updateCalendar",
  calendarUpdatePreferences: "calendar.updatePreferences",
  calendarSync: "calendar.sync",
  calendarRemoveAccount: "calendar.removeAccount",
  calendarAddDemo: "calendar.addDemo",
  calendarGoogleConnect: "calendar.google.connect",
  calendarGoogleConnectComplete: "calendar.google.connectComplete",
  calendarGoogleSetClient: "calendar.google.setClient",
  calendarGoogleClearClient: "calendar.google.clearClient",
} as const;
export const CalendarRpcError = moduleRpcErrors(CalendarError);

/** Accounts, calendars, preferences and the Google client state: a snapshot on every change. */
const WsCalendarSubscribeDirectoryRpc = Rpc.make(WS_METHODS.calendarSubscribeDirectory, {
  payload: Schema.Struct({}),
  success: CalendarDirectory,
  error: CalendarRpcError,
  stream: true,
});

/** One week chunk of visible instances: a snapshot, then changes. */
const WsCalendarSubscribeWeekRpc = Rpc.make(WS_METHODS.calendarSubscribeWeek, {
  payload: CalendarWeekInput,
  success: CalendarWeekEvent,
  error: CalendarRpcError,
  stream: true,
});

const WsCalendarGetEventRpc = Rpc.make(WS_METHODS.calendarGetEvent, {
  payload: CalendarEventRefInput,
  success: CalendarEventDetails,
  error: CalendarRpcError,
});

const WsCalendarSearchRpc = Rpc.make(WS_METHODS.calendarSearch, {
  payload: CalendarSearchInput,
  success: CalendarSearchResult,
  error: CalendarRpcError,
});

const WsCalendarCreateEventRpc = Rpc.make(WS_METHODS.calendarCreateEvent, {
  payload: CalendarCreateEventInput,
  success: CalendarMutationResult,
  error: CalendarRpcError,
});

const WsCalendarUpdateEventRpc = Rpc.make(WS_METHODS.calendarUpdateEvent, {
  payload: CalendarUpdateEventInput,
  success: CalendarMutationResult,
  error: CalendarRpcError,
});

const WsCalendarDeleteEventRpc = Rpc.make(WS_METHODS.calendarDeleteEvent, {
  payload: CalendarDeleteEventInput,
  success: CalendarMutationResult,
  error: CalendarRpcError,
});

const WsCalendarRespondRpc = Rpc.make(WS_METHODS.calendarRespond, {
  payload: CalendarRespondInput,
  success: CalendarMutationResult,
  error: CalendarRpcError,
});

const WsCalendarRestoreEventRpc = Rpc.make(WS_METHODS.calendarRestoreEvent, {
  payload: CalendarRestoreEventInput,
  success: CalendarMutationResult,
  error: CalendarRpcError,
});

/** Runs undo (or redo) steps in order; answers with the steps that revert them. */
const WsCalendarApplyChangesRpc = Rpc.make(WS_METHODS.calendarApplyChanges, {
  payload: CalendarApplyChangesInput,
  success: CalendarMutationResult,
  error: CalendarRpcError,
});

const WsCalendarUpdateCalendarRpc = Rpc.make(WS_METHODS.calendarUpdateCalendar, {
  payload: CalendarUpdateCalendarInput,
  error: CalendarRpcError,
});

const WsCalendarUpdatePreferencesRpc = Rpc.make(WS_METHODS.calendarUpdatePreferences, {
  payload: CalendarPreferencesPatch,
  error: CalendarRpcError,
});

const WsCalendarSyncRpc = Rpc.make(WS_METHODS.calendarSync, {
  payload: CalendarSyncInput,
  error: CalendarRpcError,
});

const WsCalendarRemoveAccountRpc = Rpc.make(WS_METHODS.calendarRemoveAccount, {
  payload: CalendarAccountRefInput,
  error: CalendarRpcError,
});

const WsCalendarAddDemoRpc = Rpc.make(WS_METHODS.calendarAddDemo, {
  payload: CalendarAddDemoInput,
  error: CalendarRpcError,
});

/** Starts a Google sign-in and streams its state; ending the stream cancels an open flow. */
const WsCalendarGoogleConnectRpc = Rpc.make(WS_METHODS.calendarGoogleConnect, {
  payload: GoogleConnectInput,
  success: GoogleConnectState,
  error: CalendarRpcError,
  stream: true,
});

/** Hands the environment the redirect URL a client caught or the user pasted. */
const WsCalendarGoogleConnectCompleteRpc = Rpc.make(WS_METHODS.calendarGoogleConnectComplete, {
  payload: GoogleConnectCompleteInput,
  error: CalendarRpcError,
});

const WsCalendarGoogleSetClientRpc = Rpc.make(WS_METHODS.calendarGoogleSetClient, {
  payload: GoogleClientInput,
  error: CalendarRpcError,
});

const WsCalendarGoogleClearClientRpc = Rpc.make(WS_METHODS.calendarGoogleClearClient, {
  payload: Schema.Struct({}),
  error: CalendarRpcError,
});

const WsCalendarUpdateEnvironmentPreferencesRpc = Rpc.make(
  WS_METHODS.calendarUpdateEnvironmentPreferences,
  { payload: CalendarEnvironmentPreferences, error: CalendarRpcError },
);

export const CalendarContract = defineModuleContract({
  id: "calendar",
  group: RpcGroup.make(
    WsCalendarUpdateEnvironmentPreferencesRpc,
    WsCalendarSubscribeDirectoryRpc,
    WsCalendarSubscribeWeekRpc,
    WsCalendarGetEventRpc,
    WsCalendarSearchRpc,
    WsCalendarCreateEventRpc,
    WsCalendarUpdateEventRpc,
    WsCalendarDeleteEventRpc,
    WsCalendarRespondRpc,
    WsCalendarRestoreEventRpc,
    WsCalendarApplyChangesRpc,
    WsCalendarUpdateCalendarRpc,
    WsCalendarUpdatePreferencesRpc,
    WsCalendarSyncRpc,
    WsCalendarRemoveAccountRpc,
    WsCalendarAddDemoRpc,
    WsCalendarGoogleConnectRpc,
    WsCalendarGoogleConnectCompleteRpc,
    WsCalendarGoogleSetClientRpc,
    WsCalendarGoogleClearClientRpc,
  ),
  scopes: {
    [WS_METHODS.calendarUpdateEnvironmentPreferences]: AuthOrchestrationOperateScope,
    [WS_METHODS.calendarSubscribeDirectory]: AuthOrchestrationReadScope,
    [WS_METHODS.calendarSubscribeWeek]: AuthOrchestrationReadScope,
    [WS_METHODS.calendarGetEvent]: AuthOrchestrationReadScope,
    [WS_METHODS.calendarSearch]: AuthOrchestrationReadScope,
    [WS_METHODS.calendarCreateEvent]: AuthOrchestrationOperateScope,
    [WS_METHODS.calendarUpdateEvent]: AuthOrchestrationOperateScope,
    [WS_METHODS.calendarDeleteEvent]: AuthOrchestrationOperateScope,
    [WS_METHODS.calendarRespond]: AuthOrchestrationOperateScope,
    [WS_METHODS.calendarRestoreEvent]: AuthOrchestrationOperateScope,
    [WS_METHODS.calendarApplyChanges]: AuthOrchestrationOperateScope,
    [WS_METHODS.calendarUpdateCalendar]: AuthOrchestrationOperateScope,
    [WS_METHODS.calendarUpdatePreferences]: AuthOrchestrationOperateScope,
    [WS_METHODS.calendarSync]: AuthOrchestrationOperateScope,
    [WS_METHODS.calendarRemoveAccount]: AuthOrchestrationOperateScope,
    [WS_METHODS.calendarAddDemo]: AuthOrchestrationOperateScope,
    [WS_METHODS.calendarGoogleConnect]: AuthOrchestrationOperateScope,
    [WS_METHODS.calendarGoogleConnectComplete]: AuthOrchestrationOperateScope,
    [WS_METHODS.calendarGoogleSetClient]: AuthOrchestrationOperateScope,
    [WS_METHODS.calendarGoogleClearClient]: AuthOrchestrationOperateScope,
  },
});
