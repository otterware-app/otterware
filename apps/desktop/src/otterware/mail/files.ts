// @effect-diagnostics nodeBuiltinImport:off -- Attachments are temporary client files, independent of the selected environment's filesystem.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
export function attachmentFileName(name: string): string {
  const safe = name
    .replaceAll("\\", "/")
    .split("/")
    .at(-1)
    ?.replace(/[\x00-\x1f\x7f]/g, "")
    .trim();
  return !safe || safe === "." || safe === ".." ? "attachment" : safe.slice(-200);
}
export async function writeAttachment(root: string, input: { name: string; base64: string }) {
  const dir = await NodeFSP.mkdtemp(NodePath.join(root, "mail-attachment-"));
  const file = NodePath.join(dir, attachmentFileName(input.name));
  try {
    await NodeFSP.writeFile(file, Buffer.from(input.base64, "base64url"), { mode: 0o600 });
  } catch (error) {
    await NodeFSP.rm(dir, { recursive: true, force: true });
    throw error;
  }
  return { file, remove: () => NodeFSP.rm(dir, { recursive: true, force: true }) };
}
