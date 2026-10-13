import type { SyncPage } from "@otterware/otter-cloud-client";
import { z } from "zod";
import type { Env } from "./env.ts";
export const collectionSchema = z.enum([
  "settings",
  "mail.projects",
  "mail.views",
  "home.projects",
]);
export const recordSchema = z
  .object({
    collection: collectionSchema,
    id: z.string().min(1).max(256),
    value: z.json().nullable(),
    modifiedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    mutationId: z.uuid(),
  })
  .strict();
export const pushSchema = z.object({ records: z.array(recordSchema).max(100) }).strict();
type Row = {
  revision: number;
  collection: z.infer<typeof collectionSchema>;
  id: string;
  value: string | null;
  modified_at: number;
  mutation_id: string;
};
const decode = (r: Row) => ({
  revision: r.revision,
  collection: r.collection,
  id: r.id,
  value: r.value === null ? null : JSON.parse(r.value),
  modifiedAt: r.modified_at,
  mutationId: r.mutation_id,
});

/** The SQL predicate and replacement run atomically; tombstones participate in the same ordering. */
export async function pushRecords(
  env: Env,
  userId: string,
  records: z.infer<typeof recordSchema>[],
) {
  if (records.length === 0) return { records: [] };
  const statements = records.map((r) =>
    env.ACCOUNT_DATA.prepare(`
    INSERT OR REPLACE INTO sync_record(user_id, collection, id, value, modified_at, mutation_id)
    SELECT ?,?,?,?,?,? WHERE NOT EXISTS (
      SELECT 1 FROM sync_record WHERE user_id=? AND collection=? AND id=?
      AND (modified_at>? OR (modified_at=? AND mutation_id>=?))
    )`).bind(
      userId,
      r.collection,
      r.id,
      r.value === null ? null : JSON.stringify(r.value),
      r.modifiedAt,
      r.mutationId,
      userId,
      r.collection,
      r.id,
      r.modifiedAt,
      r.modifiedAt,
      r.mutationId,
    ),
  );
  const queries = records.map((r) =>
    env.ACCOUNT_DATA.prepare(
      "SELECT * FROM sync_record WHERE user_id=? AND collection=? AND id=?",
    ).bind(userId, r.collection, r.id),
  );
  const result = await env.ACCOUNT_DATA.batch<Row>([...statements, ...queries]);
  return { records: result.slice(statements.length).flatMap((r) => r.results.map(decode)) };
}

export async function pullRecords(env: Env, userId: string, after: number) {
  const result = await env.ACCOUNT_DATA.prepare(
    "SELECT * FROM sync_record WHERE user_id=? AND revision>? ORDER BY revision LIMIT 101",
  )
    .bind(userId, after)
    .all<Row>();
  const rows = result.results.slice(0, 100);
  return {
    records: rows.map(decode),
    cursor: rows.at(-1)?.revision ?? after,
    hasMore: result.results.length > 100,
  } satisfies typeof SyncPage.Type;
}
