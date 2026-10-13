// Node's source runner resolves the retained engine's .js specifiers to TypeScript.
// Release packaging must retain this worker package beside the server bundle.
import * as NodeModule from "node:module";
import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
NodeModule.registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL) {
      const source = new URL(specifier.slice(0, -3) + ".ts", context.parentURL);
      if (NodeFS.existsSync(NodeURL.fileURLToPath(source)))
        return nextResolve(source.href, context);
    }
    return nextResolve(specifier, context);
  },
});
await import("./worker.ts");
