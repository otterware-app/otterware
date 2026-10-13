// @effect-diagnostics globalDate:off -- The Cloud SDK uses wall-clock token expiry; credentials here are fake.
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { DEFAULT_CALENDAR_PREFERENCES } from "@otterware/calendar-contracts";
import {
  OtterCloudClient,
  type SyncedRecord,
  type SyncRecord,
} from "@otterware/otter-cloud-client";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as SqlClient from "effect/sql/SqlClient";
import { SqlitePersistenceMemory } from "../test/Sqlite.ts";
import { CalendarAccountSession, type CalendarCloudContext } from "./CalendarAccountSession.ts";
import { makePreferenceSync } from "./CalendarPreferenceSync.ts";

const database = SqlitePersistenceMemory.pipe(Layer.provideMerge(NodeServices.layer));
const setup = Effect.gen(function* () {
  const records = new Map<string, SyncedRecord[]>();
  let rejectPush = false;
  let revision = 0;
  const cloud = (accountId: string): CalendarCloudContext => ({
    accountId,
    cloudOrigin: "https://cloud.test",
    client: new OtterCloudClient({
      origin: "https://cloud.test",
      audience: "env",
      sessionToken: async () => accountId,
      fetch: async (input, init) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/token"))
          return Response.json({
            accessToken: "fake",
            expiresAt: Date.now() + 3600000,
            audience: "env",
          });
        const accountRecords = records.get(accountId) ?? [];
        if (init?.method === "POST") {
          if (rejectPush) return new Response(null, { status: 503 });
          const body = JSON.parse(String(init.body)) as { records: SyncRecord[] };
          const pushed = body.records.map((record) => ({ ...record, revision: ++revision }));
          records.set(accountId, [
            ...accountRecords.filter((old) => !pushed.some((next) => next.id === old.id)),
            ...pushed,
          ]);
          return Response.json({ records: pushed });
        }
        const cursor = Number(url.searchParams.get("cursor") ?? 0);
        return Response.json({
          records: accountRecords.filter((record) => record.revision > cursor),
          cursor: revision,
          hasMore: false,
        });
      },
    }),
  });
  const current = yield* Ref.make<Option.Option<CalendarCloudContext>>(Option.some(cloud("alice")));
  const construct = makePreferenceSync(DEFAULT_CALENDAR_PREFERENCES).pipe(
    Effect.provideService(CalendarAccountSession, { current: Ref.get(current) }),
  );
  return {
    records,
    cloud,
    current,
    construct,
    reject: (value: boolean) => {
      rejectPush = value;
    },
    remote: (account: string, setting: string, value: unknown) => {
      const record = {
        collection: "settings" as const,
        id: `calendar.preference.${setting}`,
        value,
        modifiedAt: 10000,
        mutationId: `remote-${++revision}`,
        revision,
      };
      records.set(account, [
        ...(records.get(account) ?? []).filter((old) => old.id !== record.id),
        record,
      ]);
    },
  };
});

it.effect(
  "persists failed pushes across restart and restores separate account and local settings",
  () =>
    Effect.gen(function* () {
      const test = yield* setup;
      const first = yield* test.construct;
      yield* first.sync;
      yield* first.queuePatch({ hourFormat: "12" });
      test.reject(true);
      yield* Effect.flip(first.sync);
      const restarted = yield* test.construct;
      expect((yield* restarted.cached).preferences.hourFormat).toBe("12");
      test.reject(false);
      yield* restarted.sync;
      const sql = yield* SqlClient.SqlClient;
      expect(yield* sql`SELECT * FROM calendar_preference_sync_outbox`).toHaveLength(0);
      expect(test.records.get("alice")?.find((row) => row.id.endsWith("hourFormat"))?.value).toBe(
        "12",
      );
      yield* Ref.set(test.current, Option.some(test.cloud("bob")));
      expect(Option.getOrThrow(yield* restarted.sync).preferences.hourFormat).toBe(
        DEFAULT_CALENDAR_PREFERENCES.hourFormat,
      );
      yield* restarted.queuePatch({ hourFormat: "12", defaultEventMinutes: 45 });
      yield* restarted.sync;
      yield* Ref.set(test.current, Option.some(test.cloud("alice")));
      expect(Option.getOrThrow(yield* restarted.sync).preferences.defaultEventMinutes).toBe(
        DEFAULT_CALENDAR_PREFERENCES.defaultEventMinutes,
      );
      yield* Ref.set(test.current, Option.none());
      expect(Option.getOrThrow(yield* restarted.sync).preferences.hourFormat).toBe(
        DEFAULT_CALENDAR_PREFERENCES.hourFormat,
      );
    }).pipe(Effect.provide(database)),
);

it.effect("maps synced calendar references to local ids and ignores environment settings", () =>
  Effect.gen(function* () {
    const test = yield* setup;
    const sql = yield* SqlClient.SqlClient;
    yield* sql`INSERT INTO calendar_accounts (account_id, provider, external_id, email, display_name, status, position, created_at) VALUES ('local-account', 'google', 'cloud:connection', 'a@example.test', 'A', 'ok', 0, 0)`;
    yield* sql`INSERT INTO calendar_calendars (calendar_id, account_id, remote_id, name, color, access_role, is_primary, visible, position, horizon_start, horizon_end) VALUES ('local-calendar', 'local-account', 'primary', 'Work', '#123456', 'owner', 1, 1, 0, 0, 0)`;
    test.remote("alice", "defaultCalendarId", { account: "cloud:connection", calendar: "primary" });
    test.remote("alice", "calendars", [
      { account: "cloud:connection", calendar: "primary", visible: false, color: "#654321" },
    ]);
    test.remote("alice", "syncWindow", { pastDays: 1, futureDays: 1 });
    test.remote("alice", "hourFormat", "invalid");
    const sync = yield* test.construct;
    const result = Option.getOrThrow(yield* sync.sync);
    expect(result.preferences.defaultCalendarId).toBe("local-calendar");
    expect(result.appearances).toEqual([
      { account: "cloud:connection", calendar: "primary", visible: false, color: "#654321" },
    ]);
    expect(result.preferences.hourFormat).toBe(DEFAULT_CALENDAR_PREFERENCES.hourFormat);
    expect(result.preferences).not.toHaveProperty("syncWindow");
  }).pipe(Effect.provide(database)),
);
