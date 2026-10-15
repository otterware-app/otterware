// @effect-diagnostics nodeBuiltinImport:off -- Isolated build artifact test.
import * as NodeEvents from "node:events";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeWorkerThreads from "node:worker_threads";
import { expect, it } from "vite-plus/test";
import { buildMailWorker } from "./module-workers.ts";

it("boots the bundled worker without a source checkout or installed workspace packages", async () => {
  const stateDir = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "mail-bundle-test-"));
  let worker: NodeWorkerThreads.Worker | undefined;
  try {
    const source = await buildMailWorker(NodePath.resolve(import.meta.dirname, "../.."));
    await NodeFSP.writeFile(NodePath.join(stateDir, "package.json"), '{"type":"module"}');
    await NodeFSP.writeFile(NodePath.join(stateDir, "mail-worker.mjs"), source);
    worker = new NodeWorkerThreads.Worker(
      new URL(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`),
      {
        workerData: { stateDir, profile: "otterware" },
        execArgv: [],
      },
    );
    // One listener buffers messages between awaits, including startup unread events.
    const messages = NodeEvents.EventEmitter.on(worker, "message", { close: ["exit"] });
    const events: unknown[] = [];
    const nextMessage = async (): Promise<unknown> => {
      while (true) {
        const next = await messages.next();
        if (next.done) throw new Error("Mail worker exited before replying.");
        const message: unknown = next.value[0];
        if (
          typeof message === "object" &&
          message !== null &&
          "type" in message &&
          message.type === "event"
        ) {
          events.push(message);
        } else {
          return message;
        }
      }
    };
    const ready = await nextMessage();
    expect(ready).toEqual({ type: "ready" });
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Node worker transport.
    worker.postMessage({ type: "call", id: 1, operation: "gmail:listAccounts", input: {} });
    const result = await nextMessage();
    expect(result).toEqual({ type: "result", id: 1, value: [] });
    expect(events).toContainEqual({
      type: "event",
      event: { channel: "gmail:unread-count", params: 0 },
    });
  } finally {
    await worker?.terminate();
    await NodeFSP.rm(stateDir, { recursive: true, force: true });
  }
}, 90_000);
