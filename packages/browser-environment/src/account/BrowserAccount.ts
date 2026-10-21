/**
 * The in-browser environment's Otter Account. The page signs in (Code's
 * Account OAuth) and attaches its access token; the worker exchanges it at
 * Accounts for the shared suite session, reaches Otter Cloud with an
 * audience-bound capability like any environment (ADR 0018), and keeps one
 * channel open for push and sync while signed in. To Otter Cloud this browser
 * profile is just another device: its audience is `browser:<installation>`.
 *
 * @module BrowserAccount
 */
import { type ChannelEvent, CloudError, OtterCloudClient } from "@otterware/otter-cloud-client";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FiberHandle from "effect/FiberHandle";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as PubSub from "effect/PubSub";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";

import { BrowserInstallation } from "../BrowserInstallation.ts";
import { BrowserPlatform } from "../BrowserPlatform.ts";
import {
  BrowserAccountError,
  type BrowserAccountCredential,
  type BrowserAccountState,
} from "./contracts.ts";

/** The signed-in account's Cloud client, bound to this browser's audience. */
export interface CloudAccount {
  readonly accountId: string;
  readonly audience: string;
  readonly client: OtterCloudClient;
}

export class BrowserAccount extends Context.Service<
  BrowserAccount,
  {
    readonly attach: (
      credential: BrowserAccountCredential,
    ) => Effect.Effect<BrowserAccountState, BrowserAccountError>;
    readonly detach: Effect.Effect<void>;
    readonly state: Effect.Effect<BrowserAccountState>;
    /** The current state, then every change. */
    readonly changes: Stream.Stream<BrowserAccountState>;
    /** The page's sign-in, for module engines that exchange it themselves. */
    readonly credential: Effect.Effect<Option.Option<BrowserAccountCredential>>;
    /** The current suite session token, for Otter services that take it as a bearer. */
    readonly sessionToken: Effect.Effect<Option.Option<string>>;
    /** The account's Cloud client; fails `signed-out` while none is attached. */
    readonly cloud: Effect.Effect<CloudAccount, BrowserAccountError>;
    /** Channel events (push, `sync.changed`, `connections.changed`) while signed in. */
    readonly events: Stream.Stream<ChannelEvent>;
  }
>()("@otterware/browser-environment/account/BrowserAccount") {}

const SuiteSession = Schema.Struct({
  token: Schema.String,
  expiresAt: Schema.Number,
  user: Schema.Struct({ id: Schema.String }),
});
const decodeSuiteSession = Schema.decodeUnknownEffect(SuiteSession);

const SIGNED_OUT: BrowserAccountState = { status: "signed-out", userId: null, message: null };

const signedOut = (message = "Sign in to your Otter Account.") =>
  new BrowserAccountError({ reason: "signed-out", message });
const unavailable = (message = "Could not reach your Otter Account. Try again.") =>
  new BrowserAccountError({ reason: "unavailable", message });

/** Maps a Cloud failure to what the page shows; credentials never reach the message. */
export const cloudFailure = (cause: unknown) =>
  cause instanceof CloudError && (cause.status === 401 || cause.status === 403)
    ? signedOut("Your Otter session has ended. Sign in again.")
    : unavailable();

/** The channel closed or could not open; the account reconnects it. */
class ChannelDropped extends Data.TaggedError("ChannelDropped") {}

/** Reconnects a dropped channel with backoff, capped at half a minute. */
const RECONNECT = Schedule.min([
  Schedule.exponential(Duration.seconds(1)),
  Schedule.spaced(Duration.seconds(30)),
]);

