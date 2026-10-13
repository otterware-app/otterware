import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
const repository = NodePath.resolve(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "../../..",
);
NodeChildProcess.execFileSync("vp", ["run", "--filter", "otterdrive", "build"], {
  cwd: repository,
  stdio: "inherit",
  timeout: 600_000,
});
await NodeFSP.mkdir("dist", { recursive: true });
await NodeFSP.copyFile(
  NodePath.join(repository, "apps/drive-cli/dist/index.mjs"),
  "dist/otterdrive.mjs",
);
await NodeFSP.copyFile(NodePath.join(repository, "apps/drive-cli/dist/xdg-open"), "dist/xdg-open");
await NodeFSP.chmod("dist/otterdrive.mjs", 0o755);
await NodeFSP.chmod("dist/xdg-open", 0o755);
