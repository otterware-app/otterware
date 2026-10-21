import { bundledMailWorker } from "./workerSource.ts";
import * as NodeWorkerThreads from "node:worker_threads";
import type { OtterAccountSession } from "@otterware/mail-engine/account-session";
import type { Platform } from "@otterware/mail-engine/platform";
import type { ModuleToolCallerScope } from "@otterware/module-kit/engine";
import type { MailEvent } from "@otterware/mail-contracts/rpc";
import type { FromWorker, ToWorker, WorkerOptions } from "./protocol.ts";

export type MailHost = {
  session?: OtterAccountSession;
  authorize?: (url: string) => Promise<void>;
  userFiles?: Platform["userFiles"];
  notify?: Platform["notify"];
  /** A release host can supply its bundled worker artifact; source checkouts resolve this package. */
  workerUrl?: URL;
};
export type MailNodeOptions = Omit<WorkerOptions, "accountId"> & MailHost;

/** One worker per enabled module scope, terminated on disable and recreated on enable. */
export async function openMailWorker(
  options: MailNodeOptions,
  onEvent: (event: MailEvent) => void,
) {
  const packaged =
    options.workerUrl ??
    (bundledMailWorker
      ? new URL(`data:text/javascript;base64,${Buffer.from(bundledMailWorker).toString("base64")}`)
      : undefined);
  const worker = new NodeWorkerThreads.Worker(
    packaged ?? new URL(import.meta.resolve("@otterware/mail-node/worker")),
    {
      execArgv: packaged ? [] : ["--experimental-transform-types"],
      workerData: {
        stateDir: options.stateDir,
        profile: options.profile,
        legacyHome: options.legacyHome,
        accountId: options.session?.accountId,
        linksAccounts: Boolean(options.session?.linked),
        gmailPushTopic: options.gmailPushTopic,
        googleClientId: options.googleClientId,
        googleClientSecret: options.googleClientSecret,
      } satisfies WorkerOptions,
    },
  );
  let id = 0,
    closed = false;
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  let resolveReady!: () => void, rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Node worker transport has no browser origin.
  const post = (message: ToWorker) => worker.postMessage(message);
  const fail = (error: Error) => {
    rejectReady(error);
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  const unsubscribe = options.session?.subscribe((event) => {
    if (!closed) post({ type: "cloudEvent", event });
  });
  const close = async () => {
    if (closed) return;
    closed = true;
    unsubscribe?.();
    fail(new Error("Mail module stopped."));
    await worker.terminate();
  };
  const hostCall = async (operation: string, args: unknown[]) => {
    const session = options.session;
    switch (operation) {
      case "connections":
        if (session) return session.connections();
        break;
      case "providerToken":
        if (session) return session.providerToken(String(args[0]));
        break;
      case "push":
        if (session) return session.push(args[0] as Parameters<OtterAccountSession["push"]>[0]);
        break;
      case "pull":
        if (session) return session.pull(args[0] as number | undefined);
        break;
      case "linked":
        if (session?.linked) return session.linked();
        break;
      case "unlink":
        if (session?.unlink) return session.unlink(String(args[0]));
        break;
      case "authorize":
        if (options.authorize) return options.authorize(String(args[0]));
        break;
      case "openFile":
        if (options.userFiles)
          return options.userFiles.open(String(args[0]), args[1] as Uint8Array);
        break;
      case "saveFile":
        if (options.userFiles)
          return options.userFiles.save(String(args[0]), args[1] as Uint8Array);
        break;
      case "pickFiles":
        if (options.userFiles) return options.userFiles.pick();
        break;
      case "notify":
        options.notify?.(args[0] as Parameters<Platform["notify"]>[0]);
        return;
    }
    throw new Error(`Mail host capability ${operation} is unavailable.`);
  };
  worker.on("message", (message: FromWorker) => {
    switch (message.type) {
      case "ready":
        resolveReady();
        break;
      case "fatal":
        fail(new Error(message.error));
        break;
      case "event":
        onEvent(message.event);
        break;
      case "result": {
        const request = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) request?.reject(new Error(message.error));
        else request?.resolve(message.value);
        break;
      }
      case "host":
        void hostCall(message.operation, message.args).then(
          (value) => {
            if (!closed) post({ type: "hostResult", id: message.id, value });
          },
          (error) => {
            if (!closed)
              post({
                type: "hostResult",
                id: message.id,
                error: error instanceof Error ? error.message : String(error),
              });
          },
        );
        break;
    }
  });
  worker.on("error", fail);
  worker.on("exit", (code) => {
    fail(new Error(`Mail worker exited (${code}).`));
    closed = true;
    unsubscribe?.();
  });
  const timer = setTimeout(() => rejectReady(new Error("Mail worker startup timed out.")), 60_000);
  try {
    await ready;
  } catch (error) {
    await close();
    throw error;
  } finally {
    clearTimeout(timer);
  }
  const request = (
    message:
      | Omit<Extract<ToWorker, { type: "call" }>, "id">
      | Omit<Extract<ToWorker, { type: "tool" }>, "id">,
    signal?: AbortSignal,
  ) =>
    new Promise<unknown>((resolve, reject) => {
      if (closed || signal?.aborted) {
        reject(new Error("Mail module stopped or call cancelled."));
        return;
      }
      const requestId = ++id;
      const abort = () => {
        pending.delete(requestId);
        reject(new Error("Mail call cancelled."));
      };
      signal?.addEventListener("abort", abort, { once: true });
      const cleanup = () => signal?.removeEventListener("abort", abort);
      pending.set(requestId, {
        resolve: (value) => {
          cleanup();
          resolve(value);
        },
        reject: (error) => {
          cleanup();
          reject(error);
        },
      });
      post({ ...message, id: requestId });
    });
  return {
    call: (operation: string, input: unknown, signal?: AbortSignal) =>
      request({ type: "call", operation, input }, signal),
    runTool: (name: string, input: unknown, caller: ModuleToolCallerScope, signal?: AbortSignal) =>
      request({ type: "tool", name, input, caller }, signal),
    close,
  };
}