export const layer = Layer.effect(
  BrowserAccount,
  Effect.gen(function* () {
    const platform = yield* BrowserPlatform;
    const installation = yield* BrowserInstallation;
    const audience = `browser:${installation.id}`;
    const state = yield* SubscriptionRef.make<BrowserAccountState>(SIGNED_OUT);
    const events = yield* PubSub.unbounded<ChannelEvent>();
    const channel = yield* FiberHandle.make<void, never>();
    const lock = yield* Semaphore.make(1);
    let attached: {
      credential: BrowserAccountCredential;
      /** The suite session token the Cloud client sends; renewed in place. */
      session: { token: string };
      account: CloudAccount;
    } | null = null;

    const exchange = (credential: BrowserAccountCredential) =>
      Effect.gen(function* () {
        const response = yield* Effect.tryPromise({
          try: (signal) =>
            platform.fetch(`${credential.accountsUrl.replace(/\/$/, "")}/suite/session`, {
              method: "POST",
              headers: {
                authorization: `Bearer ${credential.accessToken}`,
                "content-type": "application/json",
              },
              body: "{}",
              credentials: "omit",
              cache: "no-store",
              signal,
            }),
          catch: () => unavailable(),
        });
        if (response.status === 401 || response.status === 403)
          return yield* signedOut("Your Otter session has ended. Sign in again.");
        if (!response.ok) return yield* unavailable();
        const body = yield* Effect.tryPromise({
          try: () => response.json() as Promise<unknown>,
          catch: () => unavailable(),
        });
        return yield* decodeSuiteSession(body).pipe(Effect.mapError(() => unavailable()));
      });

    /** One channel connection: resolves when it closes, fails when it cannot open. */
    const connectOnce = (account: CloudAccount) =>
      Effect.callback<void, ChannelDropped>((resume) => {
        let socket: WebSocket | null = null;
        account.client
          .openChannel((event) => Effect.runSync(PubSub.publish(events, event)))
          .then(
            (opened) => {
              socket = opened.socket;
              opened.socket.addEventListener("close", () => resume(Effect.void), { once: true });
            },
            () => resume(Effect.fail(new ChannelDropped())),
          );
        return Effect.sync(() => socket?.close(1000));
      });

    const runChannel = (account: CloudAccount) =>
      connectOnce(account).pipe(
        // A clean close and a failed open both reconnect; the cursor lives with each module.
        Effect.flatMap(() => Effect.fail(new ChannelDropped())),
        Effect.retry(RECONNECT),
        Effect.ignore,
      );

    const attach = (credential: BrowserAccountCredential) =>
      lock.withPermits(1)(
        attachUnlocked(credential).pipe(
          Effect.tapError((error) =>
            error.reason === "signed-out"
              ? detachUnlocked.pipe(
                  Effect.andThen(
                    SubscriptionRef.set(state, {
                      status: "failed",
                      userId: null,
                      message: error.message,
                    }),
                  ),
                )
              : // A blip while already connected keeps the working client.
                SubscriptionRef.update(state, (current): BrowserAccountState =>
                  current.status === "connected"
                    ? current
                    : { status: "failed", userId: null, message: error.message },
                ),
          ),
        ),
      );

    const attachUnlocked = (credential: BrowserAccountCredential) =>
      Effect.gen(function* () {
        const previous = attached;
        if (previous === null)
          yield* SubscriptionRef.set(state, { status: "connecting", userId: null, message: null });
        const session = yield* exchange(credential);
        const sameAccount =
          previous !== null &&
          previous.account.accountId === session.user.id &&
          previous.credential.cloudOrigin === credential.cloudOrigin;
        if (sameAccount) {
          // The client reads the session through this cell, so a renewed one applies at once.
          previous.session.token = session.token;
          attached = { credential, session: previous.session, account: previous.account };
        } else {
          previous?.account.client.clearSession();
          const current = { token: session.token };
          const client = yield* Effect.try({
            try: () =>
              new OtterCloudClient({
                origin: credential.cloudOrigin,
                audience,
                sessionToken: async () => current.token,
                fetch: platform.fetch,
                WebSocket: platform.WebSocket,
              }),
            catch: () => unavailable("This build's Otter Cloud address is invalid."),
          });
          const account: CloudAccount = { accountId: session.user.id, audience, client };
          attached = { credential, session: current, account };
          yield* FiberHandle.run(channel, runChannel(account));
        }
        const next: BrowserAccountState = {
          status: "connected",
          userId: session.user.id,
          message: null,
        };
        yield* SubscriptionRef.set(state, next);
        return next;
      });

    const detachUnlocked = Effect.gen(function* () {
      yield* FiberHandle.clear(channel);
      attached?.account.client.clearSession();
      attached = null;
      yield* SubscriptionRef.set(state, SIGNED_OUT);
    });

    yield* Effect.addFinalizer(() => Effect.sync(() => attached?.account.client.clearSession()));

    return BrowserAccount.of({
      attach,
      detach: lock.withPermits(1)(detachUnlocked),
      state: SubscriptionRef.get(state),
      changes: SubscriptionRef.changes(state),
      credential: Effect.sync(() => Option.fromNullishOr(attached?.credential)),
      sessionToken: Effect.sync(() => Option.fromNullishOr(attached?.session.token)),
      cloud: Effect.suspend(() =>
        attached === null ? Effect.fail(signedOut()) : Effect.succeed(attached.account),
      ),
      events: Stream.fromPubSub(events),
    });
  }),
);
