import {
  CalendarContract,
  CalendarSettings,
  CalendarToolkit,
  WS_METHODS,
} from "@otterware/calendar-contracts";
import { defineServerModule } from "@otterware/module-kit/engine";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CalendarService } from "./CalendarService.ts";
import * as CalendarServiceLive from "./CalendarServiceLive.ts";
import * as GoogleAuthUnavailable from "./GoogleAuthUnavailable.ts";
import { GoogleAuth } from "./google/GoogleAuth.ts";
import { calendarToolHandlers } from "./CalendarTools.ts";
import calendarReminderDefaultsMigration from "./calendarReminderDefaultsMigration.ts";
import reminderMigration from "./reminderMigration.ts";
import migration from "./migration.ts";
import preferenceSyncMigration from "./preferenceSyncMigration.ts";
import environmentMigration from "./environmentMigration.ts";
import { calendarHomeContributor } from "./CalendarHome.ts";

const rpcHandlers = Effect.gen(function* () {
  const calendar = yield* CalendarService;
  return CalendarContract.group.of({
    [WS_METHODS.calendarSubscribeNotifications]: () => calendar.notifications,
    [WS_METHODS.calendarSubscribeDirectory]: () => calendar.directory,
    [WS_METHODS.calendarSubscribeWeek]: (input) => calendar.week(input),
    [WS_METHODS.calendarGetEvent]: (input) => calendar.getEvent(input),
    [WS_METHODS.calendarSearch]: (input) => calendar.search(input),
    [WS_METHODS.calendarCreateEvent]: (input) => calendar.createEvent(input),
    [WS_METHODS.calendarUpdateEvent]: (input) => calendar.updateEvent(input),
    [WS_METHODS.calendarDeleteEvent]: (input) => calendar.deleteEvent(input),
    [WS_METHODS.calendarRespond]: (input) => calendar.respond(input),
    [WS_METHODS.calendarRestoreEvent]: (input) => calendar.restoreEvent(input),
    [WS_METHODS.calendarApplyChanges]: (input) => calendar.applyChanges(input),
    [WS_METHODS.calendarUpdateCalendar]: (input) => calendar.updateCalendar(input),
    [WS_METHODS.calendarUpdateEnvironmentPreferences]: (input) =>
      calendar.updateEnvironmentPreferences(input),
    [WS_METHODS.calendarUpdatePreferences]: (input) => calendar.updatePreferences(input),
    [WS_METHODS.calendarSync]: (input) => calendar.sync(input),
    [WS_METHODS.calendarRemoveAccount]: ({ accountId }) => calendar.removeAccount(accountId),
    [WS_METHODS.calendarAddDemo]: (input) => calendar.addDemo(input),
    [WS_METHODS.calendarGoogleConnect]: (input) => calendar.connect(input),
    [WS_METHODS.calendarGoogleConnectComplete]: (input) => calendar.connectComplete(input),
    [WS_METHODS.calendarGoogleSetClient]: (input) => calendar.setClient(input),
    [WS_METHODS.calendarGoogleClearClient]: () => calendar.clearClient,
  });
});

/** Supply account-held credentials or local PKCE behind the same GoogleAuth interface. */
export const makeCalendarModule = <E, R>(auth: Layer.Layer<GoogleAuth, E, R>) =>
  defineServerModule({
    contract: CalendarContract,
    migrations: [
      { module: "calendar", id: 1, name: "accounts_events_instances", run: migration },
      { module: "calendar", id: 2, name: "environment_preferences", run: environmentMigration },
      { module: "calendar", id: 3, name: "account_preference_sync", run: preferenceSyncMigration },
      { module: "calendar", id: 4, name: "reminder_deliveries", run: reminderMigration },
      {
        module: "calendar",
        id: 5,
        name: "calendar_reminder_defaults",
        run: calendarReminderDefaultsMigration,
      },
    ],
    layer: CalendarServiceLive.layer.pipe(Layer.provide(auth)),
    rpcHandlers,
    tools: { toolkit: CalendarToolkit, handlers: calendarToolHandlers },
    homeContributor: calendarHomeContributor,
    settings: CalendarSettings,
    agentInstructions:
      "Use calendar_list_accounts, calendar_list_events, calendar_search_events, calendar_get_event and calendar_find_free_time to read the environment's calendars. Create, update, delete or respond to events only when asked. Use the viewer time zone from page context; all-day dates have an exclusive end.",
  });

export const CalendarModule = makeCalendarModule(GoogleAuthUnavailable.layer);
