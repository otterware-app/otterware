// @effect-diagnostics nodeBuiltinImport:off -- Isolated attachment fixture.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { expect, it } from "vite-plus/test";
import { attachmentFileName, writeAttachment } from "./files.ts";
it("keeps remote filenames inside a private temporary directory", async () => {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "mail-files-"));
  try {
    const saved = await writeAttachment(root, {
      name: "../../private/receipt.pdf",
      base64: "aGVsbG8=",
    });
    expect(NodePath.dirname(saved.file)).not.toBe(root);
    expect(await NodeFSP.readFile(saved.file, "utf8")).toBe("hello");
    expect(attachmentFileName("C:\\secret\\receipt.pdf")).toBe("receipt.pdf");
    expect(attachmentFileName("..")).toBe("attachment");
    await saved.remove();
    await expect(NodeFSP.stat(saved.file)).rejects.toThrow();
  } finally {
    await NodeFSP.rm(root, { recursive: true, force: true });
  }
});
