// @effect-diagnostics nodeBuiltinImport:off -- XDG autostart is a client OS integration.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

const quoteExec = (value: string) => `"${value.replace(/["`$\\]/g, (c) => `\\${c}`)}"`;
export async function setLinuxLogin(
  file: string,
  executable: string,
  name: string,
  enabled: boolean,
) {
  if (!enabled) {
    await NodeFSP.rm(file, { force: true });
    return;
  }
  await NodeFSP.mkdir(NodePath.dirname(file), { recursive: true });
  await NodeFSP.writeFile(
    file,
    `[Desktop Entry]\nType=Application\nName=${name}\nExec=${quoteExec(executable)}\nX-GNOME-Autostart-enabled=true\n`,
  );
}
export async function linuxLogin(file: string) {
  return NodeFSP.readFile(file, "utf8").then(
    (text) => !/^Hidden=true$/m.test(text),
    () => false,
  );
}
