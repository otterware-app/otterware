/**
 * Home's account data sync on an environment (ADR 0019): the environment's
 * Otter Account, the same one every module uses. Without a login Home stays
 * local. Sign-in, sign-out and `sync.changed` from other devices wake Home's sync.
 */
import { HomeAccount } from "@otterware/composition/server";
import { OtterAccountSession } from "@otterware/module-kit/account";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";

export const layer = Layer.effect(
  HomeAccount,
  Effect.gen(function* () {
    const session = yield* OtterAccountSession;
    const current = Effect.sync(() =>
      Option.map(Option.fromNullishOr(session.current()), (account) => ({
        accountId: account.accountId,
        push: (records: Parameters<typeof account.push>[0]) => account.push(records),
        pull: (cursor: number) => account.pull(cursor),
      })),
    );
    const changes = Stream.callback<void>(
      (queue) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            let unsubscribeEvents: (() => void) | undefined;
            let accountId: string | undefined;
            const follow = () => {
              const account = session.current();
              if (account?.accountId === accountId) return;
              unsubscribeEvents?.();
              accountId = account?.accountId;
              unsubscribeEvents = account?.subscribe((event) => {
                if (event.type === "sync.changed") Queue.offerUnsafe(queue, undefined);
              });
              Queue.offerUnsafe(queue, undefined);
            };
            const unsubscribe = session.subscribe(follow);
            follow();
            return () => {
              unsubscribe();
              unsubscribeEvents?.();
            };
          }),
          (cleanup) => Effect.sync(cleanup),
        ),
      { strategy: "sliding", bufferSize: 1 },
    );
    return HomeAccount.of({ current, changes });
  }),
);
