import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeSqlite from "node:sqlite";
import { expect, it } from "vite-plus/test";
import { MAIL_STORAGE_SCHEMA } from "@otterware/mail-engine/storage";
import { createFiles } from "./storage.ts";
import { importDesktop } from "./importDesktop.ts";

it("imports a WAL snapshot and attachments once, preserving the source and later destination edits", async () => {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "mail-import-test-"));
  const source = NodePath.join(root, "old"),
    home = NodePath.join(root, "new");
  await NodeFSP.mkdir(NodePath.join(source, "attachments"), { recursive: true });
  await NodeFSP.mkdir(home);
  const old = new NodeSqlite.DatabaseSync(NodePath.join(source, "mail-cache.db"));
  const db = new NodeSqlite.DatabaseSync(NodePath.join(root, "suite.sqlite"));
  try {
    old.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE messages(id TEXT PRIMARY KEY,body TEXT); INSERT INTO messages VALUES ('one','hello');",
    );
    await NodeFSP.writeFile(NodePath.join(source, "accounts.json"), '[{"id":"mailbox"}]');
    await NodeFSP.writeFile(NodePath.join(source, "attachments", "a.txt"), "original");
    db.exec(MAIL_STORAGE_SCHEMA);
    const files = createFiles(db, home),
      options = { profile: "mail", db, files, home, source };
    expect(await importDesktop({ ...options, profile: "otterware" })).toBe("skipped");
    expect(await importDesktop(options)).toBe("imported");
    expect(db.prepare("SELECT body FROM mail_messages").get()?.body).toBe("hello");
    expect(
      JSON.parse(new TextDecoder().decode((await files.read("accounts.json")) ?? undefined))[0].id,
    ).toBe("mailbox");
    await NodeFSP.writeFile(NodePath.join(home, "attachments", "a.txt"), "new");
    expect(await importDesktop(options)).toBe("skipped");
    expect(await NodeFSP.readFile(NodePath.join(home, "attachments", "a.txt"), "utf8")).toBe("new");
    expect(await NodeFSP.readFile(NodePath.join(source, "attachments", "a.txt"), "utf8")).toBe(
      "original",
    );
    expect(old.prepare("SELECT body FROM messages").get()?.body).toBe("hello");
  } finally {
    old.close();
    db.close();
    await NodeFSP.rm(root, { recursive: true, force: true });
  }
});
