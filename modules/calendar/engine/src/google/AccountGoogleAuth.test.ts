// @effect-diagnostics globalDate:off -- Cloud's Promise client uses wall-clock expiry; these are fake tokens.
import { CalendarError } from "@otterware/calendar-contracts";
import * as Stream from "effect/Stream";
import { expect, it } from "@effect/vitest";
import { OtterCloudClient } from "@otterware/otter-cloud-client";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { CalendarAccountSession, type CalendarCloudContext } from "../CalendarAccountSession.ts";
import * as GoogleAuthUnavailable from "../GoogleAuthUnavailable.ts";
import { GoogleAuth } from "./GoogleAuth.ts";
import * as AccountGoogleAuth from "./AccountGoogleAuth.ts";

const scopes = AccountGoogleAuth.GOOGLE_CALENDAR_SCOPES;
const setup = Effect.gen(function* () {
  const calls: string[] = [];
  const seen: string[] = [];
  const cloud = (accountId: string, grantedScopes = scopes): CalendarCloudContext => ({
    accountId,
    cloudOrigin: "https://cloud.test",
    client: new OtterCloudClient({
      origin: "https://cloud.test",
      audience: "env",
      sessionToken: async () => accountId,
      fetch: async (input) => {
        const url = new URL(String(input));
        calls.push(`${accountId}:${url.pathname}`);
        if (url.pathname.endsWith("/cloud/token"))
          return Response.json({
            accessToken: `cloud-${accountId}`,
            expiresAt: Date.now() + 3600000,
            audience: "env",
          });
        if (url.pathname.endsWith("/connections"))
          return Response.json({
            connections: [
              {
                id: "connection",
                provider: "google",
                email: `${accountId}@example.test`,
                scopes: grantedScopes,
                updatedAt: 1,
              },
            ],
          });
        return Response.json({
          connectionId: "connection",
          accessToken: `google-${accountId}`,
          expiresAt: Date.now() + 3600000,
          audience: "env",
          scopes: grantedScopes,
        });
      },
    }),
  });
  const current = yield* Ref.make<Option.Option<CalendarCloudContext>>(Option.some(cloud("alice")));
  const http = HttpClient.make((request) => {
    seen.push(request.headers.authorization ?? "");
    return Effect.succeed(HttpClientResponse.fromWeb(request, Response.json({ items: [] })));
  });
  const layer = AccountGoogleAuth.layer.pipe(
    Layer.provide(GoogleAuthUnavailable.layer),
    Layer.provide(Layer.succeed(CalendarAccountSession, { current: Ref.get(current) })),
    Layer.provide(Layer.succeed(HttpClient.HttpClient, http)),
  );
  return { current, cloud, layer, calls, seen };
});

it.effect("uses account-held tokens, caches them and isolates account switches", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const test = yield* setup;
      const context = yield* Layer.build(test.layer);
      const auth = Context.get(context, GoogleAuth);
      expect((yield* auth.accounts!).map((account) => account.email)).toEqual([
        "alice@example.test",
      ]);
      yield* auth.client("cloud:connection").listCalendars({});
      yield* auth.client("cloud:connection").listCalendars({});
      expect(test.calls.filter((call) => call.endsWith("/connection/token"))).toHaveLength(1);
      expect(test.seen).toEqual(["Bearer google-alice", "Bearer google-alice"]);
      yield* Ref.set(test.current, Option.some(test.cloud("bob")));
      yield* auth.client("cloud:connection").listCalendars({});
      expect(test.seen.at(-1)).toBe("Bearer google-bob");
      yield* Ref.set(
        test.current,
        Option.some(test.cloud("broad", ["https://www.googleapis.com/auth/calendar"])),
      );
      expect(yield* auth.accounts!).toHaveLength(1);
      yield* auth.client("cloud:connection").listCalendars({});
      expect(test.seen.at(-1)).toBe("Bearer google-broad");
      yield* Ref.set(test.current, Option.none());
      const error = yield* Effect.flip(auth.client("cloud:connection").listCalendars({}));
      expect(error.reason).toBe("signed_out");
      expect(yield* auth.hasTokens("local-account")).toBe(false);
    }),
  ),
);

it.effect("local PKCE does not depend on an available Cloud session", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const layer = AccountGoogleAuth.layer.pipe(
        Layer.provide(GoogleAuthUnavailable.layer),
        Layer.provide(
          Layer.succeed(CalendarAccountSession, {
            current: Effect.fail(
              new CalendarError({ code: "unavailable", detail: "Cloud offline" }),
            ),
          }),
        ),
        Layer.provide(
          Layer.succeed(
            HttpClient.HttpClient,
            HttpClient.make(() => Effect.die("Unexpected HTTP request")),
          ),
        ),
      );
      const context = yield* Layer.build(layer);
      const auth = Context.get(context, GoogleAuth);
      const error = yield* Effect.flip(Stream.runCollect(auth.connect({ source: "local" })));
      expect(error.code).toBe("not_configured");
    }),
  ),
);
