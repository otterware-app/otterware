import { DRIVE_METHODS } from "@otterware/drive-contracts";
import { EnvironmentRegistry, EnvironmentSupervisor } from "@t3tools/client-runtime/connection";
import { createEnvironmentSubscriptionAtomFamily } from "@t3tools/client-runtime/state/runtime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import type { Atom } from "effect/reactivity";

/**
 * Every thread's Drive links on an environment, re-sent whole when one
 * changes (`drive.subscribeThreadLinks`). A local bridge, like Calendar's,
 * until module-kit supplies permission-aware module streams.
 */
export function createDriveThreadLinkAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry.EnvironmentRegistry | R, E>,
) {
  return createEnvironmentSubscriptionAtomFamily(runtime, {
    label: "environment-data:drive:thread-links",
    idleTtlMs: 60_000,
    subscribe: () =>
      Stream.unwrap(
        Effect.gen(function* () {
          const supervisor = yield* EnvironmentSupervisor.EnvironmentSupervisor;
          return SubscriptionRef.changes(supervisor.session).pipe(
            Stream.switchMap((session) =>
              Option.isNone(session)
                ? Stream.empty
                : session.value.client[DRIVE_METHODS.subscribeThreadLinks]({}),
            ),
          );
        }),
      ),
  });
}
