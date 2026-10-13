// @effect-diagnostics nodeBuiltinImport:off -- Vite plugin adapts static build metadata.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import type { Plugin } from "vite-plus";
import type { AppProfile } from "@otterware/profiles";
import { activeProfile } from "@otterware/profiles/active";

/** Profile metadata supplements the existing manifest's icon and appearance fields. */
export function profileWebManifest(base: Readonly<Record<string, unknown>>, profile: AppProfile) {
  return {
    ...base,
    name: profile.brand.productName,
    short_name: profile.brand.productName,
    start_url: profile.landingRoute,
  };
}

export function profileWebAssetsPlugin(profile: AppProfile = activeProfile): Plugin {
  const source = new URL("../../apps/web/public/manifest.webmanifest", import.meta.url);
  const manifest = JSON.stringify(
    profileWebManifest(JSON.parse(NodeFS.readFileSync(source, "utf8")), profile),
    null,
    2,
  );
  let outputPath: string | undefined;
  return {
    name: "otterware-profile-assets",
    transformIndexHtml: (html) =>
      html.replace(/<title>[^<]*<\/title>/, `<title>${profile.brand.productName}</title>`),
    configResolved: (config) => {
      outputPath = NodePath.resolve(config.root, config.build.outDir, "manifest.webmanifest");
    },
    configureServer: (server) => {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split("?")[0] !== "/manifest.webmanifest") return next();
        response.setHeader("content-type", "application/manifest+json");
        response.end(manifest);
      });
    },
    writeBundle: () => {
      if (outputPath) NodeFS.writeFileSync(outputPath, manifest + "\n");
    },
  };
}
