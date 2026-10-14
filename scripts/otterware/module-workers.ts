// @effect-diagnostics nodeBuiltinImport:off -- Build-time Vite plugin, outside the Effect runtime.
import * as NodeURL from "node:url";
import * as NodePath from "node:path";
import { build } from "vite-plus";

/** Bundle worker code into the host artifact, so npm, desktop and single-executable builds agree. */
export async function buildMailWorker(root: string): Promise<string> {
  const result = await build({
    root,
    configFile: false,
    logLevel: "warn",
    ssr: { noExternal: true },
    build: {
      ssr: NodePath.join(root, "modules/mail/node/src/worker.ts"),
      target: "node24",
      write: false,
      minify: false,
      sourcemap: false,
      rolldownOptions: {
        external: (id) => id.startsWith("node:"),
        output: { format: "es", codeSplitting: false },
      },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((output) =>
    "output" in output ? output.output : [],
  );
  const chunks = outputs.filter((output) => output.type === "chunk");
  if (chunks.length !== 1) throw new Error("Mail worker must be one self-contained chunk.");
  return chunks[0]!.code;
}

/** A pack seam: development reads workerSource.ts; release builds replace it with worker bytes. */
export const moduleWorkerPlugin = (
  root = NodeURL.fileURLToPath(new URL("../..", import.meta.url)),
) => ({
  name: "otterware-module-workers",
  async load(id: string) {
    if (id !== NodePath.join(root, "modules/mail/node/src/workerSource.ts")) return null;
    const source = await buildMailWorker(root);
    return { code: `export const bundledMailWorker = ${JSON.stringify(source)};`, map: null };
  },
});
