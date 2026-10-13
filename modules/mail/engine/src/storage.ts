import type { SqlDatabase } from "./platform.ts";

export const MAIL_TABLES = [
  "messages",
  "message_labels",
  "labels",
  "sync_state",
  "kv",
  "messages_fts",
] as const;

/** Translate only SQL identifiers; values and column names retain their original meaning. */
export function mailSql(sql: string): string {
  return sql
    .replace(
      /'(?:''|[^'])*'|\b(?:messages_fts(?:_\w+)?|message_labels|messages|labels|sync_state|kv|idx_messages_\w+|idx_mlabels_\w+)\b/g,
      (token) => (token.startsWith("'") ? token : `mail_${token}`),
    )
    .replace(/content='messages'/g, "content='mail_messages'")
    .replace(/name = 'messages_fts'/g, "name = 'mail_messages_fts'")
    .replace(
      /pragma_table_info\('(messages|labels|sync_state|kv)'\)/g,
      "pragma_table_info('mail_$1')",
    );
}

/** The retained Mail cache shares suite.sqlite without claiming another module's table names. */
export const mailDatabase = (db: SqlDatabase): SqlDatabase => ({
  exec: (sql) => db.exec(mailSql(sql)),
  prepare: (sql) => db.prepare(mailSql(sql)),
});

export const MAIL_STORAGE_SCHEMA = `
CREATE TABLE IF NOT EXISTS mail_documents (name TEXT PRIMARY KEY, value BLOB NOT NULL);
CREATE TABLE IF NOT EXISTS mail_imports (source TEXT PRIMARY KEY, imported_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS mail_sync_records (
  account_id TEXT NOT NULL, collection TEXT NOT NULL, id TEXT NOT NULL,
  value TEXT NOT NULL, modified_at INTEGER NOT NULL, mutation_id TEXT NOT NULL,
  pending INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(account_id, collection, id)
);
CREATE TABLE IF NOT EXISTS mail_sync_cursors (account_id TEXT PRIMARY KEY, cursor INTEGER NOT NULL);
`;
