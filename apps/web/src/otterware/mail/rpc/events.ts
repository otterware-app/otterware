import { AtomRegistry } from "effect/reactivity";
import { EnvironmentRegistry, EnvironmentSupervisor } from "@t3tools/client-runtime/connection";
import type { EnvironmentId } from "@t3tools/contracts";
import type { MailEvent } from "@otterware/mail-contracts/rpc";
import { Cause, Effect, Option, Stream, SubscriptionRef } from "effect";
import { connectionAtomRuntime } from "../../../connection/runtime";
import { appAtomRegistry } from "../../../rpc/atomRegistry";

// Events missed while unsubscribed (startup, a dropped connection) are re-read
// through the handlers these trigger.
const resyncEvents = (): MailEvent[] => [
  { channel: "gmail:accounts-changed" },
  { channel: "gmail:mail-changed" },
];

/** Each session's events after a resync; a stream that ends waits for the next session. */
export function followMailEvents<E>(
  sessions: Stream.Stream<Option.Option<() => Stream.Stream<MailEvent, E>>>,
): Stream.Stream<MailEvent> {
  return sessions.pipe(
    Stream.switchMap((events) =>
      Option.isSome(events)
        ? Stream.concat(
            Stream.suspend(() => Stream.fromIterable(resyncEvents())),
            events.value().pipe(
              Stream.catchCause((cause) =>
                Stream.fromEffect(
                  Effect.logWarning("Mail events stream ended; waiting for the next session.", {
                    cause: Cause.pretty(cause),
                  }),
                ).pipe(Stream.drain),
              ),
            ),
          )
        : Stream.empty,
    ),
  );
}

const mailEvents = Stream.unwrap(
  Effect.map(EnvironmentSupervisor.EnvironmentSupervisor, (supervisor) =>
    followMailEvents(
      SubscriptionRef.changes(supervisor.session).pipe(
        Stream.map(
          Option.map(
            (session) => () =>
              // oxlint-disable-next-line t3code/no-rpc-permission-bypass -- Named read-only module stream boundary; the host helper only accepts upstream stream tags. All writes use permission-aware commands.
              session.client["mail.events"]({}),
          ),
        ),
      ),
    ),
  ),
);

// Run directly, not through an atom: an atom keeps only the last event of a
// burst (an unread count followed by a change).
export function subscribeMailEvents(
  environmentId: EnvironmentId,
  publish: (channel: string, payload: unknown) => void,
) {
  const controller = new AbortController();
  const task = Effect.scoped(
    Effect.gen(function* () {
      yield* AtomRegistry.mount(appAtomRegistry, connectionAtomRuntime);
      const context = yield* AtomRegistry.getResult(appAtomRegistry, connectionAtomRuntime);
      const registry = yield* EnvironmentRegistry.EnvironmentRegistry.pipe(Effect.provide(context));
      yield* registry.followStream(environmentId, mailEvents).pipe(
        Stream.runForEach((event) => Effect.sync(() => publish(event.channel, event.params))),
        Effect.provide(context),
      );
    }),
  );
  void Effect.runPromise(task, { signal: controller.signal }).catch(() => {});
  return () => controller.abort();
}
