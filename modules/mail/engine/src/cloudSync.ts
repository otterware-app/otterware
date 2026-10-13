import { SYNCED_SETTINGS } from "./syncedSettings.ts";
import type { SyncRecord, SyncedRecord } from "@otterware/otter-cloud-client";
import type { OtterAccountSession } from "./AccountSession.ts";
import type { Platform, SqlDatabase } from "./platform.ts";

const specs = {
  "projects.json": "mail.projects",
  "views.json": "mail.views",
  "ui-preferences.json": "settings",
  "settings.json": "settings",
  "keybindings.json": "settings",
} as const;
type Name = keyof typeof specs;
const parse = (bytes: Uint8Array | string | null): unknown =>
  bytes === null
    ? null
    : JSON.parse(typeof bytes === "string" ? bytes : new TextDecoder().decode(bytes));
const records = (name: Name, value: unknown): Map<string, unknown> => {
  if (name === "projects.json")
    return new Map(
      ((value as { projects?: Array<{ id: string }> } | null)?.projects ?? []).map((p) => [
        p.id,
        p,
      ]),
    );
  if (name === "views.json")
    return new Map(((value as Array<{ id: string }> | null) ?? []).map((p) => [p.id, p]));
  if (name === "settings.json" && value && typeof value === "object")
    value = Object.fromEntries(
      Object.entries(value).filter(([key]) => (SYNCED_SETTINGS as readonly string[]).includes(key)),
    );
  return new Map(value === null ? [] : [[`mail:${name}`, value]]);
};

/** Durable per-record outbox, LWW through Otter Cloud. Network failures leave local edits intact. */
export function createCloudSync(input: {
  db: SqlDatabase;
  files: Platform["files"];
  session: OtterAccountSession;
  changed: (name: string) => void;
  now?: () => number;
  mutationId?: () => string;
}) {
  const { db, session } = input;
  const now = input.now ?? Date.now,
    uuid = input.mutationId ?? (() => crypto.randomUUID());
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const result = queue.then(work);
    queue = result.catch(() => {});
    return result;
  };
  const save = (
    collection: string,
    id: string,
    value: unknown,
    modifiedAt: number,
    mutationId: string,
    pending: number,
  ) =>
    db
      .prepare(`INSERT INTO mail_sync_records(account_id,collection,id,value,modified_at,mutation_id,pending) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(account_id,collection,id) DO UPDATE SET value=excluded.value,modified_at=excluded.modified_at,mutation_id=excluded.mutation_id,pending=excluded.pending`)
      .run(
        session.accountId,
        collection,
        id,
        JSON.stringify(value),
        modifiedAt,
        mutationId,
        pending,
      );
  const files: Platform["files"] = {
    ...input.files,
    write: (name, value) =>
      serial(async () => {
        if (!(name in specs)) return input.files.write(name, value);
        const key = name as Name,
          before = records(key, parse(await input.files.read(name))),
          after = records(key, parse(value));
        // Both documents and outbox use the same SQLite connection; no awaits inside the transaction.
        db.exec("BEGIN IMMEDIATE");
        try {
          // Platform documents write synchronously before returning their resolved Promise.
          await input.files.write(name, value);
          for (const id of new Set([...before.keys(), ...after.keys()])) {
            const next = after.get(id) ?? null;
            if (JSON.stringify(before.get(id) ?? null) !== JSON.stringify(next))
              save(specs[key], id, next, now(), uuid(), 1);
          }
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      }),
  };
  const apply = async (rows: readonly SyncedRecord[]) => {
    const changed = new Set<Name>();
    for (const row of rows) {
      const name = (Object.keys(specs) as Name[]).find(
        (name) =>
          specs[name] === row.collection &&
          (row.collection !== "settings" || row.id === `mail:${name}`),
      );
      if (!name) continue;
      const local = db
        .prepare(
          "SELECT modified_at,mutation_id,pending FROM mail_sync_records WHERE account_id=? AND collection=? AND id=?",
        )
        .get(session.accountId, row.collection, row.id);
      if (
        local?.pending &&
        (Number(local.modified_at) > row.modifiedAt ||
          (Number(local.modified_at) === row.modifiedAt &&
            String(local.mutation_id) > row.mutationId))
      )
        continue;
      save(row.collection, row.id, row.value, row.modifiedAt, row.mutationId, 0);
      changed.add(name);
    }
    for (const name of changed) {
      const values = db
        .prepare(
          "SELECT id,value FROM mail_sync_records WHERE account_id=? AND collection=? ORDER BY id",
        )
        .all(session.accountId, specs[name]);
      const live = values
        .map((r) => ({ id: String(r.id), value: JSON.parse(String(r.value)) as unknown }))
        .filter((r) => r.value !== null);
      let value: unknown =
        name === "projects.json"
          ? { projects: live.map((r) => r.value), pending: [] }
          : name === "views.json"
            ? live.map((r) => r.value)
            : (live.find((r) => r.id === `mail:${name}`)?.value ?? null);
      if (name === "settings.json") {
        const current = parse(await input.files.read(name));
        const account = records(name, value).get(`mail:${name}`);
        value = {
          ...(current && typeof current === "object" ? current : {}),
          ...(account && typeof account === "object" ? account : {}),
        };
      }
      await input.files.write(name, JSON.stringify(value));
      input.changed(name);
    }
  };
  let syncing: Promise<void> | undefined;
  const sync = (): Promise<void> =>
    (syncing ??= (async () => {
      const pending = await serial(async () => {
        for (const name of Object.keys(specs) as Name[]) {
          for (const [id, value] of records(name, parse(await input.files.read(name)))) {
            if (
              !db
                .prepare(
                  "SELECT 1 FROM mail_sync_records WHERE account_id=? AND collection=? AND id=?",
                )
                .get(session.accountId, specs[name], id)
            )
              save(specs[name], id, value, 0, uuid(), 1);
          }
        }
        return db
          .prepare("SELECT * FROM mail_sync_records WHERE account_id=? AND pending=1")
          .all(session.accountId)
          .map((row) => ({
            collection: String(row.collection) as SyncRecord["collection"],
            id: String(row.id),
            value: JSON.parse(String(row.value)) as unknown,
            modifiedAt: Number(row.modified_at),
            mutationId: String(row.mutation_id),
          }));
      });
      // Network waits never hold the local-write queue. A newer edit stays pending when an old acknowledgement arrives.
      for (let start = 0; start < pending.length; start += 100) {
        const result = await session.push(pending.slice(start, start + 100));
        await serial(() => apply(result.records));
      }
      let cursor = Number(
        db.prepare("SELECT cursor FROM mail_sync_cursors WHERE account_id=?").get(session.accountId)
          ?.cursor ?? 0,
      );
      let more = true;
      while (more) {
        const page = await session.pull(cursor);
        await serial(async () => {
          await apply(page.records);
          db.prepare(
            "INSERT INTO mail_sync_cursors(account_id,cursor) VALUES (?,?) ON CONFLICT(account_id) DO UPDATE SET cursor=excluded.cursor",
          ).run(session.accountId, page.cursor);
        });
        cursor = page.cursor;
        more = page.hasMore;
      }
    })().finally(() => {
      syncing = undefined;
    }));
  return { files, sync };
}
