import { DriveAccountSession, DriveUploadSources, makeDriveModule } from "@otterware/drive-engine";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { prepareUploadSource } from "./DriveUploadSource.ts";
/** W2 can pass its account layer without changing Drive's engine or tool handlers. */
export const driveNodeModule = <E, R>(
  account: Layer.Layer<DriveAccountSession, E, R> = Layer.succeed(DriveAccountSession, {
    current: Effect.succeed(null),
  }),
) =>
  makeDriveModule(
    account,
    Layer.effect(
      DriveUploadSources,
      Effect.gen(function* () {
        const fetcher = yield* FetchHttpClient.Fetch;
        return {
          prepare: (input) =>
            prepareUploadSource(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetcher)),
        };
      }),
    ),
  );
