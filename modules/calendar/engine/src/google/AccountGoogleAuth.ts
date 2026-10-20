import { CalendarError } from "@otterware/calendar-contracts";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as HttpClient from "effect/http/HttpClient";
import { CalendarAccountSession, cloudCall } from "../CalendarAccountSession.ts";
import { GoogleAuth, type GoogleAuthShape } from "./GoogleAuth.ts";
import { makeGoogleCalendarClient } from "./GoogleCalendarClient.ts";
import { CalendarProviderError } from "../providers/CalendarProvider.ts";

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];
const PREFIX = "cloud:";
const required = (scopes: readonly string[]) =>
  scopes.includes("https://www.googleapis.com/auth/calendar") ||
  GOOGLE_CALENDAR_SCOPES.every((scope) => scopes.includes(scope));

/** Account connections and local PKCE share the provider interface and never share refresh tokens. */
export const layer = Layer.effect(
  GoogleAuth,
  Effect.gen(function* () {
    const local = yield* GoogleAuth;
    const account = yield* CalendarAccountSession;
    const http = yield* HttpClient.HttpClient;
    const lock = yield* Semaphore.make(1);
    const tokens = new Map<string, { accessToken: string; expiresAt: number }>();
    const accounts = Effect.gen(function* () {
      const context = yield* account.current;
      if (Option.isNone(context)) return [];
      return (yield* cloudCall(() => context.value.providers.connections()))
        .filter((connection) => connection.provider === "google" && required(connection.scopes))
        .map((connection) => ({ sub: `${PREFIX}${connection.id}`, email: connection.email }));
    });
    const token = (id: string, rejected?: string) =>
      lock.withPermits(1)(
        Effect.gen(function* () {
          const context = yield* account.current.pipe(
            Effect.mapError(
              () =>
                new CalendarProviderError({
                  reason: "signed_out",
                  detail: "Sign in to your Otter Account on this environment.",
                }),
            ),
          );
          if (Option.isNone(context))
            return yield* new CalendarProviderError({
              reason: "signed_out",
              detail: "This environment is signed out of its Otter Account.",
            });
          const key = `${context.value.accountId}/${id}`;
          const now = yield* Clock.currentTimeMillis;
          const cached = tokens.get(key);
          if (cached && cached.expiresAt > now + 60_000 && cached.accessToken !== rejected)
            return cached.accessToken;
          const result = yield* cloudCall(() => context.value.providers.providerToken(id)).pipe(
            Effect.mapError(
              (error) =>
                new CalendarProviderError({
                  reason: error.code === "signed_out" ? "signed_out" : "unavailable",
                  detail: error.detail,
                }),
            ),
          );
          if (!required(result.scopes))
            return yield* new CalendarProviderError({
              reason: "signed_out",
              detail: "Reconnect this Google account with Calendar access.",
            });
          tokens.set(key, result);
          return result.accessToken;
        }),
      );
    const connect: GoogleAuthShape["connect"] = (input) =>
      Stream.unwrap(
        Effect.gen(function* () {
          if (input.source === "local") return local.connect(input);
          const context = yield* account.current;
          if (Option.isNone(context)) return local.connect(input);
          const before = yield* cloudCall(() => context.value.providers.connections());
          // The one Google consent Mail and Calendar share on this device.
          const authorization = yield* cloudCall(() => context.value.providers.connect("google"));
          const waiting = {
            _tag: "waiting" as const,
            flowId: "cloud:google",
            authorizationUrl: authorization.url,
            redirectUri: new URL(authorization.url).searchParams.get("redirect_uri") ?? "",
          };
          const connected = Stream.fromEffect(
            Effect.sleep("3 seconds").pipe(
              Effect.andThen(cloudCall(() => context.value.providers.connections())),
            ),
          ).pipe(
            Stream.repeat(Schedule.forever),
            Stream.map((connections) =>
              connections.find(
                (connection) =>
                  connection.provider === "google" &&
                  required(connection.scopes) &&
                  !before.some(
                    (old) => old.id === connection.id && old.updatedAt === connection.updatedAt,
                  ),
              ),
            ),
            Stream.filter((connection) => connection !== undefined),
            Stream.map((connection) => ({
              _tag: "connected" as const,
              identity: { sub: `${PREFIX}${connection.id}`, email: connection.email },
            })),
            Stream.take(1),
            Stream.timeout("5 minutes"),
            Stream.mapError(
              () =>
                new CalendarError({
                  code: "unavailable",
                  detail: "Google sign-in did not finish. Try again.",
                }),
            ),
          );
          // OAuth polling is limited to this explicit connection attempt and cancelled with its stream.
          const paced = connected.pipe(Stream.rechunk(1));
          return Stream.concat(Stream.succeed(waiting), paced);
        }),
      );
    return GoogleAuth.of({
      ...local,
      accounts,
      clientStatus: Effect.gen(function* () {
        const context = yield* account.current.pipe(Effect.orElseSucceed(() => Option.none()));
        return Option.isSome(context)
          ? { configured: true, source: "account" as const, clientId: null }
          : yield* local.clientStatus;
      }),
      client: (sub) =>
        sub.startsWith(PREFIX)
          ? makeGoogleCalendarClient({
              http: http,
              accessToken: (rejected) => token(sub.slice(PREFIX.length), rejected),
            })
          : local.client(sub),
      hasTokens: (sub) =>
        sub.startsWith(PREFIX)
          ? accounts.pipe(
              Effect.map((list) => list.some((identity) => identity.sub === sub)),
              Effect.orElseSucceed(() => false),
            )
          : local.hasTokens(sub),
      disconnect: (sub) =>
        sub.startsWith(PREFIX)
          ? Effect.gen(function* () {
              const context = yield* account.current;
              if (Option.isNone(context))
                return yield* new CalendarError({
                  code: "signed_out",
                  detail: "Sign in before disconnecting this Google account.",
                });
              yield* cloudCall(() => context.value.providers.disconnect(sub.slice(PREFIX.length)));
              tokens.clear();
            })
          : Effect.void,
      removeTokens: (sub) =>
        sub.startsWith(PREFIX) ? Effect.sync(() => tokens.clear()) : local.removeTokens(sub),
      connect,
    });
  }),
);
