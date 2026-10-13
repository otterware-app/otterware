import {
  DEFAULT_CALENDAR_PREFERENCES,
  CalendarPreferencesPatch,
  CalendarPreferences,
  type CalendarPreferencesPatch as PreferencesPatch,
  CalendarError,
} from "@otterware/calendar-contracts";
import type { SyncedRecord, SyncRecord } from "@otterware/otter-cloud-client";
import * as Clock from "effect/Clock";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as SqlClient from "effect/sql/SqlClient";
import { CalendarAccountSession, cloudCall } from "./CalendarAccountSession.ts";

const PREFIX = "calendar.preference.";
const decodeValue = Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown));
const encodeValue = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));
const decodePreferences = Schema.decodeUnknownEffect(CalendarPreferences);
const decodePatch = Schema.decodeUnknownEffect(CalendarPreferencesPatch);
const CalendarRef = Schema.Struct({ account: Schema.String, calendar: Schema.String });
const CalendarAppearance = Schema.Struct({
  ...CalendarRef.fields,
  visible: Schema.Boolean,
  color: Schema.String,
});
const decodeRef = Schema.decodeUnknownEffect(Schema.NullOr(CalendarRef));
const decodeAppearance = Schema.decodeUnknownEffect(Schema.Array(CalendarAppearance));
type CatalogRow = {
  calendar_id: string;
  remote_id: string;
  external_id: string;
  visible: number;
  color: string;
};
type Cached = { setting: string; value_json: string; modified_at: number; mutation_id: string };
const failure = () =>
  new CalendarError({ code: "failed", detail: "Could not sync Calendar preferences." });

