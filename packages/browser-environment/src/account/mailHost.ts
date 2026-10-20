/**
 * What module engines need from this browser's Otter Account: Mail's
 * browser worker (#27's session port) and Home's account data sync: the account's Cloud client and channel. Mail reads it when
 * it starts, so a sign-in, sign-out or account switch restarts a Mail module
 * that is on.
 */
import {
  HomeAccount,
  type MailBrowserAccount,
  MailBrowserHost,
} from "@otterware/composition/browser";
import { ModuleRuntime } from "@otterware/module-kit/runtime";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

import { BrowserAccount } from "./BrowserAccount.ts";
import { BrowserGoogle } from "./BrowserGoogle.ts";

export const layerMailHost = Layer.effect(
  MailBrowserHost,
  Effect.gen(function* () {
    const account = yield* BrowserAccount;
    const google = yield* BrowserGoogle;
    const read = Effect.gen(function* () {
      const cloud = yield* Effect.option(account.cloud);
      const credential = yield* account.credential;
      if (Option.isNone(cloud) || Option.isNone(credential)) return Option.none();
      const client = cloud.value.client;
      const mail: MailBrowserAccount = {
        accountId: cloud.value.accountId,
        cloudOrigin: credential.value.cloudOrigin,
        // Account data through Cloud; Google from this browser's own grants.
        client: {
          connections: async () => [...(await google.connections())],
          providerToken: google.providerToken,
          push: (records) => client.push(records),
          pull: (cursor) => client.pull(cursor),
          request: (...args) => client.request(...args),
        },
        subscribe: (listener) => {
          const fiber = Effect.runFork(
            Stream.runForEach(account.events, (event) => Effect.sync(() => listener(event))),
          );
          const stop = google.subscribe(() => listener({ type: "connections.changed" }));
          return () => {
            stop();
            void Effect.runFork(Fiber.interrupt(fiber));
          };
        },
      };
      return Option.some(mail);
    });
    return MailBrowserHost.of({ account: read });
  }),
);

/** Restarts Mail, if it is on, whenever the signed-in account changes. */
export const layerMailFollowsAccount = Layer.effectDiscard(
  Effect.gen(function* () {
    const account = yield* BrowserAccount;
    const runtime = yield* ModuleRuntime.ModuleRuntime;
    if (!runtime.modules.some((module) => module.contract.id === "mail")) return;
    yield* account.changes.pipe(
      Stream.map((state) => (state.status === "connected" ? state.userId : null)),
      Stream.changes,
      Stream.drop(1),
      Stream.runForEach(() =>
        runtime.isOnSync("mail")
          ? runtime
              .setEnabled("mail", false)
              .pipe(Effect.andThen(runtime.setEnabled("mail", true)), Effect.ignore)
          : Effect.void,
      ),
      Effect.forkScoped,
    );
  }),
);

/** Home's account data sync (ADR 0019): push and pull through this browser's Cloud client. */
export const layerHomeAccount = Layer.effect(
  HomeAccount,
  Effect.gen(function* () {
    const account = yield* BrowserAccount;
    return HomeAccount.of({
      current: Effect.map(Effect.option(account.cloud), (cloud) =>
        Option.map(cloud, ({ accountId, client }) => ({
          accountId,
          push: (records) => client.push(records),
          pull: (cursor) => client.pull(cursor),
        })),
      ),
      changes: Stream.merge(
        account.changes.pipe(
          Stream.map((state) => (state.status === "connected" ? state.userId : null)),
          Stream.changes,
          Stream.drop(1),
        ),
        account.events.pipe(Stream.filter((event) => event.type === "sync.changed")),
      ).pipe(Stream.as(undefined)),
    });
  }),
);
