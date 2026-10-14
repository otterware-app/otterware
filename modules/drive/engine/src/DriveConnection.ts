import {
  DRIVE_CLOUD_ORIGIN,
  DriveError,
  type DriveConnectionStatus,
} from "@otterware/drive-contracts";
import type { OtterAccountSession } from "@t3tools/contracts/accounts";
import * as Clock from "effect/Clock";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as SubscriptionRef from "effect/SubscriptionRef";
import type { DriveApi, DriveApiError } from "./DriveApi.ts";

export const DriveBaseUrlConfig = Config.String("OTTERWARE_DRIVE_URL").pipe(
  Config.withDefault(DRIVE_CLOUD_ORIGIN),
);
/** W2 supplies a refreshed OtterAccountSession; no refresh token crosses a Drive RPC. */
export class DriveAccountSession extends Context.Service<
  DriveAccountSession,
  {
    readonly current: Effect.Effect<OtterAccountSession | null, DriveError>;
  }
>()("@otterware/drive-engine/DriveConnection/DriveAccountSession") {}

export function driveErrorOf(error: DriveApiError): DriveError {
  const reason =
    error.status === 401
      ? "not_connected"
      : error.status === 403
        ? "forbidden"
        : error.status === 404
          ? "not_found"
          : error.status === 409
            ? "conflict"
            : "unavailable";
  return new DriveError({ reason, detail: error.detail });
}

/** Accounts exchanges the OAuth grant for a session, then Cloud issues an audience-bound capability. */
export const makeDriveConnection = (api: DriveApi, baseUrl: string) =>
  Effect.gen(function* () {
    const account = yield* DriveAccountSession;
    const state = yield* SubscriptionRef.make<DriveConnectionStatus>({
      status: "disconnected",
      baseUrl,
    });
    let exchanged: {
      accessToken: string;
      at: number;
      token: string;
      account: { userId: string | null; name: string } | null;
    } | null = null;
    let fallbackAccessToken: string | null = null;
    const session = Effect.gen(function* () {
      const current = yield* account.current;
      const accessToken = current?.accessToken ?? fallbackAccessToken;
      if (!accessToken) {
        exchanged = null;
        yield* SubscriptionRef.set(state, { status: "disconnected", baseUrl });
        return null;
      }
      const now = yield* Clock.currentTimeMillis;
      if (exchanged?.accessToken === accessToken && now - exchanged.at < 14 * 60_000)
        return exchanged;
      const token = yield* api.suiteSession(accessToken).pipe(Effect.mapError(driveErrorOf));
      const me = yield* api.me({ token }).pipe(Effect.mapError(driveErrorOf));
      const name = { userId: me.userId ?? null, name: me.actor.name };
      exchanged = { accessToken, token, account: name, at: now };
      yield* SubscriptionRef.set(state, { status: "connected", baseUrl, account: name });
      return exchanged;
    });
    const requireSession = session.pipe(
      Effect.flatMap((value) =>
        value
          ? Effect.succeed(value)
          : Effect.fail(
              new DriveError({
                reason: "not_connected",
                detail: "Sign in to your Otter Account to use Drive.",
              }),
            ),
      ),
    );
    const refreshAccount = session.pipe(Effect.asVoid);
    const disconnect = Effect.gen(function* () {
      fallbackAccessToken = null;
      exchanged = null;
      yield* SubscriptionRef.set(state, { status: "disconnected", baseUrl });
      return yield* SubscriptionRef.get(state);
    });
    return {
      session,
      requireSession,
      status: refreshAccount.pipe(Effect.ignore, Effect.andThen(SubscriptionRef.get(state))),
      statusChanges: SubscriptionRef.changes(state),
      connect: requireSession.pipe(Effect.andThen(SubscriptionRef.get(state))),
      disconnect,
      syncAccount: (token: string | null) =>
        Effect.gen(function* () {
          fallbackAccessToken = token;
          exchanged = null;
          if (token === null) return yield* disconnect;
          yield* requireSession;
          return yield* SubscriptionRef.get(state);
        }),
      refreshAccount,
      markRejected: Effect.gen(function* () {
        exchanged = null;
        yield* SubscriptionRef.set(state, {
          status: "error",
          baseUrl,
          message: "Drive session ended. Sign in again.",
        });
      }),
    };
  });
export type DriveConnection = Effect.Success<ReturnType<typeof makeDriveConnection>>;
