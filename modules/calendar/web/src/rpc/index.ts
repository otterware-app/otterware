import {
  CalendarError,
  CalendarContract,
  WS_METHODS as CALENDAR_METHODS,
} from "@otterware/calendar-contracts";
import { EnvironmentRegistry, EnvironmentSupervisor } from "@t3tools/client-runtime/connection";
import {
  createEnvironmentRpcCommand,
  createEnvironmentSubscriptionAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import { createEnvironmentSessionAtoms } from "@t3tools/client-runtime/state/session";
import type { EnvironmentRpcInput, EnvironmentUnaryRpcTag } from "@t3tools/client-runtime/rpc";
import {
  EnvironmentAuthorizationError,
  authScopeRequiredResponse,
  sessionGrantsScope,
  type EnvironmentId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity";
import { applyCalendarWeekEvent, EMPTY_CALENDAR_INSTANCES } from "../runtime/week.ts";

type CalendarMutationTag = Exclude<
  keyof typeof CalendarContract.scopes,
  | "calendar.subscribeDirectory"
  | "calendar.subscribeNotifications"
  | "calendar.subscribeWeek"
  | "calendar.google.connect"
  | "calendar.getEvent"
  | "calendar.search"
>;

/** Local bridge until module-kit supplies permission-aware module streams and commands. */
export function createCalendarAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry.EnvironmentRegistry | R, E>,
) {
  const sessions = createEnvironmentSessionAtoms(runtime);
  const permission = Atom.family((id: EnvironmentId | null) =>
    Atom.make((get) => {
      if (id === null) return false;
      const value = get(sessions.sessionStateAtom(id));
      const session = Option.getOrNull(AsyncResult.value(value));
      return (
        value._tag !== "Failure" &&
        session !== null &&
        sessionGrantsScope(session, "orchestration:operate")
      );
    }),
  );
  const mutation = <T extends CalendarMutationTag & EnvironmentUnaryRpcTag>(tag: T) => {
    const command = createEnvironmentRpcCommand(runtime, { label: tag, tag });
    return {
      ...command,
      permissionAtom: permission,
      requiredScopes: () => [CalendarContract.scopes[tag]],
      run: async (
        registry: AtomRegistry.AtomRegistry,
        target: { environmentId: EnvironmentId; input: EnvironmentRpcInput<T> },
      ) => {
        const granted = await Effect.runPromise(
          Effect.scoped(
            Effect.gen(function* () {
              const atom = sessions.sessionStateAtom(target.environmentId);
              yield* AtomRegistry.mount(registry, atom);
              const session = yield* AtomRegistry.getResult(registry, atom, {
                suspendOnWaiting: false,
              }).pipe(
                Effect.timeoutOption(6_000),
                Effect.catch(() => Effect.succeed(Option.none())),
              );
              return (
                Option.isSome(session) &&
                sessionGrantsScope(session.value, CalendarContract.scopes[tag])
              );
            }),
          ),
        );
        if (!granted)
          return AsyncResult.failure(
            Cause.fail(
              new EnvironmentAuthorizationError({
                ...authScopeRequiredResponse(CalendarContract.scopes[tag]),
                message: "This connection cannot change Calendar data.",
              }),
            ),
          );
        return command.run(registry, target);
      },
    };
  };
  const directory = createEnvironmentSubscriptionAtomFamily(runtime, {
    label: "calendar.directory",
    idleTtlMs: 0,
    subscribe: () =>
      Stream.unwrap(
        Effect.gen(function* () {
          const supervisor = yield* EnvironmentSupervisor.EnvironmentSupervisor;
          return SubscriptionRef.changes(supervisor.session).pipe(
            Stream.switchMap((session) =>
              Option.isNone(session)
                ? Stream.empty
                : session.value.client[CALENDAR_METHODS.calendarSubscribeDirectory]({}),
            ),
          );
        }),
      ),
  });
  const week = createEnvironmentSubscriptionAtomFamily(runtime, {
    label: "calendar.week",
    idleTtlMs: 0,
    subscribe: (input: { week: string }) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const supervisor = yield* EnvironmentSupervisor.EnvironmentSupervisor;
          return SubscriptionRef.changes(supervisor.session).pipe(
            Stream.switchMap((session) =>
              Option.isNone(session)
                ? Stream.empty
                : session.value.client[CALENDAR_METHODS.calendarSubscribeWeek](input).pipe(
                    Stream.scan(() => EMPTY_CALENDAR_INSTANCES, applyCalendarWeekEvent),
                  ),
            ),
          );
        }),
      ),
  });
  return {
    directory,
    week,
    permission,
    commands: {
      create: mutation(CALENDAR_METHODS.calendarCreateEvent),
      update: mutation(CALENDAR_METHODS.calendarUpdateEvent),
      delete: mutation(CALENDAR_METHODS.calendarDeleteEvent),
      respond: mutation(CALENDAR_METHODS.calendarRespond),
      undo: mutation(CALENDAR_METHODS.calendarApplyChanges),
      environmentPreferences: mutation(CALENDAR_METHODS.calendarUpdateEnvironmentPreferences),
      preferences: mutation(CALENDAR_METHODS.calendarUpdatePreferences),
      calendar: mutation(CALENDAR_METHODS.calendarUpdateCalendar),
      sync: mutation(CALENDAR_METHODS.calendarSync),
      addDemo: mutation(CALENDAR_METHODS.calendarAddDemo),
      removeAccount: mutation(CALENDAR_METHODS.calendarRemoveAccount),
      setClient: mutation(CALENDAR_METHODS.calendarGoogleSetClient),
      clearClient: mutation(CALENDAR_METHODS.calendarGoogleClearClient),
      completeConnect: mutation(CALENDAR_METHODS.calendarGoogleConnectComplete),
    },
  };
}

/** The caller mounts the current session grant before starting an OAuth command. */
export const calendarConnectStream = (
  input: import("@otterware/calendar-contracts").GoogleConnectInput,
) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const supervisor = yield* EnvironmentSupervisor.EnvironmentSupervisor;
      const current = yield* SubscriptionRef.get(supervisor.session);
      return Option.isNone(current)
        ? Stream.fail(
            new CalendarError({ code: "unavailable", detail: "The environment is disconnected." }),
          )
        : current.value.client[CALENDAR_METHODS.calendarGoogleConnect](input);
    }),
  );

export const calendarNotificationsStream = Stream.unwrap(
  Effect.gen(function* () {
    const supervisor = yield* EnvironmentSupervisor.EnvironmentSupervisor;
    const session = yield* SubscriptionRef.get(supervisor.session);
    return Option.isNone(session)
      ? Stream.empty
      : session.value.client[CALENDAR_METHODS.calendarSubscribeNotifications]({});
  }),
);
