import { OtterCloudClient, CloudError } from "@otterware/otter-cloud-client";
import { CalendarError } from "@otterware/calendar-contracts";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpMethod from "effect/http/HttpMethod";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";

/** The environment owns its Account credential; renderers never copy their refresh grant here. */
export interface CalendarAccountCredential {
  readonly oauthToken: string;
  readonly accountsUrl: string;
  readonly cloudOrigin: string;
  readonly audience: string;
}
export interface CalendarCloudContext {
  readonly accountId: string;
  readonly client: OtterCloudClient;
  readonly cloudOrigin: string;
}
export class CalendarAccountSession extends Context.Service<
  CalendarAccountSession,
  {
    readonly current: Effect.Effect<Option.Option<CalendarCloudContext>, CalendarError>;
  }
>()("@otterware/calendar-engine/CalendarAccountSession") {}

const SuiteSession = Schema.Struct({
  token: Schema.String,
  expiresAt: Schema.Number,
  user: Schema.Struct({ id: Schema.String }),
});
const failed = () =>
  new CalendarError({
    code: "signed_out",
    detail: "Sign in to your Otter Account on this environment again.",
  });
export const cloudCall = <A>(work: () => Promise<A>) =>
  Effect.tryPromise({
    try: work,
    catch: (cause) =>
      new CalendarError({
        code:
          cause instanceof CloudError && (cause.status === 401 || cause.status === 403)
            ? "signed_out"
            : "unavailable",
        detail: "Could not reach your Otter Account. Try again.",
      }),
  });

/** Adapts Cloud's portable fetch interface to the engine's HttpClient, including cancellation. */
export const makeCloudFetch =
  (http: HttpClient.HttpClient): typeof fetch =>
  async (input, init) => {
    const request = new Request(input, init);
    const body =
      request.method === "GET" || request.method === "HEAD" ? null : await request.text();
    if (!HttpMethod.isHttpMethod(request.method)) throw new Error("Unsupported Cloud HTTP method.");
    let effectRequest = HttpClientRequest.make(request.method)(request.url).pipe(
      HttpClientRequest.setHeaders(Object.fromEntries(request.headers)),
    );
    if (body !== null)
      effectRequest = effectRequest.pipe(
        HttpClientRequest.bodyText(body, request.headers.get("content-type") ?? "application/json"),
      );
    return Effect.runPromise(
      Effect.gen(function* () {
        const response = yield* http.execute(effectRequest);
        const bytes = yield* response.arrayBuffer;
        return new Response(
          [204, 205, 304].includes(response.status) || request.method === "HEAD" ? null : bytes,
          { status: response.status, headers: response.headers },
        );
      }),
      { signal: request.signal },
    );
  };

export const accountSessionLayer = <E, R>(
  credential: Effect.Effect<Option.Option<CalendarAccountCredential>, E, R>,
) =>
  Layer.effect(
    CalendarAccountSession,
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient;
      const context = yield* Effect.context<R>();
      const readCredential = credential.pipe(Effect.provide(context));
      const fetcher = makeCloudFetch(http);
      const lock = yield* Semaphore.make(1);
      let cached: {
        credential: CalendarAccountCredential;
        expiresAt: number;
        context: CalendarCloudContext;
      } | null = null;
      const current = lock.withPermits(1)(
        Effect.gen(function* () {
          const saved = yield* readCredential.pipe(Effect.mapError(failed));
          if (Option.isNone(saved)) {
            cached?.context.client.clearSession();
            cached = null;
            return Option.none<CalendarCloudContext>();
          }
          const now = yield* Clock.currentTimeMillis;
          const key = saved.value;
          if (
            cached &&
            cached.credential.oauthToken === key.oauthToken &&
            cached.credential.accountsUrl === key.accountsUrl &&
            cached.credential.cloudOrigin === key.cloudOrigin &&
            cached.credential.audience === key.audience &&
            cached.expiresAt > now + 60_000
          )
            return Option.some(cached.context);
          const response = yield* http
            .execute(
              HttpClientRequest.post(`${key.accountsUrl.replace(/\/$/, "")}/suite/session`).pipe(
                HttpClientRequest.bearerToken(key.oauthToken),
              ),
            )
            .pipe(Effect.mapError(failed));
          if (response.status !== 200) return yield* failed();
          const session = yield* HttpClientResponse.schemaBodyJson(SuiteSession)(response).pipe(
            Effect.mapError(failed),
          );
          if (session.expiresAt <= now) return yield* failed();
          cached?.context.client.clearSession();
          const client = new OtterCloudClient({
            origin: key.cloudOrigin,
            audience: key.audience,
            sessionToken: async () => session.token,
            fetch: fetcher,
          });
          const context = { accountId: session.user.id, client, cloudOrigin: key.cloudOrigin };
          cached = { credential: key, expiresAt: session.expiresAt, context };
          return Option.some(context);
        }),
      );
      yield* Effect.addFinalizer(() => Effect.sync(() => cached?.context.client.clearSession()));
      return { current };
    }),
  );
