import * as NodeWorkerThreads from "node:worker_threads";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeSqlite from "node:sqlite";
import * as NodeAsyncHooks from "node:async_hooks";
import * as Schema from "effect/Schema";
import { MailEvent } from "@otterware/mail-contracts/rpc";
import {
  startCore,
  setPlatform,
  registeredHandlers,
  runAgentTool,
  accountGoogleAuth,
  accountMicrosoftAuth,
  createCloudSync,
  syncAccount,
  renewWatch,
  accountStore,
  invalidateProjectCache,
  type Platform,
  type SqlDatabase,
  type ToolCaller,
} from "@otterware/mail-engine";
import { mailDatabase, MAIL_STORAGE_SCHEMA } from "@otterware/mail-engine/storage";
import type { OtterAccountSession } from "@otterware/mail-engine/account-session";
import { createFiles, createSecrets, inHome } from "./storage.ts";
import { importDesktop } from "./importDesktop.ts";
import { localGoogleAuth } from "./googleAuth.ts";
import { connectMailSocket } from "./mail-socket.ts";
import type { FromWorker, ToWorker, WorkerOptions } from "./protocol.ts";

const isMailEvent = Schema.is(MailEvent);
const port = NodeWorkerThreads.parentPort!;
const options = NodeWorkerThreads.workerData as WorkerOptions;
const post = (value: FromWorker) => port.postMessage(value);
let nextId = 0;
const hostRequests = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (error: Error) => void }
>();
function host<T>(operation: string, ...args: unknown[]): Promise<T> {
  const id = ++nextId;
  return new Promise<T>((resolve, reject) => {
    hostRequests.set(id, { resolve: (value) => resolve(value as T), reject });
    post({ type: "host", id, operation, args });
  });
}
const listeners = new Set<Parameters<OtterAccountSession["subscribe"]>[0]>();
const session: OtterAccountSession | undefined = options.accountId
  ? {
      accountId: options.accountId,
      connections: () => host("connections"),
      providerToken: (id) => host("providerToken", id),
      push: (records) => host("push", records),
      pull: (cursor) => host("pull", cursor),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    }
  : undefined;
const callers = new Map<string, ToolCaller>();
let db: NodeSqlite.DatabaseSync;
let ready = false;

port.on("message", (message: ToWorker) => {
  if (message.type === "hostResult") {
    const waiting = hostRequests.get(message.id);
    hostRequests.delete(message.id);
    if (message.error) waiting?.reject(new Error(message.error));
    else waiting?.resolve(message.value);
    return;
  }
  if (message.type === "cloudEvent") {
    for (const listener of listeners) listener(message.event);
    return;
  }
  void (async () => {
    if (!ready) throw new Error("Mail is not ready.");
    if (message.type === "call") {
      const handler = registeredHandlers().get(message.operation);
      if (!handler)
        throw new Error(`Mail operation ${message.operation} is unavailable on this host.`);
      return handler(message.input);
    }
    const access =
      message.caller.access === "full-access"
        ? "full-access"
        : message.caller.access === "read-only"
          ? "read-only"
          : "safe";
    const key = `${message.caller.environmentId}:${message.caller.threadId ?? "external"}:${access}`;
    let caller = callers.get(key);
    if (!caller) {
      caller = {
        mode: () => "full-access",
        turn: () => null,
        access: () => access,
        files: {
          async save(name, bytes) {
            const file = inHome(
              NodePath.join(options.stateDir, "mail"),
              `agent-attachments/${crypto.randomUUID()}/${NodePath.basename(name)}`,
            );
            await NodeFSP.mkdir(NodePath.dirname(file), { recursive: true, mode: 0o700 });
            await NodeFSP.writeFile(file, bytes, { mode: 0o600 });
            return file;
          },
          async read(path) {
            // External MCP clients cannot use mail tools to read arbitrary host files.
            const root = NodePath.join(options.stateDir, "mail", "agent-attachments");
            const resolved = await NodeFSP.realpath(path);
            if (!message.caller.threadId && !resolved.startsWith(root + NodePath.sep))
              throw new Error("Attachment is outside this client's Mail files.");
            return {
              name: NodePath.basename(path),
              bytes: new Uint8Array(await NodeFSP.readFile(resolved)),
            };
          },
        },
      };
      callers.set(key, caller);
    }
    if (!message.input || typeof message.input !== "object" || Array.isArray(message.input))
      throw new Error("Tool arguments must be an object.");
    const result = await runAgentTool(
      caller,
      message.name,
      message.input as Record<string, unknown>,
    );
    if (result.isError) throw new Error(result.text);
    return JSON.parse(result.text) as unknown;
  })().then(
    (value) => post({ type: "result", id: message.id, value }),
    (error) =>
      post({
        type: "result",
        id: message.id,
        error: error instanceof Error ? error.message : String(error),
      }),
  );
});

