import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { expect, it } from "vite-plus/test";
import { openMailWorker } from "./runtime.ts";

it("serves named operations from an isolated worker and survives disable/re-enable with its data", async () => {
  const stateDir = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "mail-worker-test-"));
  let worker: Awaited<ReturnType<typeof openMailWorker>> | undefined;
  try {
    worker = await openMailWorker({ stateDir, profile: "otterware" }, () => {});
    expect(await worker.call("gmail:listAccounts", {})).toEqual([]);
    const created = (await worker.call("projects:create", {
      name: "Local project",
      notes: "Offline",
    })) as { id: string };
    expect(created.id).toBeTruthy();
    await worker.close();
    await expect(worker.call("projects:list", {})).rejects.toThrow("stopped");
    worker = await openMailWorker({ stateDir, profile: "otterware" }, () => {});
    expect(await worker.call("projects:list", {})).toMatchObject([
      { id: created.id, name: "Local project" },
    ]);
  } finally {
    await worker?.close();
    await NodeFSP.rm(stateDir, { recursive: true, force: true });
  }
}, 30_000);
