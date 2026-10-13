import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
const repository = NodePath.resolve(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "../../..",
);
/** Build and copy the standalone Drive profile before uploading Cloud assets. */
export async function buildDriveAssets() {
  // W5's web package lands separately; do not make the API-only stage depend on an absent package.
  const present = await NodeFSP.access(
    NodePath.join(repository, "modules/drive/web/package.json"),
  ).then(
    () => true,
    () => false,
  );
  if (!present) return;

  NodeChildProcess.execFileSync("vp", ["run", "--filter", "@otterware/drive-web", "build"], {
    cwd: repository,
    env: { ...process.env, OTTERWARE_PROFILE: "drive" },
    stdio: "inherit",
    timeout: 600_000,
  });
  const target = NodePath.join(repository, "infra/cloud/public/drive");
  await NodeFSP.rm(target, { recursive: true, force: true });
  await NodeFSP.cp(NodePath.join(repository, "modules/drive/web/dist"), target, {
    recursive: true,
  });
}
