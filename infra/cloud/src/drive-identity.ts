import { authorizeNewUser, normalizeEmail } from "../drive/src/server/auth-policy.ts";
import { HttpError } from "../drive/src/server/http.ts";
import type { Env } from "../drive/src/server/types.ts";

type AccountUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
};
type DriveUser = { id: string; name: string; email: string; banned: number | null };

/** Accept only a profile verified by Accounts, never browser-supplied identity fields. */
export async function ensureDriveIdentity(env: Env, user: AccountUser) {
  if (!user.emailVerified)
    throw new HttpError(403, "email_not_verified", "Verify your Otter account email first.");
  const deleted = await env.DB.prepare("SELECT subject FROM otter_identity_deleted WHERE subject=?")
    .bind(user.id)
    .first();
  if (deleted) throw new HttpError(403, "account_deleted", "This Otter account has been deleted.");

  const findLinked = () =>
    env.DB.prepare(
      "SELECT u.id,u.name,u.email,u.banned FROM account a JOIN user u ON u.id=a.userId WHERE a.providerId='otter' AND a.accountId=?",
    )
      .bind(user.id)
      .first<DriveUser>();
  let linked = await findLinked();
  if (!linked) {
    const now = new Date().toISOString();
    // D1 serializes the transaction. Subject guards make concurrent first calls
    // idempotent, including a concurrent OAuth callback or identity deletion.
    await env.DB.batch([
      env.DB.prepare(
        `INSERT OR IGNORE INTO user(id,name,email,emailVerified,image,createdAt,updatedAt,role)
         SELECT ?,?,?,1,?,?,?,?
         WHERE NOT EXISTS(SELECT 1 FROM otter_identity_deleted WHERE subject=?)
         AND NOT EXISTS(SELECT 1 FROM account WHERE providerId='otter' AND accountId=?)`,
      ).bind(
        user.id,
        user.name,
        normalizeEmail(user.email),
        user.image ?? null,
        now,
        now,
        await authorizeNewUser(env, user.email),
        user.id,
        user.id,
      ),
      env.DB.prepare(
        `INSERT INTO account(id,accountId,providerId,userId,createdAt,updatedAt)
         SELECT ?,?,'otter',u.id,?,? FROM user u
         WHERE u.id=? AND coalesce(u.banned,0)=0 AND u.emailVerified=1
         AND NOT EXISTS(SELECT 1 FROM otter_identity_deleted WHERE subject=?)
         AND NOT EXISTS(SELECT 1 FROM account WHERE providerId='otter' AND (accountId=? OR userId=?))`,
      ).bind(`cloud:otter:${user.id}`, user.id, now, now, user.id, user.id, user.id, user.id),
    ]);
    linked = await findLinked();
    if (!linked) {
      const banned = await env.DB.prepare(
        "SELECT id FROM user WHERE id=? AND coalesce(banned,0)!=0",
      )
        .bind(user.id)
        .first();
      if (banned) throw new HttpError(403, "account_banned", "Your Drive account is banned.");
      // An existing email is not proof of identity. Its owner needs an explicit
      // operator-verified migration, rather than an automatic account takeover.
      throw new HttpError(
        409,
        "identity_conflict",
        "An existing Drive identity needs an explicit account migration.",
      );
    }
  }
  if (linked.banned) throw new HttpError(403, "account_banned", "Your Drive account is banned.");

  // Match Drive's sign-in hook: verified-email invitations can now name this user.
  await env.DB.batch(
    ["drive_member", "share"].map((table) =>
      env.DB.prepare(
        `UPDATE ${table} SET user_id=? WHERE user_id IS NULL AND email=(SELECT lower(email) FROM user WHERE id=? AND emailVerified=1)`,
      ).bind(linked.id, linked.id),
    ),
  );
  return { id: linked.id, name: linked.name, email: linked.email };
}
