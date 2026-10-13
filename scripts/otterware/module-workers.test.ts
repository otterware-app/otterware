// @effect-diagnostics nodeBuiltinImport:off -- Isolated build artifact test.
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
    const nextMessage = () =>
      new Promise<unknown>((resolve, reject) => {
        worker!.once("message", resolve);
        worker!.once("error", reject);
      });
    const ready = await nextMessage();
    expect(ready).toEqual({ type: "ready" });
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Node worker transport.
    worker.postMessage({ type: "call", id: 1, operation: "gmail:listAccounts", input: {} });
    const result = await nextMessage();
    expect(result).toEqual({ type: "result", id: 1, value: [] });
  } finally {
    await worker?.terminate();
    await NodeFSP.rm(stateDir, { recursive: true, force: true });
  }
}, 90_000);
