import { describe, expect, it } from "vite-plus/test";

import { cliArchiveTarCommand, newestCliReleaseVersion, parseChecksums } from "./cliRelease.ts";

describe("cliRelease", () => {
  it("parses sha256sum output including binary-mode markers", () => {
    const checksums = parseChecksums(
      [
        `${"a".repeat(64)}  t3-1.2.3-linux-x64.tar.gz`,
        `${"B".repeat(64)} *t3-1.2.3-win32-x64.zip`,
        "not a checksum line",
        "",
      ].join("\n"),
    );
    expect(checksums.get("t3-1.2.3-linux-x64.tar.gz")).toBe("a".repeat(64));
    expect(checksums.get("t3-1.2.3-win32-x64.zip")).toBe("b".repeat(64));
    expect(checksums.size).toBe(2);
  });

  it("extracts with the System32 bsdtar on Windows and plain tar elsewhere", () => {
    expect(cliArchiveTarCommand("linux", {})).toBe("tar");
    expect(cliArchiveTarCommand("win32", { SystemRoot: "D:\\Win" })).toBe(
      "D:\\Win\\System32\\tar.exe",
    );
    expect(cliArchiveTarCommand("win32", {})).toBe("C:\\Windows\\System32\\tar.exe");
  });

  it("picks the newest non-draft release on the requested channel", () => {
    const releases = [
      {
        tag_name: "otterware-otterware-v1.2.4-preview.20260912.9",
        name: "otterware 1.2.4-preview.20260912.9 (otterware)",
        draft: true,
      },
      {
        tag_name: "otterware-otterware-v1.2.4-preview.20260912.8",
        name: "otterware 1.2.4-preview.20260912.8 (otterware)",
      },
      {
        tag_name: "otterware-otterware-v1.2.4-nightly.20260912.7",
        name: "otterware 1.2.4-nightly.20260912.7 (otterware)",
      },
      { tag_name: "desktop-preview" },
      { tag_name: "otterware-otterware-v1.2.3", name: "otterware 1.2.3 (otterware)" },
      {
        tag_name: "otterware-otterware-v1.2.3-nightly.20260911.2",
        name: "otterware 1.2.3-nightly.20260911.2 (otterware)",
      },
    ];
    expect(newestCliReleaseVersion(releases, "preview")).toBe("1.2.4-preview.20260912.8");
    expect(newestCliReleaseVersion(releases, "nightly")).toBe("1.2.4-nightly.20260912.7");
    expect(newestCliReleaseVersion(releases, "stable")).toBe("1.2.3");
    expect(newestCliReleaseVersion([{ tag_name: "v1.2.3" }], "preview")).toBeUndefined();
  });
  it("ignores other profiles and branches while accepting its own published runtime", () => {
    const version = "0.14.0-otterware.20261013.100";
    const releases = [
      { tag_name: `otterware-code-v${version}`, name: `code ${version} (code)` },
      {
        tag_name: `otterware-otterware-v${version}`,
        name: `otterware ${version} (otterware-test)`,
      },
      { tag_name: `otterware-otterware-v${version}`, name: `otterware ${version} (otterware)` },
    ];
    expect(newestCliReleaseVersion(releases.slice(0, 2), "nightly")).toBeUndefined();
    expect(newestCliReleaseVersion(releases, "nightly")).toBe(version);
  });
});