/** Per-field LWW records, a durable outbox, and independent cursors for each Otter Account. */
export const makePreferenceSync = (initial: CalendarPreferences) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const crypto = yield* Crypto.Crypto;
    const account = yield* Effect.serviceOption(CalendarAccountSession);
    const lock = yield* Semaphore.make(1);
    const activeRows = yield* sql<{
      account_id: string | null;
    }>`SELECT account_id FROM calendar_preference_sync_meta WHERE id = 1`;
    let activeAccount = activeRows[0]?.account_id ?? "";
    const catalog = sql<CatalogRow>`SELECT c.calendar_id, c.remote_id, a.external_id, c.visible, c.color FROM calendar_calendars c JOIN calendar_accounts a ON a.account_id = c.account_id`;
    const save = (
      table: "calendar_preference_sync_cache" | "calendar_preference_sync_outbox",
      accountId: string,
      setting: string,
      valueJson: string,
      modifiedAt: number,
      mutationId: string,
    ) =>
      sql.unsafe(
        `INSERT INTO ${table} (account_id, setting, value_json, modified_at, mutation_id) VALUES (?, ?, ?, ?, ?) ON CONFLICT(account_id, setting) DO UPDATE SET value_json = excluded.value_json, modified_at = excluded.modified_at, mutation_id = excluded.mutation_id`,
        [accountId, setting, valueJson, modifiedAt, mutationId],
      );
    const queueValues = (values: Record<string, unknown>) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        for (const [setting, value] of Object.entries(values)) {
          const json = yield* encodeValue(value);
          const previous =
            (yield* sql<Cached>`SELECT * FROM calendar_preference_sync_cache WHERE account_id = ${activeAccount} AND setting = ${setting}`)[0];
          const modifiedAt = Math.max(now, previous ? previous.modified_at + 1 : now);
          const mutationId = yield* crypto.randomUUIDv4;
          yield* save(
            "calendar_preference_sync_cache",
            activeAccount,
            setting,
            json,
            modifiedAt,
            mutationId,
          );
          if (activeAccount)
            yield* save(
              "calendar_preference_sync_outbox",
              activeAccount,
              setting,
              json,
              modifiedAt,
              mutationId,
            );
        }
      });
    const queuePatch = (patch: PreferencesPatch) =>
      Effect.gen(function* () {
        const values: Record<string, unknown> = { ...patch };
        if (patch.defaultCalendarId !== undefined) {
          const target = (yield* catalog).find(
            (row) => row.calendar_id === patch.defaultCalendarId,
          );
          values.defaultCalendarId = target
            ? { account: target.external_id, calendar: target.remote_id }
            : null;
        }
        yield* queueValues(values);
      }).pipe(Effect.mapError(failure));
    const queueCalendars = Effect.gen(function* () {
      yield* queueValues({
        calendars: (yield* catalog).map((row) => ({
          account: row.external_id,
          calendar: row.remote_id,
          visible: row.visible === 1,
          color: row.color,
        })),
      });
    }).pipe(Effect.mapError(failure));
    const cached = Effect.gen(function* () {
      const rows =
        yield* sql<Cached>`SELECT * FROM calendar_preference_sync_cache WHERE account_id = ${activeAccount}`;
      const values: Record<string, unknown> = {};
      let appearances: (typeof CalendarAppearance.Type)[] = [];
      for (const row of rows) {
        const value = yield* decodeValue(row.value_json);
        if (row.setting === "calendars") {
          appearances = [...(yield* decodeAppearance(value))];
          continue;
        }
        if (row.setting === "defaultCalendarId") {
          const ref = yield* decodeRef(value);
          values.defaultCalendarId = ref
            ? ((yield* catalog).find(
                (item) => item.external_id === ref.account && item.remote_id === ref.calendar,
              )?.calendar_id ?? null)
            : null;
        } else values[row.setting] = value;
      }
      const patch = yield* decodePatch(values);
      const preferences = yield* decodePreferences({
        ...DEFAULT_CALENDAR_PREFERENCES,
        ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)),
      });
      return { preferences, appearances };
    });
    const localCount = yield* sql<{
      n: number;
    }>`SELECT COUNT(*) AS n FROM calendar_preference_sync_cache WHERE account_id = ''`;
    if (!activeAccount && !localCount[0]?.n) {
      yield* queuePatch(initial);
      yield* queueCalendars;
    }
    const validateValue = (setting: string, value: unknown) =>
      (setting === "calendars"
        ? decodeAppearance(value).pipe(Effect.asVoid)
        : setting === "defaultCalendarId"
          ? decodeRef(value).pipe(Effect.asVoid)
          : decodePatch({ [setting]: value }).pipe(Effect.asVoid)
      ).pipe(
        Effect.as(true),
        Effect.orElseSucceed(() => false),
      );
    const accept = (accountId: string, records: readonly SyncedRecord[]) =>
      Effect.gen(function* () {
        for (const record of records) {
          if (record.collection !== "settings" || !record.id.startsWith(PREFIX)) continue;
          const setting = record.id.slice(PREFIX.length);
          if (!(setting in CalendarPreferencesPatch.fields) && setting !== "calendars") continue;
          if (!(yield* validateValue(setting, record.value))) continue;
          const pending =
            (yield* sql<Cached>`SELECT * FROM calendar_preference_sync_outbox WHERE account_id = ${accountId} AND setting = ${setting}`)[0];
          if (
            pending &&
            (pending.modified_at > record.modifiedAt ||
              (pending.modified_at === record.modifiedAt &&
                pending.mutation_id > record.mutationId))
          )
            continue;
          const json = yield* encodeValue(record.value);
          yield* save(
            "calendar_preference_sync_cache",
            accountId,
            setting,
            json,
            record.modifiedAt,
            record.mutationId,
          );
          if (pending)
            yield* sql`DELETE FROM calendar_preference_sync_outbox WHERE account_id = ${accountId} AND setting = ${setting} AND mutation_id = ${pending.mutation_id}`;
        }
      });
    const sync = lock
      .withPermits(1)(
        Effect.gen(function* () {
          if (Option.isNone(account)) return Option.none();
          const context = yield* account.value.current;
          const accountId = Option.isSome(context) ? context.value.accountId : "";
          const switched = activeAccount !== accountId;
          if (switched) {
            activeAccount = accountId;
            yield* sql`INSERT INTO calendar_preference_sync_meta (id, account_id) VALUES (1, ${accountId || null}) ON CONFLICT(id) DO UPDATE SET account_id = excluded.account_id`;
          }
          if (Option.isNone(context)) return switched ? Option.some(yield* cached) : Option.none();
          let cursor =
            (yield* sql<{
              cursor: number;
            }>`SELECT cursor FROM calendar_preference_sync_cursor WHERE account_id = ${accountId}`)[0]
              ?.cursor ?? 0;
          for (let pages = 0; pages < 100; pages++) {
            const page = yield* cloudCall(() => context.value.client.pull(cursor));
            yield* sql.withTransaction(accept(accountId, page.records));
            cursor = page.cursor;
            yield* sql`INSERT INTO calendar_preference_sync_cursor (account_id, cursor) VALUES (${accountId}, ${cursor}) ON CONFLICT(account_id) DO UPDATE SET cursor = excluded.cursor`;
            if (!page.hasMore) break;
          }
          const anyAccountSettings = yield* sql<{
            n: number;
          }>`SELECT COUNT(*) AS n FROM calendar_preference_sync_cache WHERE account_id != ''`;
          if (switched && !anyAccountSettings[0]?.n) {
            const local =
              yield* sql<Cached>`SELECT * FROM calendar_preference_sync_cache WHERE account_id = ''`;
            const values: Record<string, unknown> = {};
            for (const row of local) values[row.setting] = yield* decodeValue(row.value_json);
            yield* queueValues(values);
          }
          const pending =
            yield* sql<Cached>`SELECT * FROM calendar_preference_sync_outbox WHERE account_id = ${accountId}`;
          if (pending.length) {
            const records = yield* Effect.forEach(pending, (row) =>
              decodeValue(row.value_json).pipe(
                Effect.map(
                  (value) =>
                    ({
                      collection: "settings" as const,
                      id: `${PREFIX}${row.setting}`,
                      value,
                      modifiedAt: row.modified_at,
                      mutationId: row.mutation_id,
                    }) satisfies SyncRecord,
                ),
              ),
            );
            const pushed = yield* cloudCall(() => context.value.client.push(records));
            yield* sql.withTransaction(accept(accountId, pushed.records));
          }
          return Option.some(yield* cached);
        }),
      )
      .pipe(Effect.mapError(failure));
    return { queuePatch, queueCalendars, cached, sync };
  });
