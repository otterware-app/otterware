/**
 * Home's account data sync (ADR 0019): cross-app projects and saved views
 * stay local-first and reach Otter Cloud's `home.projects` collection while
 * the host's Otter Account is signed in. Local edits wait in an outbox and
 * push soon after they happen; remote ones arrive by pull, when the host
 * signals a change and once a minute. The newest write of a record wins,
 * on every device the same way, and deletions travel as tombstones.
 */
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";

import { HomeAccount } from "./HomeAccount.ts";
import { HOME_SYNC_COLLECTION, HomeStore } from "./HomeStore.ts";

const PUSH_BATCH = 100;

export class HomeSync extends Context.Service<
  HomeSync,
  {
    /** One full exchange with Otter Cloud; nothing while signed out. Never fails. */
    readonly sync: Effect.Effect<void>;
  }
>()("@otterware/home-engine/HomeSync") {}

export const layer = Layer.effect(
  HomeSync,
  Effect.gen(function* () {
    const store = yield* HomeStore;
    const account = yield* Effect.serviceOption(HomeAccount);
    const lock = yield* Semaphore.make(1);

    const exchange = Effect.gen(function* () {
      if (Option.isNone(account)) return;
      const current = yield* account.value.current;
      if (Option.isNone(current)) return;
      const { accountId, push, pull } = current.value;
      const saved = yield* store.cursor(accountId);
      if (saved === null) {
        // This device meets the account for the first time: offer it everything here.
        yield* store.adoptAll;
      }
      let cursor = saved ?? 0;
      for (;;) {
        const batch = yield* store.outgoing(PUSH_BATCH);
        if (batch.length === 0) break;
        const pushed = yield* Effect.tryPromise(() =>
          push(
            batch.map((change) => ({
              collection: HOME_SYNC_COLLECTION,
              id: change.id,
              value: change.value,
              modifiedAt: change.modifiedAt,
              mutationId: change.mutationId,
            })),
          ),
        );
        yield* store.acknowledge(batch);
        // Cloud answers with the record it keeps, which is another device's when that one is newer.
        yield* store.applyIncoming(pushed.records);
        if (batch.length < PUSH_BATCH) break;
      }
      for (;;) {
        const page = yield* Effect.tryPromise(() => pull(cursor));
        yield* store.applyIncoming(
          page.records.filter((record) => record.collection === HOME_SYNC_COLLECTION),
        );
        cursor = page.cursor;
        yield* store.saveCursor(accountId, cursor);
        if (!page.hasMore) break;
      }
    });

    const sync = lock.withPermits(1)(
      exchange.pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("Home could not sync with Otter Cloud", { cause }),
        ),
      ),
    );

    if (Option.isSome(account)) {
      yield* Stream.mergeAll(
        [
          Stream.succeed(undefined),
          store.writes.pipe(Stream.debounce(Duration.seconds(1))),
          account.value.changes,
          Stream.fromSchedule(Schedule.spaced(Duration.minutes(1))).pipe(Stream.as(undefined)),
        ],
        { concurrency: "unbounded" },
      ).pipe(
        Stream.runForEach(() => sync),
        Effect.forkScoped,
      );
    }
    return HomeSync.of({ sync });
  }),
);
