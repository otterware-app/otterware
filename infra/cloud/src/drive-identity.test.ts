import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { Database } from "../drive/src/server/test-database.ts";
import type { Env } from "../drive/src/server/types.ts";
import { ensureDriveIdentity } from "./drive-identity.ts";

let database: Database;
let env: Env;
const profile = { id: "subject", name: "New User", email: "New@Example.com", emailVerified: true };
const insertUser = (id: string, email: string) =>
  database.sqlite
    .prepare(
      "INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,'2026-01-01','2026-01-01')",
    )
    .run(id, id, email);
const linkUser = (subject: string, id: string) =>
  database.sqlite
    .prepare(
      "INSERT INTO account(id,accountId,providerId,userId,createdAt,updatedAt) VALUES(?,?,'otter',?,'2026-01-01','2026-01-01')",
    )
    .run(`link-${subject}`, subject, id);
beforeEach(() => {
  database = new Database();
  env = { DB: database as unknown as D1Database, ADMIN_EMAIL: "admin@example.com" } as Env;
});
afterEach(() => database.sqlite.close());

describe("Cloud Drive identity provisioning", () => {
  it("creates one canonical identity and link without persisting sessions or credentials", async () => {
    expect(await ensureDriveIdentity(env, profile)).toEqual({
      id: "subject",
      name: "New User",
      email: "new@example.com",
    });
    await ensureDriveIdentity(env, profile);
    expect(database.sqlite.prepare("SELECT id,emailVerified,role FROM user").all()).toEqual([
      { id: "subject", emailVerified: 1, role: "user" },
    ]);
    expect(
      database.sqlite
        .prepare("SELECT accountId,providerId,userId,accessToken,refreshToken FROM account")
        .all(),
    ).toEqual([
      {
        accountId: "subject",
        providerId: "otter",
        userId: "subject",
        accessToken: null,
        refreshToken: null,
      },
    ]);
    expect(database.sqlite.prepare("SELECT * FROM session").all()).toEqual([]);
  });

  it("preserves existing subject links and uses the linked Drive profile", async () => {
    insertUser("legacy-id", "original@example.com");
    linkUser("subject", "legacy-id");
    expect(await ensureDriveIdentity(env, profile)).toEqual({
      id: "legacy-id",
      name: "legacy-id",
      email: "original@example.com",
    });
    expect(database.sqlite.prepare("SELECT id FROM user").all()).toEqual([{ id: "legacy-id" }]);
  });

  it("links an existing canonical subject and claims only its verified-email invitations", async () => {
    insertUser("subject", "new@example.com");
    insertUser("owner", "owner@example.com");
    database.exec(`
      INSERT INTO folder(id,name,slug,owner_user_id,kind,created_at,updated_at) VALUES('team','Team','team','owner','shared','2026-01-01','2026-01-01');
      INSERT INTO drive_member(id,drive_id,email,role,created_at) VALUES('member','team','new@example.com','viewer','2026-01-01');
      INSERT INTO share(id,folder_id,email,role,created_at,updated_at) VALUES('share','team','new@example.com','viewer','2026-01-01','2026-01-01');
      INSERT INTO share(id,folder_id,email,role,created_at,updated_at) VALUES('other','team','other@example.com','viewer','2026-01-01','2026-01-01');
    `);
    await ensureDriveIdentity(env, profile);
    expect(
      database.sqlite.prepare("SELECT user_id FROM drive_member WHERE id='member'").get(),
    ).toEqual({ user_id: "subject" });
    expect(database.sqlite.prepare("SELECT user_id FROM share WHERE id='share'").get()).toEqual({
      user_id: "subject",
    });
    expect(database.sqlite.prepare("SELECT user_id FROM share WHERE id='other'").get()).toEqual({
      user_id: null,
    });
  });

  it("retains Drive's administrator policy for a verified first-time user", async () => {
    await ensureDriveIdentity(env, { ...profile, email: "ADMIN@example.com" });
    expect(database.sqlite.prepare("SELECT role FROM user").get()).toEqual({ role: "admin" });
  });

  it("rejects unverified and deleted subjects without creating an identity", async () => {
    await expect(
      ensureDriveIdentity(env, { ...profile, emailVerified: false }),
    ).rejects.toMatchObject({ status: 403, code: "email_not_verified" });
    database.exec(
      "INSERT INTO otter_identity_deleted(subject,deletedAt) VALUES('subject','2026-01-01')",
    );
    await expect(ensureDriveIdentity(env, profile)).rejects.toMatchObject({
      status: 403,
      code: "account_deleted",
    });
    expect(database.sqlite.prepare("SELECT * FROM user").all()).toEqual([]);
    expect(database.sqlite.prepare("SELECT * FROM account").all()).toEqual([]);
  });

  it("rejects banned identities with and without a subject link", async () => {
    insertUser("subject", "new@example.com");
    database.exec("UPDATE user SET banned=1");
    await expect(ensureDriveIdentity(env, profile)).rejects.toMatchObject({
      status: 403,
      code: "account_banned",
    });
    expect(database.sqlite.prepare("SELECT * FROM account").all()).toEqual([]);
    linkUser("subject", "subject");
    await expect(ensureDriveIdentity(env, profile)).rejects.toMatchObject({
      status: 403,
      code: "account_banned",
    });
  });

  it("does not take over an existing identity by matching its email", async () => {
    insertUser("legacy-id", "new@example.com");
    await expect(ensureDriveIdentity(env, profile)).rejects.toMatchObject({
      status: 409,
      code: "identity_conflict",
    });
    expect(database.sqlite.prepare("SELECT id FROM user").all()).toEqual([{ id: "legacy-id" }]);
    expect(database.sqlite.prepare("SELECT * FROM account").all()).toEqual([]);
  });

  it("does not remap a canonical user already linked to a different Otter subject", async () => {
    insertUser("subject", "new@example.com");
    linkUser("different-subject", "subject");
    await expect(ensureDriveIdentity(env, profile)).rejects.toMatchObject({
      status: 409,
      code: "identity_conflict",
    });
    expect(database.sqlite.prepare("SELECT accountId,userId FROM account").all()).toEqual([
      { accountId: "different-subject", userId: "subject" },
    ]);
  });
});
