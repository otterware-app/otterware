import { build } from "esbuild";
import * as NodeFSP from "node:fs/promises";
import * as NodeURL from "node:url";

await build({
  entryPoints: ["drive-cli/src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "dist/otterdrive.mjs",
  banner: {
    js: '#!/usr/bin/env node\nimport { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
});
// open resolves its Linux helper relative to import.meta.url, now the bundled entry.
await NodeFSP.copyFile(
  NodeURL.fileURLToPath(new URL("./xdg-open", import.meta.resolve("open"))),
  "dist/xdg-open",
);
await NodeFSP.chmod("dist/otterdrive.mjs", 0o755);
await NodeFSP.chmod("dist/xdg-open", 0o755);
