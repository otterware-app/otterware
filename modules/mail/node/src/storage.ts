import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeCrypto from "node:crypto";
import type * as NodeSqlite from "node:sqlite";
import type { Platform } from "@otterware/mail-engine";

export function inHome(home: string, relative: string): string {
  const root = NodePath.resolve(home),
    path = NodePath.resolve(root, relative);
  if (path === root || !path.startsWith(`${root}${NodePath.sep}`))
    throw new Error("Path escapes Mail data home.");
  return path;
}
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT";

/** Root JSON documents live in SQLite; attachment bytes stay in the module's own directory. */
export function createFiles(
  db: NodeSqlite.DatabaseSync,
  home: string,
  accountId?: string,
): Platform["files"] {
  const accountDocuments = new Set([
    "projects.json",
    "views.json",
    "ui-preferences.json",
    "settings.json",
    "keybindings.json",
  ]);
  const key = (name: string) =>
    accountId && accountDocuments.has(name) ? `account:${accountId}:${name}` : name;
  const document = (name: string) => /^[^/\\]+\.json$/.test(name);
  return {
    async read(name) {
      const path = inHome(home, name);
      if (document(name)) {
        const row = db.prepare("SELECT value FROM mail_documents WHERE name = ?").get(key(name));
        return row ? new Uint8Array(row.value as Uint8Array) : null;
      }
      try {
        return new Uint8Array(await NodeFSP.readFile(path));
      } catch (error) {
        if (missing(error)) return null;
        throw error;
      }
    },
    async write(name, value) {
      const path = inHome(home, name);
      const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
      if (document(name)) {
        db.prepare(
          "INSERT INTO mail_documents(name,value) VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value",
        ).run(key(name), bytes);
        return;
      }
      await NodeFSP.mkdir(NodePath.dirname(path), { recursive: true, mode: 0o700 });
      const temp = `${path}.${NodeCrypto.randomUUID()}.tmp`;
      await NodeFSP.writeFile(temp, bytes, { mode: 0o600 });
      await NodeFSP.rename(temp, path);
    },
    async remove(name) {
      const path = inHome(home, name);
      if (document(name)) db.prepare("DELETE FROM mail_documents WHERE name=?").run(key(name));
      else await NodeFSP.rm(path, { force: true });
    },
    async list(dir) {
      const path = inHome(home, dir);
      let names: string[];
      try {
        names = await NodeFSP.readdir(path);
      } catch (error) {
        if (missing(error)) return [];
        throw error;
      }
      const files = await Promise.all(
        names.map(async (name) => {
          const stat = await NodeFSP.lstat(NodePath.join(path, name));
          return stat.isFile() ? { name, size: stat.size, modifiedAt: stat.mtimeMs } : null;
        }),
      );
      return files.filter((x) => x !== null);
    },
  };
}

/** A local-only key protects refresh tokens on an environment without an account session. */
export async function createSecrets(
  files: Platform["files"],
  home: string,
): Promise<Platform["secrets"]> {
  await NodeFSP.mkdir(home, { recursive: true, mode: 0o700 });
  const keyPath = NodePath.join(home, "secret.key");
  try {
    await NodeFSP.writeFile(keyPath, NodeCrypto.randomBytes(32), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const key = await NodeFSP.readFile(keyPath);
  let writes: Promise<unknown> = Promise.resolve();
  const read = async () =>
    JSON.parse(
      new TextDecoder().decode(
        (await files.read("secrets.json")) ?? new TextEncoder().encode("{}"),
      ),
    ) as Record<string, string>;
  const mutate = (edit: (values: Record<string, string>) => void) => {
    const next = writes.then(async () => {
      const values = await read();
      edit(values);
      await files.write("secrets.json", JSON.stringify(values));
    });
    writes = next.catch(() => {});
    return next;
  };
  return {
    async get(name) {
      await writes;
      const value = (await read())[name];
      if (!value) return null;
      const bytes = Buffer.from(value, "base64");
      const cipher = NodeCrypto.createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
      cipher.setAuthTag(bytes.subarray(12, 28));
      return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString("utf8");
    },
    set: (name, value) =>
      mutate((values) => {
        const iv = NodeCrypto.randomBytes(12),
          cipher = NodeCrypto.createCipheriv("aes-256-gcm", key, iv);
        const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
        values[name] = Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
      }),
    delete: (name) =>
      mutate((values) => {
        delete values[name];
      }),
  };
}
