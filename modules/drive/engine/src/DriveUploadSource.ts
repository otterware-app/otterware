import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type * as Stream from "effect/Stream";
import { DriveApiError } from "./DriveApi.ts";

export interface DriveUploadInput {
  readonly path?: string | undefined;
  readonly url?: string | undefined;
  readonly contentBase64?: string | undefined;
  readonly name: string;
  readonly folder?: string | undefined;
  readonly documentRef?: string | undefined;
  readonly ifVersion?: number | undefined;
  readonly publish?: boolean | undefined;
}
export const uploadInputError = (detail: string) =>
  new DriveApiError({ status: 400, code: "invalid_upload", detail });
export interface DriveUploadSource {
  readonly size: number;
  readonly sha256: string;
  readonly contentType: string;
  readonly stream: (start?: number, end?: number) => Stream.Stream<Uint8Array, DriveApiError>;
  readonly close: () => Promise<void>;
}
/** Rewindable sources: a Node host spools URLs and reads paths; an engine never opens files. */
export class DriveUploadSources extends Context.Service<
  DriveUploadSources,
  {
    readonly prepare: (input: DriveUploadInput) => Effect.Effect<DriveUploadSource, DriveApiError>;
  }
>()("@otterware/drive-engine/DriveUploadSource/DriveUploadSources") {}
