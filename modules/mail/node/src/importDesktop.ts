import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeOS from "node:os";
import * as NodeSqlite from "node:sqlite";
import { MAIL_TABLES, mailSql } from "@otterware/mail-engine/storage";
import type { Platform } from "@otterware/mail-engine";

const documents = [
  "accounts.json",
  "settings.json",
  "views.json",
  "projects.json",
  "keybindings.json",
  "ui-preferences.json",
];
const attachments = [
  "attachments",
  "attachment-cache",
  "assistant-attachments",
  "agent-attachments",
];

/** A consistent read-only snapshot, never a live-file copy or a modification of the old install. */
export async function importDesktop(input: {
  profile: string;
  db: NodeSqlite.DatabaseSync;
  files: Platform["files"];
  home: string;
  source?: string;
}): Promise<"imported" | "skipped"> {
  if (input.profile !== "mail") return "skipped";
  const source = NodePath.resolve(
    input.source ?? NodePath.join(NodeOS.homedir(), ".otter-mail/userdata"),
  );
  if (input.db.prepare("SELECT 1 FROM mail_imports WHERE source=?").get(source)) return "skipped";
  // Never overwrite a module already used before migration became available.
  if (input.db.prepare("SELECT 1 FROM mail_documents LIMIT 1").get()) return "skipped";
  const sourceDb = NodePath.join(source, "mail-cache.db");
  try {
    await NodeFSP.access(sourceDb);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "skipped";
    throw error;
  }
  const stage = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "otter-mail-import-"));
  const snapshot = NodePath.join(stage, "mail.db");
  try {
    const old = new NodeSqlite.DatabaseSync(sourceDb, { readOnly: true });
    try {
      await NodeSqlite.backup(old, snapshot);
    } finally {
      old.close();
    }
    const copied: Array<[string, Uint8Array]> = [];
    for (const name of documents) {
      try {
        copied.push([name, new Uint8Array(await NodeFSP.readFile(NodePath.join(source, name)))]);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    // Copy before committing the marker: a failed copy is retried. Existing destination bytes win.
    for (const name of attachments) {
      try {
        await NodeFSP.cp(NodePath.join(source, name), NodePath.join(input.home, name), {
          recursive: true,
          force: false,
          errorOnExist: false,
          filter: async (path) => !(await NodeFSP.lstat(path)).isSymbolicLink(),
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    input.db.prepare("ATTACH DATABASE ? AS old_mail").run(snapshot);
    try {
      input.db.exec("BEGIN IMMEDIATE");
      try {
        for (const table of MAIL_TABLES) {
          if (table === "messages_fts") continue; // Rebuilt by the engine from imported message rows.
          const row = input.db
            .prepare("SELECT sql FROM old_mail.sqlite_master WHERE type='table' AND name=?")
            .get(table);
          if (!row?.sql) continue;
          input.db.exec(
            mailSql(String(row.sql)).replace(/^CREATE TABLE /i, "CREATE TABLE IF NOT EXISTS "),
          );
          if (input.db.prepare(`SELECT 1 FROM mail_${table} LIMIT 1`).get())
            throw new Error("Mail cache already contains data; import refused.");
          input.db.exec(`INSERT INTO mail_${table} SELECT * FROM old_mail.${table}`);
        }
        for (const [name, value] of copied)
          input.db.prepare("INSERT INTO mail_documents(name,value) VALUES (?,?)").run(name, value);
        input.db
          .prepare("INSERT INTO mail_imports(source,imported_at) VALUES (?,?)")
          .run(source, Date.now());
        input.db.exec("COMMIT");
      } catch (error) {
        input.db.exec("ROLLBACK");
        throw error;
      }
    } finally {
      input.db.exec("DETACH DATABASE old_mail");
    }
    return "imported";
  } finally {
    await NodeFSP.rm(stage, { recursive: true, force: true });
  }
}
