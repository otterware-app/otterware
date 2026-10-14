import * as NodeSqlite from "node:sqlite";
import { expect, it } from "vite-plus/test";
import { createCloudSync, type SqlDatabase } from "@otterware/mail-engine";
import { MAIL_STORAGE_SCHEMA } from "@otterware/mail-engine/storage";
import type { OtterAccountSession } from "@otterware/mail-engine/account-session";
import type { SyncedRecord } from "@otterware/otter-cloud-client";
import { createFiles } from "./storage.ts";

it("keeps offline edits durable and lets newer local edits win while an older push is in flight", async () => {
  const db = new NodeSqlite.DatabaseSync(":memory:");
  db.exec(MAIL_STORAGE_SCHEMA);
  const files = createFiles(db, "/unused-mail-test-files");
  let resolvePush!: (value: { records: SyncedRecord[] }) => void;
  let sent!: () => void;
  const started = new Promise<void>((resolve) => {
    sent = resolve;
  });
  let outgoing: Parameters<OtterAccountSession["push"]>[0] = [];
  const session: OtterAccountSession = {
    accountId: "user",
    connections: async () => [],
    providerToken: async () => {
      throw new Error("unused");
    },
    subscribe: () => () => {},
    push: (rows) => {
      outgoing = rows;
      sent();
      return new Promise((resolve) => {
        resolvePush = resolve;
      });
    },
    pull: async () => ({ records: [], cursor: 3, hasMore: false }),
  };
  let time = 1;
  const sync = createCloudSync({
    db: db as unknown as SqlDatabase,
    files,
    session,
    now: () => time++,
    mutationId: () => `m${time}`,
    changed: () => {},
  });
  try {
    await sync.files.write("views.json", JSON.stringify([{ id: "view", name: "First" }]));
    const running = sync.sync();
    await started;
    await sync.files.write("views.json", JSON.stringify([{ id: "view", name: "Newer" }]));
    resolvePush({ records: outgoing.map((row) => ({ ...row, revision: 1 })) });
    await running;
    const current = db.prepare("SELECT value,pending FROM mail_sync_records WHERE id='view'").get();
    expect(JSON.parse(String(current?.value)).name).toBe("Newer");
    expect(current?.pending).toBe(1);
    session.push = async (rows) => ({ records: rows.map((row) => ({ ...row, revision: 2 })) });
    await sync.sync();
    expect(db.prepare("SELECT pending FROM mail_sync_records WHERE id='view'").get()?.pending).toBe(
      0,
    );
    await sync.files.write("views.json", "[]");
    session.push = async () => {
      throw new Error("offline");
    };
    await expect(sync.sync()).rejects.toThrow("offline");
    expect(
      db.prepare("SELECT value,pending FROM mail_sync_records WHERE id='view'").get(),
    ).toMatchObject({ value: "null", pending: 1 });
  } finally {
    db.close();
  }
});

it("syncs account preferences while preserving environment-only settings", async () => {
  const db = new NodeSqlite.DatabaseSync(":memory:");
  db.exec(MAIL_STORAGE_SCHEMA);
  const files = createFiles(db, "/unused-mail-test-files", "user");
  const session: OtterAccountSession = {
    accountId: "user",
    connections: async () => [],
    providerToken: async () => {
      throw new Error("unused");
    },
    subscribe: () => () => {},
    push: async (rows) => {
      expect(rows[0]?.value).toEqual({ notificationsMode: "all" });
      return { records: [] };
    },
    pull: async () => ({
      records: [
        {
          collection: "settings",
          id: "mail:settings.json",
          value: { notificationsMode: "none", launchAtLogin: false },
          modifiedAt: 100,
          mutationId: "remote",
          revision: 1,
        },
      ],
      cursor: 1,
      hasMore: false,
    }),
  };
  const sync = createCloudSync({
    db: db as unknown as SqlDatabase,
    files,
    session,
    now: () => 1,
    changed: () => {},
  });
  try {
    await sync.files.write(
      "settings.json",
      JSON.stringify({ notificationsMode: "all", launchAtLogin: true }),
    );
    await sync.sync();
    expect(JSON.parse(new TextDecoder().decode((await files.read("settings.json"))!))).toEqual({
      notificationsMode: "none",
      launchAtLogin: true,
    });
  } finally {
    db.close();
  }
});
