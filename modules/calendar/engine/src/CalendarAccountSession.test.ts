import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { makeCloudFetch } from "./CalendarAccountSession.ts";

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
