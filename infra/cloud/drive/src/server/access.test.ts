import * as NodeSqlite from "node:sqlite";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { linkOpensDocument } from "./access";
import type { Env } from "./types";

const databases: NodeSqlite.DatabaseSync[] = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

function fixture() {
  const database = new NodeSqlite.DatabaseSync(":memory:");
  databases.push(database);
  database.exec(`
    CREATE TABLE folder (id TEXT PRIMARY KEY, parent_id TEXT);
    CREATE TABLE artifact (id TEXT PRIMARY KEY, folder_id TEXT, state TEXT, archived_at TEXT);
    CREATE TABLE share_link (id TEXT PRIMARY KEY, folder_id TEXT, artifact_id TEXT);
    INSERT INTO folder VALUES ('root', NULL), ('nested', 'root'), ('outside', NULL);
    INSERT INTO artifact VALUES
      ('published', 'nested', 'published', NULL),
      ('draft', 'nested', 'draft', NULL),
      ('archived', 'nested', 'published', '2026-10-20'),
      ('outside', 'outside', 'published', NULL);
    INSERT INTO share_link VALUES ('folder-link', 'root', NULL), ('document-link', NULL, 'published');
  `);
  const env = {
    DB: {
      prepare: (sql: string) => ({
        bind: (...values: NodeSqlite.SQLInputValue[]) => ({
          first: async () => database.prepare(sql).get(...values) ?? null,
        }),
      }),
    },
  } as unknown as Env;
  return { env, database };
}

describe("public link scope", () => {
  it("opens published descendants without exposing drafts, archived or unrelated documents", async () => {
    const { env } = fixture();
    expect(await linkOpensDocument(env, "folder-link", "published")).toBe(true);
    for (const id of ["draft", "archived", "outside", "missing"])
      expect(await linkOpensDocument(env, "folder-link", id)).toBe(false);
    expect(await linkOpensDocument(env, "document-link", "published")).toBe(true);
    expect(await linkOpensDocument(env, "document-link", "outside")).toBe(false);
  });

  it("withdraws content access when the owner deletes the link or archives the document", async () => {
    const { env, database } = fixture();
    expect(await linkOpensDocument(env, "document-link", "published")).toBe(true);
    database.exec("DELETE FROM share_link WHERE id = 'document-link'");
    expect(await linkOpensDocument(env, "document-link", "published")).toBe(false);
    database.exec("UPDATE artifact SET archived_at = '2026-10-20' WHERE id = 'published'");
    expect(await linkOpensDocument(env, "folder-link", "published")).toBe(false);
  });
});
