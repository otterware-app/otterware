import { describe, expect, it } from "@effect/vitest";
import type { MailEvent } from "@otterware/mail-contracts/rpc";
import { Effect, Fiber, Option, Queue, Stream } from "effect";

import { followMailEvents } from "./events";

const firstEvents: MailEvent[] = [{ channel: "gmail:unread-count", params: 1 }];
const secondEvents: MailEvent[] = [
  { channel: "gmail:unread-count", params: 3 },
  { channel: "gmail:mail-changed" },
];

describe("followMailEvents", () => {
  it.effect("resyncs and resubscribes on the next session after a stream fails", () =>
    Effect.gen(function* () {
      const sessions =
        yield* Queue.unbounded<Option.Option<() => Stream.Stream<MailEvent, string>>>();
      const received = yield* Queue.unbounded<MailEvent>();
      const fiber = yield* followMailEvents(Stream.fromQueue(sessions)).pipe(
        Stream.runForEach((event) => Queue.offer(received, event)),
        Effect.forkChild,
      );
      const take = (n: number) => Effect.replicateEffect(Queue.take(received), n);

      yield* Queue.offer(
        sessions,
        Option.some(() =>
          Stream.concat(Stream.fromIterable(firstEvents), Stream.fail("transport lost")),
        ),
      );
      expect((yield* take(3)).map((event) => event.channel)).toEqual([
        "gmail:accounts-changed",
        "gmail:mail-changed",
        "gmail:unread-count",
      ]);

      yield* Queue.offer(
        sessions,
        Option.some(() => Stream.fromIterable(secondEvents)),
      );
      expect(yield* take(4)).toEqual([
        { channel: "gmail:accounts-changed" },
        { channel: "gmail:mail-changed" },
        { channel: "gmail:unread-count", params: 3 },
        { channel: "gmail:mail-changed" },
      ]);
      yield* Fiber.interrupt(fiber);
    }),
  );
});
