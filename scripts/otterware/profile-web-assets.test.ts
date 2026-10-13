// @effect-diagnostics nodeBuiltinImport:off -- Verify the actual exported artwork files.
import { describe, expect, it } from "vite-plus/test";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { build } from "vite-plus";
import { profileIconPath, PROFILES } from "@otterware/profiles";
import {
  profileWebAssets,
  profileWebAssetsPlugin,
  profileWebManifest,
} from "./profile-web-assets.ts";

describe("profile web install metadata", () => {
  it("uses each profile's product and landing route while preserving installed-app identity and icons", () => {
    const base = { id: "/", icons: [{ src: "/favicon.ico" }], display: "standalone" };
    for (const profile of Object.values(PROFILES)) {
      expect(profileWebManifest(base, profile)).toEqual({
        ...base,
        name: profile.brand.productName,
        short_name: profile.brand.productName,
        start_url: profile.landingRoute,
      });
    }
  });
});

// Assert the real files the dev middleware and output copier serve, including channel fallback.
describe("profile artwork delivery", () => {
  it("ships complete, readable kits for every profile and channel", () => {
    for (const profile of Object.values(PROFILES)) {
      for (const channel of ["production", "development", "nightly"] as const) {
        const assets = profileWebAssets(profile, channel);
        expect(assets.map((asset) => asset.filename)).toEqual([
          "favicon.ico",
          "favicon.svg",
          "favicon-16x16.png",
          "favicon-32x32.png",
          "apple-touch-icon.png",
        ]);
        for (const asset of assets) {
          const data = NodeFS.readFileSync(asset.source);
          expect(data.length).toBeGreaterThan(0);
          if (asset.filename.endsWith(".png")) {
            const size =
              asset.filename === "apple-touch-icon.png"
                ? 180
                : asset.filename.includes("16x16")
                  ? 16
                  : 32;
            expect(data.subarray(1, 4).toString()).toBe("PNG");
            expect([data.readUInt32BE(16), data.readUInt32BE(20)]).toEqual([size, size]);
          }
          if (asset.filename.endsWith(".svg")) expect(data.toString()).toContain("<svg");
        }
        const native = profileIconPath(profile, channel, "macos.icns");
        if (profile.id !== "code") {
          expect(
            NodeFS.readFileSync(new URL(`../../${native}`, import.meta.url))
              .subarray(0, 4)
              .toString(),
          ).toBe("icns");
        }
      }
    }
  });

  it("preserves Code's channel kits and reuses production where no source variant exists", () => {
    expect(profileIconPath(PROFILES.code, "nightly", "windows.ico")).toBe(
      "assets/otter-nightly/otter-nightly-windows.ico",
    );
    for (const id of ["otterware", "calendar", "drive"] as const) {
      expect(profileIconPath(PROFILES[id], "development", "windows.ico")).toBe(
        profileIconPath(PROFILES[id], "production", "windows.ico"),
      );
    }
    expect(profileIconPath(PROFILES.mail, "development", "macos.icns")).toBe(
      "assets/mail/mail-dev-macos.icns",
    );
    expect(
      new Set(
        Object.values(PROFILES).map((profile) =>
          profileIconPath(profile, "production", "web-favicon.svg"),
        ),
      ).size,
    ).toBe(5);
  });
});

it("writes each profile's title, splash, manifest and artwork through a real web build", async () => {
  const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "profile-web-artwork-"));
  try {
    NodeFS.writeFileSync(
      NodePath.join(directory, "index.html"),
      '<html><head><title>Otter Code (Alpha)</title></head><body><img src="/apple-touch-icon.png" alt="Otter Code" aria-label="Otter Code splash screen"></body></html>',
    );
    for (const profile of Object.values(PROFILES)) {
      await build({
        configFile: false,
        root: directory,
        publicDir: false,
        logLevel: "silent",
        plugins: [profileWebAssetsPlugin(profile)],
        build: { outDir: "dist" },
      });
      const output = NodePath.join(directory, "dist");
      const html = NodeFS.readFileSync(NodePath.join(output, "index.html"), "utf8");
      expect(html).toContain(`<title>${profile.brand.productName}</title>`);
      expect(html).toContain(`alt="${profile.brand.productName}"`);
      const manifest = JSON.parse(
        NodeFS.readFileSync(NodePath.join(output, "manifest.webmanifest"), "utf8"),
      );
      expect(manifest.name).toBe(profile.brand.productName);
      expect(manifest.start_url).toBe(profile.landingRoute);
      for (const asset of profileWebAssets(profile, "production")) {
        expect(NodeFS.readFileSync(NodePath.join(output, asset.filename))).toEqual(
          NodeFS.readFileSync(asset.source),
        );
      }
    }
  } finally {
    NodeFS.rmSync(directory, { recursive: true, force: true });
  }
});
