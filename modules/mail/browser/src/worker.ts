/// <reference lib="webworker" />
/**
 * Mail's engine in the browser (ADR 0008): a worker the in-browser
 * environment's worker spawns while the Mail module is on and terminates when
 * it turns off, the way an environment runs Mail in a Node worker. The engine
 * keeps process-wide state and timers, so its lifetime is the worker's.
 * Gmail comes from the Otter Account's provider connections; IMAP and SMTP go
 * through Otter Cloud's tunnel with TLS done here.
 */
import { MailEvent } from "@otterware/mail-contracts/rpc";
import {
  accountGoogleAuth,
  accountStore,
  createCloudSync,
  invalidateProjectCache,
  registeredHandlers,
  runAgentTool,
  startCore,
  syncAccount,
  type GmailAccount,
  type GoogleAuth,
  type PickedFile,
  type Platform,
  type ToolCaller,
} from "@otterware/mail-engine";
import type { OtterAccountSession } from "@otterware/mail-engine/account-session";
import { mailDatabase, MAIL_STORAGE_SCHEMA } from "@otterware/mail-engine/storage";
import * as Schema from "effect/Schema";

import { connectMailSocket } from "./mail-socket.ts";
import type { FromWorker, ToWorker, WorkerOptions } from "./protocol.ts";
import { createFiles, createSecrets, openMailDatabase } from "./storage.ts";

declare const self: DedicatedWorkerGlobalScope;

const isMailEvent = Schema.is(MailEvent);
// oxlint-disable-next-line unicorn/require-post-message-target-origin -- A worker port has no origin.
const post = (message: FromWorker) => self.postMessage(message);

let nextId = 0;
const hostRequests = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (error: Error) => void }
>();
/** Asks the environment worker for something only it has: the account's Cloud session. */
function host<T>(operation: string, ...args: unknown[]): Promise<T> {
  const id = ++nextId;
  return new Promise<T>((resolve, reject) => {
    hostRequests.set(id, { resolve: (value) => resolve(value as T), reject });
    post({ type: "host", id, operation, args });
  });
}

const listeners = new Set<Parameters<OtterAccountSession["subscribe"]>[0]>();
let ready = false;

/** Without local Google sign-in: mailboxes come from the Otter Account's connections. */
const noLocalGoogle: GoogleAuth = {
  load: async () => {},
  addAccount: async (): Promise<GmailAccount> => {
    throw new Error("Connect a Google mailbox in your Otter Account settings.");
  },
  cancelSignIn: () => {},
  isSignedIn: () => false,
  getAccessToken: async () => {
    throw new Error("Sign in to your Otter Account to read this mailbox.");
  },
  getIdToken: async () => {
    throw new Error("The host owns Otter Account identity.");
  },
  removeTokens: async () => {},
};

/** The agent's caller for one access, as the environment's MCP gate already allowed it. */
const callerFor = (access: "read-only" | "safe" | "full-access"): ToolCaller => ({
  mode: () => "full-access",
  turn: () => null,
  access: () => access,
});

async function handle(message: Extract<ToWorker, { type: "call" | "tool" }>): Promise<unknown> {
  if (!ready) throw new Error("Mail is not ready.");
  if (message.type === "call") {
    const handler = registeredHandlers().get(message.operation);
    if (!handler) throw new Error(`Mail operation ${message.operation} is unavailable here.`);
    return handler(message.input);
  }
  const access =
    message.caller.access === "full-access"
      ? "full-access"
      : message.caller.access === "read-only"
        ? "read-only"
        : "safe";
  if (!message.input || typeof message.input !== "object" || Array.isArray(message.input))
    throw new Error("Tool arguments must be an object.");
  const result = await runAgentTool(
    callerFor(access),
    message.name,
    message.input as Record<string, unknown>,
  );
  if (result.isError) throw new Error(result.text);
  return JSON.parse(result.text) as unknown;
}