async function start() {
  const home = NodePath.join(options.stateDir, "mail");
  await NodeFSP.mkdir(home, { recursive: true, mode: 0o700 });
  db = new NodeSqlite.DatabaseSync(NodePath.join(options.stateDir, "suite.sqlite"));
  db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
  db.exec(MAIL_STORAGE_SCHEMA);
  let files = createFiles(db, home);
  await importDesktop({ profile: options.profile, db, files, home, source: options.legacyHome });
  if (session) {
    // Only the first signed-in account may adopt pre-account local documents.
    if (!db.prepare("SELECT 1 FROM mail_documents WHERE name='account-document-owner'").get()) {
      db.exec("BEGIN IMMEDIATE");
      try {
        for (const name of [
          "projects.json",
          "views.json",
          "ui-preferences.json",
          "settings.json",
          "keybindings.json",
        ]) {
          db.prepare(
            "INSERT OR IGNORE INTO mail_documents(name,value) SELECT ?,value FROM mail_documents WHERE name=?",
          ).run(`account:${session.accountId}:${name}`, name);
        }
        db.prepare(
          "INSERT INTO mail_documents(name,value) VALUES ('account-document-owner',?)",
        ).run(new TextEncoder().encode(session.accountId));
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }
    files = createFiles(db, home, session.accountId);
  }
  const secrets = await createSecrets(files, home);
  const google = localGoogleAuth({
    secrets,
    clientId: options.googleClientId,
    clientSecret: options.googleClientSecret,
    authorize: (url) => host("authorize", url),
  });
  let sync: ReturnType<typeof createCloudSync> | undefined;
  const broadcast: Platform["broadcast"] = (channel, params) => {
    const event = { channel, params };
    if (isMailEvent(event)) post({ type: "event", event });
  };
  if (session) {
    sync = createCloudSync({
      db: db as unknown as SqlDatabase,
      files,
      session,
      changed: (name) => {
        if (name === "projects.json") invalidateProjectCache();
        broadcast(
          name === "projects.json"
            ? "projects:changed"
            : name === "views.json"
              ? "gmail:views-changed"
              : "settings:changed",
        );
      },
    });
    files = sync.files;
  }
  const platform: Platform = {
    kind: "desktop",
    appVersion: "otterware",
    database: () => mailDatabase(db as unknown as SqlDatabase),
    files,
    secrets,
    microsoft: session ? accountMicrosoftAuth(session) : undefined,
    google: session ? accountGoogleAuth(session, google) : google,
    userFiles: {
      open: (name, bytes) => host("openFile", name, bytes),
      save: (name, bytes) => host("saveFile", name, bytes),
      pick: () => host("pickFiles"),
    },
    connect: connectMailSocket,
    relayUrl: "https://accounts.otterware.app",
    relaySession: "bearer",
    broadcast,
    notify: (notification) => void host("notify", notification).catch(() => {}),
    setUnreadCount: (count) => broadcast("gmail:unread-count", count),
    onResume: () => () => {},
    asyncContext<T>() {
      const context = new NodeAsyncHooks.AsyncLocalStorage<T>();
      return {
        run: <R>(value: T, fn: () => R) => context.run(value, fn),
        get: () => context.getStore(),
      };
    },
    offlineDownloads: true,
    log: () => {},
  };
  setPlatform(platform);
  await startCore(platform, { hostAccount: true });
  if (session) {
    session.subscribe((event) => {
      if (event.type === "module.push" && event.module === "mail") {
        const push = event.event as { type?: string; email?: string };
        if (push.type === "mail" && typeof push.email === "string")
          void syncAccount(push.email, { force: true });
      }
      if (event.type === "connections.changed") {
        void platform.google.load().catch(() => {});
        void platform.microsoft?.load().catch(() => {});
      }
      if (event.type === "sync.changed") void sync?.sync().catch(() => {});
    });
    const renew = async () => {
      if (!options.gmailPushTopic) return;
      for (const account of await accountStore.listAccounts()) {
        if ((account.provider ?? "gmail") === "gmail" && platform.google.isSignedIn(account.id))
          await renewWatch(account.id, options.gmailPushTopic);
      }
    };
    void renew().catch(() => {});
    setInterval(() => void renew().catch(() => {}), 60 * 60_000).unref();
    void sync?.sync().catch(() => {});
    // Also retries offline outbox writes and missed notifications; worker termination owns this timer.
    setInterval(() => void sync?.sync().catch(() => {}), 30_000).unref();
  }
  ready = true;
  post({ type: "ready" });
}
void start().catch((error) =>
  post({ type: "fatal", error: error instanceof Error ? error.message : String(error) }),
);
