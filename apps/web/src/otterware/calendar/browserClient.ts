/**
 * Calendar's page over "this browser" (ADR 0008): the same `CalendarWebClient`
 * the page uses with an environment, answered by the in-browser
 * environment's Calendar engine. Google calendars come from the Otter
 * Account's connections; demo calendars work signed out.
 */
import {
  CalendarAccountId,
  CalendarId,
  type CalendarDirectory,
  type CalendarEventInstance,
} from "@otterware/composition/contracts";
import { applyCalendarWeekEvent, EMPTY_CALENDAR_INSTANCES, type CalendarWebClient } from "./ui";
import { useAtomValue } from "@effect/atom-react";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import { AsyncResult, Atom } from "effect/reactivity";

import { browserAtomRuntime, browserClient, runInBrowser } from "../browser/runtime";

const directoryAtom = browserAtomRuntime.atom(
  Stream.unwrap(Effect.map(browserClient, (client) => client["calendar.subscribeDirectory"]({}))),
);

const weekAtom = Atom.family((week: string) =>
  browserAtomRuntime.atom(
    Stream.unwrap(
      Effect.map(browserClient, (client) =>
        client["calendar.subscribeWeek"]({ week }).pipe(
          Stream.scan(() => EMPTY_CALENDAR_INSTANCES, applyCalendarWeekEvent),
        ),
      ),
    ),
  ),
);

const weeksAtom = Atom.family((key: string) =>
  Atom.make((get) => {
    const weeks = JSON.parse(key) as ReadonlyArray<string>;
    let loading = false;
    let error: string | null = null;
    const unique = new Map<string, CalendarEventInstance>();
    for (const week of weeks) {
      const result = get(weekAtom(week));
      if (result._tag === "Initial") loading = true;
      else if (result._tag === "Failure") error = Cause.pretty(result.cause);
      const map = Option.getOrNull(AsyncResult.value(result));
      if (map) for (const [id, value] of map) unique.set(id, value);
    }
    return { instances: [...unique.values()], loading, error };
  }),
);

const call = <A, E>(
  run: (client: Effect.Success<typeof browserClient>) => Effect.Effect<A, E>,
): Promise<A> => runInBrowser(Effect.flatMap(browserClient, run));

const done = () => undefined;

export function makeBrowserCalendarClient(accountId: string | null): CalendarWebClient {
  return {
    // Reminders are keyed by environment; this browser is one of its own.
    environmentId: `this-browser:${accountId ?? "signed-out"}`,
    watchNotifications: (onNotification, onError) => {
      const controller = new AbortController();
      void runInBrowser(
        Effect.flatMap(browserClient, (client) =>
          client["calendar.subscribeNotifications"]({}).pipe(
            Stream.runForEach((notification) => Effect.sync(() => onNotification(notification))),
          ),
        ),
        controller.signal,
      ).catch((cause: unknown) => {
        if (!controller.signal.aborted) onError(String(cause));
      });
      return () => controller.abort();
    },
    useDirectory: () => {
      const result = useAtomValue(directoryAtom);
      return {
        directory: Option.getOrNull(AsyncResult.value(result)) as CalendarDirectory | null,
        // This browser is the user's own: every change is theirs to make.
        canWrite: true,
        error: result._tag === "Failure" ? Cause.pretty(result.cause) : null,
      };
    },
    useWeeks: (weeks) => useAtomValue(weeksAtom(JSON.stringify(weeks))),
    getEvent: (calendarId, eventId) =>
      call((client) =>
        client["calendar.getEvent"]({ calendarId: CalendarId.make(calendarId), eventId }),
      ),
    search: (input) => call((client) => client["calendar.search"](input)),
    create: (input) => call((client) => client["calendar.createEvent"](input)),
    update: (input) => call((client) => client["calendar.updateEvent"](input)),
    delete: (input) => call((client) => client["calendar.deleteEvent"](input)),
    undo: (input) => call((client) => client["calendar.applyChanges"](input)),
    respond: (input) => call((client) => client["calendar.respond"](input)),
    environmentPreferences: (input) =>
      call((client) => client["calendar.updateEnvironmentPreferences"](input)).then(done),
    preferences: (input) =>
      call((client) => client["calendar.updatePreferences"](input)).then(done),
    calendar: (input) => call((client) => client["calendar.updateCalendar"](input)).then(done),
    sync: () => call((client) => client["calendar.sync"]({})).then(done),
    addDemo: () => call((client) => client["calendar.addDemo"]({ size: "standard" })).then(done),
    removeAccount: (accountId) =>
      call((client) =>
        client["calendar.removeAccount"]({ accountId: CalendarAccountId.make(accountId) }),
      ).then(done),
    setClient: (input) => call((client) => client["calendar.google.setClient"](input)).then(done),
    clearClient: () => call((client) => client["calendar.google.clearClient"]({})).then(done),
    completeConnect: (flowId, callbackUrl) =>
      call((client) => client["calendar.google.connectComplete"]({ flowId, callbackUrl })).then(
        done,
      ),
    connect: (input, onState, onError) => {
      const controller = new AbortController();
      void runInBrowser(
        Effect.flatMap(browserClient, (client) =>
          client["calendar.google.connect"](input).pipe(
            Stream.runForEach((state) => Effect.sync(() => onState(state))),
          ),
        ),
        controller.signal,
      ).catch((cause: unknown) => {
        if (!controller.signal.aborted) onError(String(cause));
      });
      return () => controller.abort();
    },
  };
}
