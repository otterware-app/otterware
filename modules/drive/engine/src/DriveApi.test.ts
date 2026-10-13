import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { HttpClient, HttpClientResponse } from "effect/http";
import {
  DRIVE_ACCOUNTS_URL,
  DRIVE_CLOUD_AUDIENCE,
  DRIVE_CLOUD_ORIGIN,
} from "@otterware/drive-contracts";
import { makeDriveApi } from "./DriveApi.ts";

it.effect(
  "exchanges an account grant and sends the Cloud capability only to Drive API requests",
  () =>
    Effect.gen(function* () {
      const requests: Array<{
        url: string;
        authorization: string | undefined;
        audience: string | undefined;
      }> = [];
      const http = HttpClient.make((request) =>
        Effect.sync(() => {
          requests.push({
            url: request.url,
            authorization: request.headers.authorization,
            audience: request.headers["x-otter-audience"],
          });
          const response =
            request.url === `${DRIVE_ACCOUNTS_URL}/suite/session`
              ? { token: "offline-session" }
              : request.url === `${DRIVE_CLOUD_ORIGIN}/v1/cloud/token`
                ? { accessToken: "cloud-capability" }
                : { data: [] };
          return HttpClientResponse.fromWeb(request, Response.json(response));
        }),
      );
      const api = yield* makeDriveApi(DRIVE_CLOUD_ORIGIN).pipe(
        Effect.provideService(HttpClient.HttpClient, http),
      );
      const token = yield* api.suiteSession("oauth-access");
      yield* api.listFolders({ token });
      expect(requests).toEqual([
        {
          url: `${DRIVE_ACCOUNTS_URL}/suite/session`,
          authorization: "Bearer oauth-access",
          audience: undefined,
        },
        {
          url: `${DRIVE_CLOUD_ORIGIN}/v1/cloud/token`,
          authorization: "Bearer offline-session",
          audience: undefined,
        },
        {
          url: `${DRIVE_CLOUD_ORIGIN}/api/v1/folders`,
          authorization: "Bearer cloud-capability",
          audience: DRIVE_CLOUD_AUDIENCE,
        },
      ]);
    }),
);
