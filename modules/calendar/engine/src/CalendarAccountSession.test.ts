import { OtterAccountSession, type ConnectedAccount } from "@otterware/module-kit/account";
import { OtterCloudClient } from "@otterware/otter-cloud-client";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import {
  makeCloudFetch,
  accountSessionLayer,
  CalendarAccountSession,
  type CalendarAccountCredential,
} from "./CalendarAccountSession.ts";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as TestClock from "effect/testing/TestClock";

it.effect("Cloud's fetch adapter preserves empty 204 responses and routes through HttpClient", () =>
  Effect.gen(function* () {
    const requests: string[] = [];
    const http = HttpClient.make((request) => {
      requests.push(request.url);
      return Effect.succeed(
        HttpClientResponse.fromWeb(request, new Response(null, { status: 204 })),
      );
    });
    const response = yield* Effect.promise(() =>
      makeCloudFetch(http)("https://cloud.test/v1/cloud/connections/a", { method: "DELETE" }),
    );
    expect(response.status).toBe(204);
    expect(yield* Effect.promise(() => response.text())).toBe("");
    expect(requests).toEqual(["https://cloud.test/v1/cloud/connections/a"]);
  }),
);

it.effect(
  "exchanges the environment grant, renews sessions and forgets them on account switches",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        yield* TestClock.setTime(1000);
        const headers: string[] = [];
        const credential = (name: string) => ({
          oauthToken: name,
          accountsUrl: "https://accounts.test/v1/auth",
          cloudOrigin: "https://cloud.test",
          audience: "calendar:environment",
        });
        const saved = yield* Ref.make<Option.Option<CalendarAccountCredential>>(
          Option.some(credential("alice")),
        );
        const http = HttpClient.make((request) =>
          Effect.gen(function* () {
            headers.push(request.headers.authorization ?? "");
            expect(request.url).toBe("https://accounts.test/v1/auth/suite/session");
            const now = yield* Clock.currentTimeMillis;
            return HttpClientResponse.fromWeb(
              request,
              Response.json({
                token: "suite-fake",
                expiresAt: now + 120000,
                user: { id: request.headers.authorization === "Bearer alice" ? "alice" : "bob" },
              }),
            );
          }),
        );
        const context = yield* Layer.build(
          accountSessionLayer(Ref.get(saved)).pipe(
            Layer.provide(Layer.succeed(HttpClient.HttpClient, http)),
          ),
        );
        const session = Context.get(context, CalendarAccountSession);
        const first = Option.getOrThrow(yield* session.current);
        expect(first.accountId).toBe("alice");
        expect(Option.getOrThrow(yield* session.current).client).toBe(first.client);
        expect(headers).toHaveLength(1);
        yield* TestClock.adjust(61000);
        expect(Option.getOrThrow(yield* session.current).client).not.toBe(first.client);
        yield* Ref.set(saved, Option.some(credential("bob")));
        expect(Option.getOrThrow(yield* session.current).accountId).toBe("bob");
        yield* Ref.set(saved, Option.none());
        expect(Option.isNone(yield* session.current)).toBe(true);
        yield* Ref.set(saved, Option.some(credential("bob")));
        yield* session.current;
        expect(headers).toEqual(["Bearer alice", "Bearer alice", "Bearer bob", "Bearer bob"]);
      }),
    ),
);

it.effect("cancels in-flight SDK fetches when their module/account scope closes", () =>
  Effect.gen(function* () {
    const abort = new AbortController();
    const http = HttpClient.make(() => Effect.never);
    const pending = makeCloudFetch(http, abort.signal)("https://cloud.test/v1/cloud/connections");
    abort.abort();
    yield* Effect.promise(() => expect(pending).rejects.toBeDefined());
  }),
);

it.effect("uses the shared host account and observes detach without a second Google session", () =>
  Effect.gen(function* () {
    const client = new OtterCloudClient({
      origin: "https://cloud.test",
      audience: "environment:test",
      sessionToken: async () => "host-session",
    });
    const identity: ConnectedAccount = {
      accountId: "alice",
      client,
      connections: () => client.connections(),
      providerToken: (id) => client.providerToken(id),
      push: (records) => client.push(records),
      pull: (cursor) => client.pull(cursor),
      subscribe: () => () => {},
    };
    let attached = true;
    const host = Layer.succeed(OtterAccountSession, {
      current: () => (attached ? identity : null),
      attach: async () => "alice",
      detach: async () => {},
      subscribe: () => () => {},
    });
    const context = yield* Layer.build(
      accountSessionLayer(Effect.die("The host owns the session")).pipe(
        Layer.provide(host),
        Layer.provide(
          Layer.succeed(
            HttpClient.HttpClient,
            HttpClient.make(() => Effect.die("No duplicate exchange")),
          ),
        ),
      ),
    );
    const session = Context.get(context, CalendarAccountSession);
    expect(Option.getOrThrow(yield* session.current).client).toBe(client);
    attached = false;
    expect(Option.isNone(yield* session.current)).toBe(true);
  }),
);
