/**
 * Spawns Mail's worker from the in-browser environment's worker and speaks
 * to it: engine calls and tool runs one way, the account's Cloud session and
 * events the other. One worker per time the module is on.
 */
import type { ModuleToolCallerScope } from "@otterware/module-kit/engine";
import type { MailEvent } from "@otterware/mail-contracts/rpc";
import type { ChannelEvent, OtterCloudClient, SyncRecord } from "@otterware/otter-cloud-client";

import type { FromWorker, ToWorker } from "./protocol.ts";

/** What Mail needs from the signed-in Otter Account, held by the environment worker. */
export interface MailBrowserAccount {
  readonly accountId: string;
  readonly cloudOrigin: string;
  readonly client: Pick<
    OtterCloudClient,
    "connections" | "providerToken" | "push" | "pull" | "request"
  >;
  /** Cloud channel events while signed in; returns the unsubscribe. */
  readonly subscribe: (listener: (event: ChannelEvent) => void) => () => void;
}

const STARTUP_TIMEOUT_MS = 60_000;

export async function openMailWorker(
  account: MailBrowserAccount | undefined,
  onEvent: (event: MailEvent) => void,
  spawn: () => Worker = () =>
    new Worker(new URL("./worker.ts", import.meta.url), { type: "module", name: "otterware-mail" }),
) {
  const worker = spawn();
  let id = 0;
  let closed = false;
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- A worker port has no origin.
  const post = (message: ToWorker) => worker.postMessage(message);
  const fail = (error: Error) => {
    rejectReady(error);
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  const unsubscribe = account?.subscribe((event) => {
    if (!closed) post({ type: "cloudEvent", event });
  });
  const close = () => {
    if (closed) return;
    closed = true;
    unsubscribe?.();
    fail(new Error("Mail module stopped."));
    worker.terminate();
  };
  const hostCall = async (operation: string, args: ReadonlyArray<unknown>) => {
    if (operation === "notify") return;
    if (!account) throw new Error("Sign in to your Otter Account to use this mailbox.");
    switch (operation) {
      case "connections":
        return account.client.connections();
      case "providerToken":
        return account.client.providerToken(String(args[0]));
      case "push":
        return account.client.push(args[0] as ReadonlyArray<SyncRecord>);
      case "pull":
        return account.client.pull(args[0] as number | undefined);
      case "tunnelTicket": {
        const response = await account.client.request("/v1/cloud/channel-ticket", {
          method: "POST",
        });
        return ((await response.json()) as { readonly ticket: string }).ticket;
      }
    }
    throw new Error(`Mail host capability ${operation} is unavailable in the browser.`);
  };
  worker.addEventListener("message", (event: MessageEvent<FromWorker>) => {
    const message = event.data;
    switch (message.type) {
      case "ready":
        resolveReady();
        return;
      case "fatal":
        fail(new Error(message.error));
        return;
      case "event":
        onEvent(message.event);
        return;
      case "result": {
        const request = pending.get(message.id);
        pending.delete(message.id);
        if (message.error !== undefined) request?.reject(new Error(message.error));
        else request?.resolve(message.value);
        return;
      }
      case "host":
        void hostCall(message.operation, message.args).then(
          (value) => {
            if (!closed) post({ type: "hostResult", id: message.id, value });
          },
          (error: unknown) => {
            if (!closed)
              post({
                type: "hostResult",
                id: message.id,
                error: error instanceof Error ? error.message : String(error),
              });
          },
        );
        return;
    }
  });
  worker.addEventListener("error", (event) => fail(new Error(event.message || "Mail failed.")));
  post({
    type: "start",
    options: { accountId: account?.accountId, cloudOrigin: account?.cloudOrigin },
  });
  const timer = setTimeout(
    () => rejectReady(new Error("Mail's worker took too long to start.")),
    STARTUP_TIMEOUT_MS,
  );
  try {
    await ready;
  } catch (error) {
    close();
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
      pending.set(requestId, {
        resolve: (value) => {
          signal?.removeEventListener("abort", abort);
          resolve(value);
        },
        reject: (error) => {
          signal?.removeEventListener("abort", abort);
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
