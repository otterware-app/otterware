import { build, type Plugin } from "esbuild";
import * as NodeFSP from "node:fs/promises";
const { readFile } = NodeFSP;

// Preserve Accounts' Worker compatibility patch without changing the upstream workspace config.
export const accountsLogoutPatch: Plugin = {
  name: "accounts-worker-logout",
  setup(build) {
    build.onLoad(
      { filter: /@better-auth\/oauth-provider\/dist\/authorize-.*\.mjs$/ },
      async ({ path }) => {
        const source = await readFile(path, "utf8");
        if (!source.includes('redirect: "error"'))
          throw new Error("Review Accounts logout compatibility patch after updating Better Auth.");
        return {
          contents: source.replaceAll('redirect: "error"', 'redirect: "manual"'),
          loader: "js",
        };
      },
    );
  },
};
export function bundle(entry = "src/worker.ts", write = true) {
  return build({
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "es2023",
    conditions: ["workerd", "worker", "browser"],
    external: ["cloudflare:*", "node:*"],
    plugins: [accountsLogoutPatch],
    write,
    ...(write ? { outfile: "dist/worker.mjs", sourcemap: true } : {}),
  });
}
