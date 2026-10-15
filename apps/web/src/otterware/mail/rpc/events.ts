import { EnvironmentSupervisor } from "@t3tools/client-runtime/connection";
import { createEnvironmentSubscriptionAtomFamily } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import { Effect, Option, Stream, SubscriptionRef } from "effect";
import { connectionAtomRuntime } from "../../../connection/runtime";
import { appAtomRegistry } from "../../../rpc/atomRegistry";

// The current client helper's tag union lists only upstream streams. Keep this
// module stream adapter here until the kit supplies a generic module helper.
const events = createEnvironmentSubscriptionAtomFamily(connectionAtomRuntime, {
  label: "mail:events",
  idleTtlMs: 0,
  subscribe: (_input: Record<string, never>) =>
    Stream.unwrap(
      Effect.map(EnvironmentSupervisor.EnvironmentSupervisor, (supervisor) =>
        SubscriptionRef.changes(supervisor.session).pipe(
          Stream.switchMap((session) =>
            // oxlint-disable-next-line t3code/no-rpc-permission-bypass -- Named read-only module stream boundary; the host helper only accepts upstream stream tags. All writes use permission-aware commands.
            Option.isSome(session) ? session.value.client["mail.events"]({}) : Stream.empty,
          ),
        ),
      ),
    ),
});
export function subscribeMailEvents(
  environmentId: EnvironmentId,
  publish: (channel: string, payload: unknown) => void,
) {
  const atom = events({ environmentId, input: {} });
  return appAtomRegistry.subscribe(atom, (event) => {
    if (event._tag === "Success") publish(event.value.channel, event.value.params);
  });
}
