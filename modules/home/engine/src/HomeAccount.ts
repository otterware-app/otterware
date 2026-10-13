/**
 * The host's Otter Account, as Home syncs it (ADR 0019): cross-app projects
 * and saved views are local-first in `suite.sqlite` and synced through Otter
 * Cloud's account data while signed in. Optional: a host that provides none
 * keeps Home local.
 */
import type { SyncRecord, SyncedRecord } from "@otterware/otter-cloud-client";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Option from "effect/Option";
import type * as Stream from "effect/Stream";

export interface HomeSyncAccount {
  readonly accountId: string;
  readonly push: (
    records: ReadonlyArray<SyncRecord>,
  ) => Promise<{ readonly records: ReadonlyArray<SyncedRecord> }>;
  readonly pull: (cursor: number) => Promise<{
    readonly records: ReadonlyArray<SyncedRecord>;
    readonly cursor: number;
    readonly hasMore: boolean;
  }>;
}

export class HomeAccount extends Context.Service<
  HomeAccount,
  {
    /** The signed-in account now; none while signed out. */
    readonly current: Effect.Effect<Option.Option<HomeSyncAccount>>;
    /** Signals that the account or its synced data changed (sign-in, `sync.changed`). */
    readonly changes: Stream.Stream<void>;
  }
>()("@otterware/home-engine/HomeAccount") {}
