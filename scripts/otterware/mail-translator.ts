// @effect-diagnostics nodeBuiltinImport:off -- Release staging compiles Apple's native helper on the target Mac.
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeUtil from "node:util";
const exec = NodeUtil.promisify(NodeChildProcess.execFile);
export async function stageMailTranslator(
  repoRoot: string,
  resources: string,
  arch: "arm64" | "x64" | "universal",
) {
  const args = [
    "build",
    "-c",
    "release",
    "--package-path",
    NodePath.join(repoRoot, "native/mail-translator"),
    ...(arch === "universal"
      ? ["--arch", "arm64", "--arch", "x86_64"]
      : ["--arch", arch === "x64" ? "x86_64" : "arm64"]),
  ];
  await exec("swift", args, { timeout: 8 * 60000, maxBuffer: 8 * 1024 * 1024 });
  const { stdout } = await exec("swift", [...args, "--show-bin-path"], { timeout: 30000 });
  const bin = NodePath.join(resources, "bin");
  await NodeFSP.mkdir(bin, { recursive: true });
  await NodeFSP.copyFile(
    NodePath.join(stdout.trim(), "translator"),
    NodePath.join(bin, "mail-translator"),
  );
  await NodeFSP.chmod(NodePath.join(bin, "mail-translator"), 0o755);
}
