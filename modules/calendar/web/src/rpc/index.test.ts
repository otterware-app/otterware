import { WS_METHODS } from "@otterware/calendar-contracts";
import {
  AVAILABLE_CONNECTION_STATE,
  EnvironmentSupervisor,
  PrimaryConnectionTarget,
  type PreparedConnection,
} from "@t3tools/client-runtime/connection";
import { EnvironmentId } from "@t3tools/contracts";
import type { RpcSession, WsRpcProtocolClient } from "@t3tools/client-runtime/rpc";
import { expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { RpcClientError } from "effect/rpc";
import { calendarNotificationsStream } from "./index.ts";

const session = (feed: Stream.Stream<never, RpcClientError.RpcClientError>): RpcSession => {
  // This fixture exercises only Calendar's notification RPC, leaving the other host methods unused.
  const client = {
    [WS_METHODS.calendarSubscribeNotifications]: () => feed,
  } as unknown as WsRpcProtocolClient;
  return {
    client,
    initialConfig: Effect.never,
    subscribeServerConfig: () => Stream.never,
    ready: Effect.void,
    probe: Effect.void,
    closed: Effect.never,
    inboundFrames: Effect.succeed(0),
  };
};

it.effect(
  "starts after connecting, closes on disconnect and restores reminders after transport loss",
  () =>
    Effect.gen(function* () {
      const sessions = yield* SubscriptionRef.make<Option.Option<RpcSession>>(Option.none());
      const state = yield* SubscriptionRef.make(AVAILABLE_CONNECTION_STATE);
      const prepared = yield* SubscriptionRef.make<Option.Option<PreparedConnection>>(
        Option.none(),
      );
      const lifecycle = yield* Queue.unbounded<string>();
      const transportClosed = yield* Deferred.make<never, RpcClientError.RpcClientError>();
      const feed = (name: string, wait: Effect.Effect<never, RpcClientError.RpcClientError>) =>
        Stream.fromEffect(Queue.offer(lifecycle, `open:${name}`)).pipe(
          Stream.flatMap(() => Stream.fromEffect(wait)),
          Stream.ensuring(Queue.offer(lifecycle, `close:${name}`)),
        );
      const running = yield* calendarNotificationsStream.pipe(
        Stream.runDrain,
        Effect.provide(
          Layer.mock(EnvironmentSupervisor.EnvironmentSupervisor)({
            target: new PrimaryConnectionTarget({
              environmentId: EnvironmentId.make("calendar-test"),
              label: "Calendar test",
              httpBaseUrl: "https://environment.example.test",
              wsBaseUrl: "wss://environment.example.test",
            }),
            state,
            prepared,
            session: sessions,
          }),
        ),
        Effect.forkScoped,
      );

      yield* SubscriptionRef.set(sessions, Option.some(session(feed("one", Effect.never))));
      expect(yield* Queue.take(lifecycle)).toBe("open:one");
      yield* SubscriptionRef.set(sessions, Option.none());
      expect(yield* Queue.take(lifecycle)).toBe("close:one");

      yield* SubscriptionRef.set(
        sessions,
        Option.some(session(feed("two", Deferred.await(transportClosed)))),
      );
      expect(yield* Queue.take(lifecycle)).toBe("open:two");
      yield* Deferred.fail(
        transportClosed,
        new RpcClientError.RpcClientError({
          reason: new RpcClientError.RpcClientDefect({
            message: "socket closed",
            cause: new Error("socket closed"),
          }),
        }),
      );
      expect(yield* Queue.take(lifecycle)).toBe("close:two");

      yield* SubscriptionRef.set(sessions, Option.some(session(feed("three", Effect.never))));
      expect(yield* Queue.take(lifecycle)).toBe("open:three");
      yield* Fiber.interrupt(running);
      expect(yield* Queue.take(lifecycle)).toBe("close:three");
    }).pipe(Effect.scoped),
);
