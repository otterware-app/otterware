/**
 * Mail's storage in the browser (ADR 0008): the mail cache and its JSON
 * documents in SQLite in WASM on OPFS, other files (attachment caches) as
 * OPFS files, and secrets sealed with a non-extractable WebCrypto key kept in
 * IndexedDB. Mail's worker owns its own OPFS pool, so it never contends with
 * the environment worker's `suite.sqlite`.
 */
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import type { FileInfo, Platform, SqlDatabase, SqlValue } from "@otterware/mail-engine";

/** Mail's own pool; one tab at a time owns it, like the environment's. */
const POOL = "otterware-mail";

export async function openMailDatabase(): Promise<SqlDatabase> {
  const sqlite3 = await sqlite3InitModule();
  const pool = await sqlite3.installOpfsSAHPoolVfs({ name: POOL });
  const db = new pool.OpfsSAHPoolDb("/mail.sqlite");
  const bind = (params: SqlValue[]) => (params.length > 0 ? (params as never) : undefined);
  return {
    exec: (sql) => void db.exec(sql),
    prepare: (sql) => ({
      get: (...params) => db.selectObject(sql, bind(params)) as Record<string, SqlValue>,
      all: (...params) => db.selectObjects(sql, bind(params)) as Record<string, SqlValue>[],
      run: (...params) => {
        db.exec(sql, { bind: bind(params) });
        return { changes: db.changes() };
      },
    }),
  };
}

const ACCOUNT_DOCUMENTS = new Set([
  "projects.json",
  "views.json",
  "ui-preferences.json",
  "settings.json",
  "keybindings.json",
]);
const isDocument = (name: string) => /^[^/\\]+\.json$/.test(name);

function split(path: string): { dirs: string[]; name: string } {
  const parts = path.split("/").filter((part) => part !== "" && part !== ".");
  if (parts.includes("..")) throw new Error("Path escapes Mail's files.");
  return { dirs: parts.slice(0, -1), name: parts.at(-1) ?? "" };
}

async function directory(path: string[], create: boolean): Promise<FileSystemDirectoryHandle> {
  let dir = await (
    await navigator.storage.getDirectory()
  ).getDirectoryHandle("mail-files", {
    create: true,
  });
  for (const name of path) dir = await dir.getDirectoryHandle(name, { create });
  return dir;
}

/**
 * Root JSON documents live in SQLite, under the account when one is signed
 * in (as on an environment); other files are OPFS files.
 */
export function createFiles(db: SqlDatabase, accountId?: string): Platform["files"] {
  const key = (name: string) =>
    accountId && ACCOUNT_DOCUMENTS.has(name) ? `account:${accountId}:${name}` : name;
  return {
    async read(path) {
      if (isDocument(path)) {
        const row = db.prepare("SELECT value FROM mail_documents WHERE name = ?").get(key(path));
        return row ? new Uint8Array(row.value as Uint8Array) : null;
      }
      try {
        const { dirs, name } = split(path);
        const file = await (await (await directory(dirs, false)).getFileHandle(name)).getFile();
        return new Uint8Array(await file.arrayBuffer());
      } catch {
        return null;
      }
    },
    async write(path, data) {
      const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
      if (isDocument(path)) {
        db.prepare(
          "INSERT INTO mail_documents(name,value) VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value",
        ).run(key(path), bytes);
        return;
      }
      const { dirs, name } = split(path);
      const handle = await (await directory(dirs, true)).getFileHandle(name, { create: true });
      // Sync access handles work in every browser's workers; writable streams don't yet.
      const access = await (
        handle as FileSystemFileHandle & {
          createSyncAccessHandle(): Promise<{
            truncate(size: number): void;
            write(data: Uint8Array, options: { at: number }): number;
            flush(): void;
            close(): void;
          }>;
        }
      ).createSyncAccessHandle();
      try {
        access.truncate(0);
        access.write(bytes, { at: 0 });
        access.flush();
      } finally {
        access.close();
      }
    },
    async remove(path) {
      if (isDocument(path)) {
        db.prepare("DELETE FROM mail_documents WHERE name = ?").run(key(path));
        return;
      }
      const { dirs, name } = split(path);
      await (await directory(dirs, false)).removeEntry(name).catch(() => {});
    },
    async list(path) {
      const out: FileInfo[] = [];
      try {
        const parts = path.split("/").filter((part) => part !== "" && part !== ".");
        if (parts.includes("..")) return out;
        const dir = await directory(parts, false);
        for await (const handle of (
          dir as unknown as { values(): AsyncIterable<FileSystemHandle> }
        ).values()) {
          if (handle.kind !== "file") continue;
          const file = await (handle as FileSystemFileHandle).getFile();
          out.push({ name: handle.name, size: file.size, modifiedAt: file.lastModified });
        }
      } catch {
        // no such folder yet
      }
      return out;
    },
  };
}

const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.addEventListener("success", () => resolve(req.result));
    req.addEventListener("error", () => reject(req.error));
  });

/** A key the worker can use but no script can read out, made once per origin. */
async function loadKey(): Promise<CryptoKey> {
  const open = indexedDB.open("otterware-mail-secrets", 1);
  open.addEventListener("upgradeneeded", () => open.result.createObjectStore("keys"));
  const db = await request(open);
  const stored = () =>
    request<CryptoKey | undefined>(db.transaction("keys").objectStore("keys").get("key"));
  try {
    const existing = await stored();
    if (existing) return existing;
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
      "encrypt",
      "decrypt",
    ]);
    const added = await request(
      db.transaction("keys", "readwrite").objectStore("keys").add(key, "key"),
    )
      .then(() => true)
      .catch(() => false);
    return added ? key : ((await stored()) ?? key);
  } finally {
    db.close();
  }
}

const toBase64 = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

/** IMAP passwords and the like, each sealed with AES-GCM in Mail's files. */
export function createSecrets(files: Platform["files"]): Platform["secrets"] {
  let key: Promise<CryptoKey> | null = null;
  const keyNow = () => (key ??= loadKey());
  const FILE = "secrets.json";

  const seal = async (value: string) => {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const sealed = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        await keyNow(),
        new TextEncoder().encode(value),
      ),
    );
    const out = new Uint8Array(iv.length + sealed.length);
    out.set(iv);
    out.set(sealed, iv.length);
    return toBase64(out);
  };
  const open = async (value: string) => {
    const bytes = fromBase64(value);
    try {
      return new TextDecoder().decode(
        await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: bytes.subarray(0, 12) },
          await keyNow(),
          bytes.subarray(12),
        ),
      );
    } catch {
      return null;
    }
  };
  const readAll = async () => {
    const bytes = await files.read(FILE);
    return bytes ? (JSON.parse(new TextDecoder().decode(bytes)) as Record<string, string>) : {};
  };
  // One change at a time: each rewrites the whole file.
  let queue: Promise<unknown> = Promise.resolve();
  const inTurn = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work);
    queue = next.catch(() => {});
    return next;
  };
  return {
    get: (name) =>
      inTurn(async () => {
        const value = (await readAll())[name];
        return value === undefined ? null : open(value);
      }),
    set: (name, value) =>
      inTurn(async () =>
        files.write(FILE, JSON.stringify({ ...(await readAll()), [name]: await seal(value) })),
      ),
    delete: (name) =>
      inTurn(async () => {
        const { [name]: _removed, ...rest } = await readAll();
        await files.write(FILE, JSON.stringify(rest));
      }),
  };
}
