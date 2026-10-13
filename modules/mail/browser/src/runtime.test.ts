import { describe, expect, it } from "vite-plus/test";

import type { FromWorker, ToWorker } from "./protocol.ts";
import { openMailWorker, type MailBrowserAccount } from "./runtime.ts";

/** Mail's worker as the environment worker sees it: messages in, messages out. */
class FakeMailWorker extends EventTarget {
  readonly received: Array<ToWorker> = [];
  terminated = false;
  constructor(private readonly answer: (message: ToWorker) => FromWorker | undefined) {
    super();
  }
  postMessage(message: ToWorker) {
    this.received.push(message);
    const reply = this.answer(message);
    if (reply) queueMicrotask(() => this.send(reply));
  }
  send(message: FromWorker) {
    this.dispatchEvent(new MessageEvent("message", { data: message }));
  }
  terminate() {
    this.terminated = true;
  }
}

const account = (requests: Array<string>): MailBrowserAccount => ({
  accountId: "user-ada",
  cloudOrigin: "https://cloud.otterware.app",
  client: {
    connections: async () => [],
    providerToken: async (id) => ({
      connectionId: id,
      accessToken: "google-token",
      expiresAt: 1,
      audience: "browser:x",
      scopes: [],
    }),
    push: async () => ({ records: [] }),
    pull: async () => ({ records: [], cursor: 0, hasMore: false }),
    request: async (path) => {
      requests.push(path);
      return Response.json({ ticket: "ticket-1", expiresAt: 1 });
    },
  },
  subscribe: () => () => {},
});

describe("Mail's browser worker", () => {
  it("starts with the account, answers calls, and serves its Cloud needs", async () => {
    const requests: Array<string> = [];
    const worker = new FakeMailWorker((message) => {
      if (message.type === "start") return { type: "ready" };
      if (message.type === "call")
        return { type: "result", id: message.id, value: { operation: message.operation } };
      return undefined;
    });
    const mail = await openMailWorker(
      account(requests),
      () => {},
      undefined,
      () => worker as never,
    );
    expect(worker.received[0]).toEqual({
      type: "start",
      options: { accountId: "user-ada", cloudOrigin: "https://cloud.otterware.app" },
    });
    expect(await mail.call("gmail:listAccounts", {})).toEqual({ operation: "gmail:listAccounts" });

    // The worker opens Mail's tunnel with a one-time ticket from the account's Cloud session.
    const answered = new Promise<ToWorker>((resolve) => {
      const post = worker.postMessage.bind(worker);
      worker.postMessage = (message) => {
        post(message);
        if (message.type === "hostResult") resolve(message);
      };
    });
    worker.send({ type: "host", id: 7, operation: "tunnelTicket", args: [] });
    expect(await answered).toEqual({ type: "hostResult", id: 7, value: "ticket-1" });
    expect(requests).toEqual(["/v1/cloud/channel-ticket"]);

    mail.close();
    expect(worker.terminated).toBe(true);
    await expect(mail.call("gmail:listAccounts", {})).rejects.toThrow("stopped");
  });

  it("refuses account work while the browser is signed out", async () => {
    const worker = new FakeMailWorker((message) =>
      message.type === "start" ? { type: "ready" } : undefined,
    );
    await openMailWorker(
      undefined,
      () => {},
      undefined,
      () => worker as never,
    );
    const answered = new Promise<ToWorker>((resolve) => {
      const post = worker.postMessage.bind(worker);
      worker.postMessage = (message) => {
        post(message);
        if (message.type === "hostResult") resolve(message);
      };
    });
    worker.send({ type: "host", id: 1, operation: "providerToken", args: ["google-1"] });
    expect(await answered).toEqual({
      type: "hostResult",
      id: 1,
      error: "Sign in to your Otter Account to use this mailbox.",
    });
  });
});
