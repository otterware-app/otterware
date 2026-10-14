// @effect-diagnostics nodeBuiltinImport:off -- Exercise the packaging subprocess without an Apple toolchain.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { expect, it } from "vite-plus/test";

// oxlint-disable-next-line t3code/no-global-process-runtime -- The executable fixture requires the actual host's POSIX shell.
it.skipIf(process.platform === "win32")(
  "surfaces both Swift diagnostic streams on build failure",
  () => {
    const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "mail-translator-test-"));
    try {
      NodeFS.writeFileSync(
        NodePath.join(directory, "swift"),
        '#!/bin/sh\nprintf "compiler stdout diagnostic\\n"\nprintf "compiler stderr diagnostic\\n" >&2\nexit 1\n',
        { mode: 0o755 },
      );
      const moduleUrl = new URL("./mail-translator.ts", import.meta.url).href;
      const result = NodeChildProcess.spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `import { stageMailTranslator } from ${JSON.stringify(moduleUrl)}; await stageMailTranslator(process.cwd(), process.cwd(), "arm64");`,
        ],
        {
          env: { ...process.env, PATH: `${directory}${NodePath.delimiter}${process.env.PATH}` },
          encoding: "utf8",
          timeout: 10000,
        },
      );
      expect(result.status).toBe(1);
      expect(result.stdout).toContain("compiler stdout diagnostic");
      expect(result.stderr).toContain("compiler stderr diagnostic");
    } finally {
      NodeFS.rmSync(directory, { recursive: true, force: true });
    }
  },
);
