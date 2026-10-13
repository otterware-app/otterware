import * as NodeCrypto from "node:crypto";
const { createHash } = NodeCrypto;

import * as NodeFS from "node:fs";
const { createReadStream } = NodeFS;

import * as NodeFSP from "node:fs/promises";
const { lstat, readdir } = NodeFSP;

import * as NodePath from "node:path";
const { basename, posix, relative, resolve, sep } = NodePath;

import * as NodeStreamPromises from "node:stream/promises";
const { pipeline } = NodeStreamPromises;

import * as NodeStream from "node:stream";
const { Writable } = NodeStream;

import { lookup } from "mime-types";
import type { ArtifactFile } from "../../drive/contracts/index.ts";

export interface LocalArtifactFile extends ArtifactFile {
  absolutePath: string;
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(
    createReadStream(path),
    new Writable({
      write(chunk: Buffer, _encoding, callback) {
        hash.update(chunk);
        callback();
      },
    }),
  );
  return hash.digest("hex");
}

async function walk(directory: string): Promise<string[]> {
  const output: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if ([".DS_Store", ".otterdrive.json", ".otterware.json"].includes(entry.name)) continue;
    const absolutePath = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Symbolic links are not supported: ${absolutePath}`);
    }
    if (entry.isDirectory()) output.push(...(await walk(absolutePath)));
    else if (entry.isFile()) output.push(absolutePath);
  }
  return output;
}

export async function discoverFiles(source: string): Promise<LocalArtifactFile[]> {
  const absoluteSource = resolve(source);
  const sourceStat = await lstat(absoluteSource);
  const root = sourceStat.isDirectory() ? absoluteSource : resolve(absoluteSource, "..");
  const paths = sourceStat.isDirectory() ? await walk(root) : [absoluteSource];

  return Promise.all(
    paths.sort().map(async (absolutePath) => {
      const stat = await lstat(absolutePath);
      const path = sourceStat.isDirectory()
        ? relative(root, absolutePath).split(sep).join(posix.sep)
        : basename(absolutePath);
      return {
        absolutePath,
        path,
        contentType: lookup(path) || "application/octet-stream",
        size: stat.size,
        sha256: await hashFile(absolutePath),
      };
    }),
  );
}

export function resolveEntryPath(files: LocalArtifactFile[], requested?: string): string {
  if (requested) {
    if (!files.some((file) => file.path === requested)) {
      throw new Error(`Entry file does not exist in source: ${requested}`);
    }
    return requested;
  }
  if (files.some((file) => file.path === "index.html")) return "index.html";
  if (files.length === 1 && files[0]) return files[0].path;
  throw new Error("No index.html found; provide --entry <path>");
}
