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
  NodeChildProcess.execFileSync(
    "vp",
    ["run", "--filter", "@t3tools/web", "build", "--base", "/drive/"],
    {
      cwd: repository,
      env: {
        ...process.env,
        OTTERWARE_PROFILE: "drive",
        VITE_HOSTED_APP_URL: process.env.VITE_HOSTED_APP_URL ?? "https://drive.otterware.app",
      },
      stdio: "inherit",
      timeout: 600_000,
    },
  );
  const target = NodePath.join(repository, "infra/cloud/public/drive");
  await NodeFSP.rm(target, { recursive: true, force: true });
  await NodeFSP.cp(NodePath.join(repository, "apps/web/dist"), target, {
    recursive: true,
  });
}
