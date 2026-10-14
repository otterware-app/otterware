// @effect-diagnostics nodeBuiltinImport:off -- Isolated filesystem fixture for XDG autostart.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { expect, it } from "vite-plus/test";
import { linuxLogin, setLinuxLogin } from "./login.ts";
it("quotes executable paths and removes only its own autostart entry", async () => {
  const dir = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "mail-autostart-"));
  try {
    const file = NodePath.join(dir, "mail.desktop");
    await setLinuxLogin(file, "/opt/Otter Mail/$app", "Otter Mail", true);
    expect(await linuxLogin(file)).toBe(true);
    expect(await NodeFSP.readFile(file, "utf8")).toContain('Exec="/opt/Otter Mail/\\$app"');
    await setLinuxLogin(file, "", "Otter Mail", false);
    expect(await linuxLogin(file)).toBe(false);
  } finally {
    await NodeFSP.rm(dir, { recursive: true, force: true });
  }
});
