import * as NodeFSP from "node:fs/promises";
const { mkdir, mkdtemp, rm, writeFile } = NodeFSP;

import * as NodeOS from "node:os";
const { tmpdir } = NodeOS;

import * as NodePath from "node:path";
const { join } = NodePath;

import { afterEach, describe, expect, it } from "vite-plus/test";
import { discoverFiles, resolveEntryPath } from "../src/files";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("artifact file discovery", () => {
  it("walks a directory deterministically and hashes each file", async () => {
    const root = await mkdtemp(join(tmpdir(), "otterdrive-cli-"));
    temporaryDirectories.push(root);
    await mkdir(join(root, "assets"));
    await writeFile(join(root, "index.html"), "<h1>Hello</h1>");
    await writeFile(join(root, ".otterdrive.json"), "{}");
    await writeFile(join(root, ".otterware.json"), "{}");
    await writeFile(join(root, "assets", "app.js"), 'console.log("hello")');

    const files = await discoverFiles(root);

    expect(files.map((file) => file.path)).toEqual(["assets/app.js", "index.html"]);
    expect(files.every((file) => file.sha256.length === 64)).toBe(true);
    expect(resolveEntryPath(files)).toBe("index.html");
  });

  it("requires an entry for multi-file non-HTML content", async () => {
    const root = await mkdtemp(join(tmpdir(), "otterdrive-cli-"));
    temporaryDirectories.push(root);
    await writeFile(join(root, "a.txt"), "a");
    await writeFile(join(root, "b.txt"), "b");
    const files = await discoverFiles(root);

    expect(() => resolveEntryPath(files)).toThrow("No index.html");
    expect(resolveEntryPath(files, "a.txt")).toBe("a.txt");
  });

  it.each([
    ["notes.md", "text/markdown"],
    ["report.csv", "text/csv"],
    ["report.tsv", "text/tab-separated-values"],
    ["report.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ])("detects the MIME type for %s", async (name, contentType) => {
    const root = await mkdtemp(join(tmpdir(), "otterdrive-cli-"));
    temporaryDirectories.push(root);
    const path = join(root, name);
    await writeFile(path, "content");

    const files = await discoverFiles(path);

    expect(files[0]?.contentType).toBe(contentType);
    expect(resolveEntryPath(files)).toBe(name);
  });
});
