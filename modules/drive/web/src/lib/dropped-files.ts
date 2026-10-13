import type { PickedFile } from "./upload-document";

/** One top-level dropped item: a file, or a folder with its whole tree. */
export interface DroppedItem {
  name: string;
  files: PickedFile[];
}

const IGNORED_FILES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

export function hasDraggedFiles(dataTransfer: DataTransfer | null): boolean {
  return Boolean(dataTransfer?.types.includes("Files"));
}

/**
 * Reads what was dropped. Must be called synchronously inside the drop
 * handler: the browser empties `dataTransfer.items` once the event returns.
 */
export function readDroppedItems(dataTransfer: DataTransfer): Promise<DroppedItem[]> {
  const entries = Array.from(dataTransfer.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.webkitGetAsEntry());
  if (entries.length > 0 && entries.every((entry) => entry !== null)) {
    return Promise.all(entries.map(readEntry)).then((items) =>
      items.filter((item) => item.files.length > 0),
    );
  }
  return Promise.resolve(
    Array.from(dataTransfer.files, (file) => ({
      name: file.name,
      files: [{ file, path: file.name }],
    })),
  );
}

async function readEntry(entry: FileSystemEntry): Promise<DroppedItem> {
  if (entry.isFile) {
    const file = await fileOf(entry as FileSystemFileEntry);
    return { name: entry.name, files: [{ file, path: file.name }] };
  }
  return {
    name: entry.name,
    files: await walk(entry as FileSystemDirectoryEntry, ""),
  };
}

async function walk(directory: FileSystemDirectoryEntry, prefix: string): Promise<PickedFile[]> {
  const files: PickedFile[] = [];
  for (const entry of await childrenOf(directory)) {
    if (IGNORED_FILES.has(entry.name)) continue;
    if (entry.isFile) {
      files.push({
        file: await fileOf(entry as FileSystemFileEntry),
        path: `${prefix}${entry.name}`,
      });
    } else if (entry.isDirectory) {
      files.push(...(await walk(entry as FileSystemDirectoryEntry, `${prefix}${entry.name}/`)));
    }
  }
  return files;
}

// readEntries returns at most ~100 entries per call; read until it is empty.
async function childrenOf(directory: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = directory.createReader();
  const children: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (batch.length === 0) return children;
    children.push(...batch);
  }
}

function fileOf(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}
