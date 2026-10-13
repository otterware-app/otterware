// @effect-diagnostics nodeBuiltinImport:off -- Vite plugin adapts static build metadata.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import type { Plugin } from "vite-plus";
import { profileIconPath, type AppProfile } from "@otterware/profiles";
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

const WEB_ASSETS = {
  "favicon.ico": ["web-favicon.ico", "image/x-icon"],
  "favicon.svg": ["web-favicon.svg", "image/svg+xml"],
  "favicon-16x16.png": ["web-favicon-16x16.png", "image/png"],
  "favicon-32x32.png": ["web-favicon-32x32.png", "image/png"],
  "apple-touch-icon.png": ["web-apple-touch-180.png", "image/png"],
} as const;

/** Stable same-origin URLs serve the selected kit in dev and in every built client. */
export function profileWebAssets(
  profile: AppProfile,
  channel: "production" | "development" | "nightly",
) {
  return Object.entries(WEB_ASSETS).map(([filename, [source, contentType]]) => ({
    filename,
    source: new URL(`../../${profileIconPath(profile, channel, source)}`, import.meta.url),
    contentType,
  }));
}

export function profileWebAssetsPlugin(profile: AppProfile = activeProfile): Plugin {
  const source = new URL("../../apps/web/public/manifest.webmanifest", import.meta.url);
  const manifest = JSON.stringify(
    profileWebManifest(JSON.parse(NodeFS.readFileSync(source, "utf8")), profile),
    null,
    2,
  );
  let outputDirectory: string | undefined;
  let assets = profileWebAssets(profile, "production");
  return {
    name: "otterware-profile-assets",
    transformIndexHtml: (html) =>
      html
        .replace(/<title>[^<]*<\/title>/, `<title>${profile.brand.productName}</title>`)
        .replace(/Otter Code splash screen/g, `${profile.brand.productName} splash screen`)
        .replace(/alt="Otter Code"/g, `alt="${profile.brand.productName}"`),
    configResolved: (config) => {
      outputDirectory = NodePath.resolve(config.root, config.build.outDir);
      const channel =
        config.command === "serve"
          ? "development"
          : process.env.VITE_HOSTED_APP_CHANNEL === "nightly" ||
              /-(?:nightly|preview)\./.test(process.env.APP_VERSION ?? "")
            ? "nightly"
            : "production";
      assets = profileWebAssets(profile, channel);
    },
    configureServer: (server) => {
      server.middlewares.use((request, response, next) => {
        const pathname = request.url?.split("?")[0];
        if (pathname === "/manifest.webmanifest") {
          response.setHeader("content-type", "application/manifest+json");
          response.end(manifest);
          return;
        }
        const asset = assets.find((entry) => pathname === `/${entry.filename}`);
        if (!asset) return next();
        response.setHeader("content-type", asset.contentType);
        response.end(NodeFS.readFileSync(asset.source));
      });
    },
    writeBundle: () => {
      if (!outputDirectory) return;
      NodeFS.writeFileSync(NodePath.join(outputDirectory, "manifest.webmanifest"), manifest + "\n");
      for (const asset of assets) {
        NodeFS.copyFileSync(asset.source, NodePath.join(outputDirectory, asset.filename));
      }
    },
  };
}