async function start(options: WorkerOptions) {
  const db = await openMailDatabase();
  db.exec(MAIL_STORAGE_SCHEMA);
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
  let files = createFiles(db, session?.accountId);
  const secrets = createSecrets(files);
  const broadcast: Platform["broadcast"] = (channel, params) => {
    const event = { channel, params };
    if (isMailEvent(event)) post({ type: "event", event });
  };
  let sync: ReturnType<typeof createCloudSync> | undefined;
  if (session) {
    sync = createCloudSync({
      db,
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
  const cloudOrigin = options.cloudOrigin;
  const platform: Platform = {
    kind: "web",
    appVersion: "otterware",
    database: () => mailDatabase(db),
    files,
    secrets,
    google: session ? accountGoogleAuth(session, noLocalGoogle) : noLocalGoogle,
    // The page does these (page.ts); the environment worker relays them.
    userFiles: {
      open: (name, bytes) => host("openFile", name, bytes),
      save: (name, bytes) => host<boolean>("saveFile", name, bytes),
      pick: () => host<PickedFile[]>("pickFiles"),
    },
    connect: (hostName, port, opts) => {
      if (!cloudOrigin)
        return Promise.reject(
          new Error("Sign in to your Otter Account to reach mail servers from the browser."),
        );
      return connectMailSocket(
        { cloudOrigin, ticket: () => host<string>("tunnelTicket") },
        hostName,
        port,
        opts,
      );
    },
    relayUrl: cloudOrigin ?? "https://cloud.otterware.app",
    relaySession: "bearer",
    broadcast,
    notify: (notification) => void host("notify", notification).catch(() => {}),
    setUnreadCount: (count) => void host("setUnreadCount", count).catch(() => {}),
    onResume: (listener) => {
      self.addEventListener("online", listener);
      return () => self.removeEventListener("online", listener);
    },
    // Browsers have no AsyncLocalStorage: all Gmail work shares one quota tier.
    asyncContext: () => ({ run: (_value, fn) => fn(), get: () => undefined }),
    offlineDownloads: false,
    log: () => {},
  };
  await startCore(platform, { hostAccount: true });
  if (session) {
    session.subscribe((event) => {
      if (event.type === "module.push" && event.module === "mail") {
        const push = event.event as { type?: string; email?: string };
        if (push.type === "mail" && typeof push.email === "string")
          void syncAccount(push.email, { force: true });
      }
      if (event.type === "connections.changed") void platform.google.load().catch(() => {});
      if (event.type === "sync.changed") void sync?.sync().catch(() => {});
    });
    void sync?.sync().catch(() => {});
    // Also retries offline outbox writes; terminating the worker ends this timer.
    setInterval(() => void sync?.sync().catch(() => {}), 30_000);
    // Gmail mailboxes the account holds appear without a sign-in here.
    for (const account of await accountStore.listAccounts())
      if (platform.google.isSignedIn(account.id)) void syncAccount(account.id, { force: true });
  }
  ready = true;
  post({ type: "ready" });
}

self.addEventListener("message", (event: MessageEvent<ToWorker>) => {
  const message = event.data;
  switch (message.type) {
    case "start":
      void start(message.options).catch((error: unknown) =>
        post({ type: "fatal", error: error instanceof Error ? error.message : String(error) }),
      );
      return;
    case "hostResult": {
      const waiting = hostRequests.get(message.id);
      hostRequests.delete(message.id);
      if (message.error !== undefined) waiting?.reject(new Error(message.error));
      else waiting?.resolve(message.value);
      return;
    }
    case "cloudEvent":
      for (const listener of listeners) listener(message.event);
      return;
    default:
      void handle(message).then(
        (value) => post({ type: "result", id: message.id, value }),
        (error: unknown) =>
          post({
            type: "result",
            id: message.id,
            error: error instanceof Error ? error.message : String(error),
          }),
      );
  }
});
