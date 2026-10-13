import {
  CalendarError,
  CalendarAccountId,
  CalendarId,
  CALENDAR_METHODS,
  type CalendarDirectory,
  type CalendarEventInstance,
} from "@otterware/composition/contracts";
import {
  calendarConnectStream,
  calendarNotificationsStream,
  createCalendarAtoms,
 } from "@otterware/composition/web/calendar/rpc";
import { CalendarClientProvider, type CalendarWebClient } from "@otterware/composition/web/calendar/host";
import { CalendarNotifications } from "@otterware/composition/web/calendar/notifications";
import { useAtomValue } from "@effect/atom-react";
import { EnvironmentRegistry, EnvironmentSupervisor } from "@t3tools/client-runtime/connection";
import { request } from "@t3tools/client-runtime/rpc";
import { sessionGrantsScope, type EnvironmentId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity";
import { useMemo, type ReactNode } from "react";
import { connectionAtomRuntime } from "../../connection/runtime";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { createEnvironmentSessionAtoms } from "@t3tools/client-runtime/state/session";

const atoms = createCalendarAtoms(connectionAtomRuntime);
const emptyDirectory = Atom.make(AsyncResult.initial<CalendarDirectory, never>());
const emptyPermission = Atom.make(false);
const sessionAtoms = createEnvironmentSessionAtoms(connectionAtomRuntime);
const failure = (cause: Cause.Cause<unknown>) => new Error(Cause.pretty(cause));

const chunks = Atom.family((key: string) =>
  Atom.make((get) => {
    const { environmentId, weeks } = JSON.parse(key) as {
      environmentId: EnvironmentId;
      weeks: string[];
    };
    let loading = false;
    let error: string | null = null;
    const unique = new Map<string, CalendarEventInstance>();
    for (const week of weeks) {
      const result = get(atoms.week({ environmentId, input: { week } }));
      if (result._tag === "Initial") loading = true;
      else if (result._tag === "Failure") error = Cause.pretty(result.cause);
      const map = Option.getOrNull(AsyncResult.value(result));
      if (map) for (const [id, value] of map) unique.set(id, value);
    }
    return { instances: [...unique.values()], loading, error };
  }),
);
const emptyChunks = Atom.make({
  instances: [] as CalendarEventInstance[],
  loading: false,
  error: null as string | null,
});

function makeClient(environmentId: EnvironmentId | null): CalendarWebClient {
  const requireEnvironment = () => {
    if (!environmentId) throw new Error("Connect an environment to use Calendar.");
    return environmentId;
  };
  const command = <Input, A>(
    action: {
      run: (
        registry: AtomRegistry.AtomRegistry,
        target: { environmentId: EnvironmentId; input: Input },
      ) => Promise<
        | { readonly _tag: "Success"; readonly value: A }
        | { readonly _tag: "Failure"; readonly cause: Cause.Cause<unknown> }
      >;
    },
    input: Input,
  ) =>
    action.run(appAtomRegistry, { environmentId: requireEnvironment(), input }).then((result) => {
      if (result._tag === "Failure") throw failure(result.cause);
      return result.value;
    });
  const read = <A, E>(effect: Effect.Effect<A, E, EnvironmentSupervisor.EnvironmentSupervisor>) =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* AtomRegistry.mount(appAtomRegistry, connectionAtomRuntime);
          const context = yield* AtomRegistry.getResult(appAtomRegistry, connectionAtomRuntime);
          const registry = yield* EnvironmentRegistry.EnvironmentRegistry.pipe(
            Effect.provide(context),
          );
          return yield* registry.run(requireEnvironment(), effect).pipe(Effect.provide(context));
        }),
      ),
    );
  return {
    environmentId,
    watchNotifications: (onNotification, onError) => {
      if (!environmentId) return () => {};
      const controller = new AbortController();
      const task = Effect.scoped(
        Effect.gen(function* () {
          yield* AtomRegistry.mount(appAtomRegistry, connectionAtomRuntime);
          const context = yield* AtomRegistry.getResult(appAtomRegistry, connectionAtomRuntime);
          const registry = yield* EnvironmentRegistry.EnvironmentRegistry.pipe(
            Effect.provide(context),
          );
          yield* registry.runStream(environmentId, calendarNotificationsStream).pipe(
            Stream.runForEach((notification) => Effect.sync(() => onNotification(notification))),
            Effect.provide(context),
          );
        }),
      );
      void Effect.runPromise(task, { signal: controller.signal }).catch((cause) => {
        if (!controller.signal.aborted) onError(String(cause));
      });
      return () => controller.abort();
    },
    useDirectory: () => {
      const result = useAtomValue(
        environmentId ? atoms.directory({ environmentId, input: {} }) : emptyDirectory,
      );
      const canWrite = useAtomValue(
        environmentId ? atoms.permission(environmentId) : emptyPermission,
      );
      return {
        directory: Option.getOrNull(AsyncResult.value(result)),
        canWrite,
        error:
          result._tag === "Failure"
            ? Cause.pretty(result.cause)
            : environmentId === null
              ? "Connect an environment to see your calendars."
              : null,
      };
    },
    useWeeks: (weeks) => {
      const key = JSON.stringify({ environmentId, weeks });
      return useAtomValue(environmentId ? chunks(key) : emptyChunks);
    },
    search: (input) => read(request(CALENDAR_METHODS.calendarSearch, input)),
    getEvent: (calendarId, eventId) =>
      read(
        request(CALENDAR_METHODS.calendarGetEvent, {
          calendarId: CalendarId.make(calendarId),
          eventId,
        }),
      ),
    create: (input) => command(atoms.commands.create, input),
    update: (input) => command(atoms.commands.update, input),
    delete: (input) => command(atoms.commands.delete, input),
    undo: (input) => command(atoms.commands.undo, input),
    respond: (input) => command(atoms.commands.respond, input),
    environmentPreferences: (input) => command(atoms.commands.environmentPreferences, input),
    preferences: (input) => command(atoms.commands.preferences, input),
    calendar: (input) => command(atoms.commands.calendar, input),
    sync: () => command(atoms.commands.sync, {}),
    addDemo: () => command(atoms.commands.addDemo, { size: "standard" }),
    removeAccount: (accountId) =>
      command(atoms.commands.removeAccount, { accountId: CalendarAccountId.make(accountId) }),
    setClient: (input) => command(atoms.commands.setClient, input),
    clearClient: () => command(atoms.commands.clearClient, {}),
    completeConnect: (flowId, callbackUrl) =>
      command(atoms.commands.completeConnect, { flowId, callbackUrl }),
    connect: (input, onState, onError) => {
      const controller = new AbortController();
      const task = Effect.scoped(
        Effect.gen(function* () {
          const env = requireEnvironment();
          const atom = sessionAtoms.sessionStateAtom(env);
          yield* AtomRegistry.mount(appAtomRegistry, atom);
          const session = yield* AtomRegistry.getResult(appAtomRegistry, atom);
          if (!sessionGrantsScope(session, "orchestration:operate"))
            throw new CalendarError({
              code: "unavailable",
              detail: "This connection cannot connect Google accounts.",
            });
          yield* AtomRegistry.mount(appAtomRegistry, connectionAtomRuntime);
          const context = yield* AtomRegistry.getResult(appAtomRegistry, connectionAtomRuntime);
          const registry = yield* EnvironmentRegistry.EnvironmentRegistry.pipe(
            Effect.provide(context),
          );
          yield* registry.runStream(env, calendarConnectStream(input)).pipe(
            Stream.runForEach((state) => Effect.sync(() => onState(state))),
            Effect.provide(context),
          );
        }),
      );
      void Effect.runPromise(task, { signal: controller.signal }).catch((cause) => {
        if (!controller.signal.aborted) onError(String(cause));
      });
      return () => controller.abort();
    },
  };
}

export function CalendarEnvironmentProvider({ children }: { children: ReactNode }) {
  const environmentId = usePrimaryEnvironmentId();
  const client = useMemo(() => makeClient(environmentId), [environmentId]);
  return (
    <CalendarClientProvider client={client} key={environmentId ?? "disconnected"}>
      <CalendarNotifications>{children}</CalendarNotifications>
    </CalendarClientProvider>
  );
}
