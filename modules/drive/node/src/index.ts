import { DriveUploadSources, makeDriveModule } from "@otterware/drive-engine";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { prepareUploadSource } from "./DriveUploadSource.ts";
/** Host account credentials flow through the module runtime. */
export const driveNodeModule = () =>
  makeDriveModule(
    Layer.effect(
      DriveUploadSources,
      Effect.gen(function* () {
        const fetcher = yield* FetchHttpClient.Fetch;
        return {
          prepare: Effect.fn("DriveUploadSources.prepare")(
            function* (input) {
              return yield* prepareUploadSource(input);
            },
            Effect.provideService(FetchHttpClient.Fetch, fetcher),
          ),
        };
      }),
    ),
  );
