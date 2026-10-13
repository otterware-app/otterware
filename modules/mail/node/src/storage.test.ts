import * as NodeSqlite from "node:sqlite";
import { expect, it, vi } from "vite-plus/test";
import { mailStore, type SqlDatabase } from "@otterware/mail-engine";
import { mailDatabase, MAIL_STORAGE_SCHEMA } from "@otterware/mail-engine/storage";
import { createFiles } from "./storage.ts";

const connection = vi.hoisted(() => ({ db: undefined as SqlDatabase | undefined }));
vi.mock("../../engine/src/platform.ts", () => ({
  platform: () => ({ database: () => connection.db }),
  setPlatform: () => {},
}));

it("stores and searches the retained cache in namespaced tables without touching host tables", () => {
  const db = new NodeSqlite.DatabaseSync(":memory:");
  connection.db = mailDatabase(db as unknown as SqlDatabase);
  try {
    db.exec("CREATE TABLE messages (host_value TEXT); INSERT INTO messages VALUES ('host');");
    mailStore.upsertMessages("mailbox", [
      {
        id: "message",
        threadId: "thread",
        fromName: "Someone",
        fromEmail: "a@example.test",
        to: "b@example.test",
        subject: "Searchable otter",
        snippet: "body",
        date: 1,
        unread: true,
        starred: false,
        hasAttachments: false,
        labelIds: ["INBOX"],
      },
    ]);
    expect(mailStore.searchMessages("otter", "mailbox", 0, 10).messages).toMatchObject([
      { id: "message" },
    ]);
    expect(mailStore.countInboxUnreadAll()).toBe(1);
    mailStore.deleteMessage("mailbox", "message");
    expect(mailStore.searchMessages("otter", "mailbox", 0, 10).messages).toEqual([]);
    expect(db.prepare("SELECT host_value FROM messages").get()?.host_value).toBe("host");
  } finally {
    db.close();
  }
});

it("isolates account projects and views when an environment changes account", async () => {
  const db = new NodeSqlite.DatabaseSync(":memory:");
  db.exec(MAIL_STORAGE_SCHEMA);
  try {
    const first = createFiles(db, "/unused-mail-test-files", "first");
    const second = createFiles(db, "/unused-mail-test-files", "second");
    await first.write("projects.json", '{"projects":[{"id":"private"}]}');
    await first.write("views.json", '[{"id":"private-view"}]');
    expect(await second.read("projects.json")).toBeNull();
    expect(await second.read("views.json")).toBeNull();
    await second.write("views.json", "[]");
    expect(new TextDecoder().decode((await first.read("views.json"))!)).toContain("private-view");
  } finally {
    db.close();
  }
});
