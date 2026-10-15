import { parseDriveUrl } from "@otterware/composition/contracts";

/** Where a Drive link opens in the shell's Drive page; null for links that aren't documents. */
export function driveShellPath(url: string): string | null {
  const target = parseDriveUrl(url);
  if (target === null) return null;
  if (target.type === "share-link") return `/drive/s/${encodeURIComponent(target.token)}`;
  if (target.type === "folder")
    return target.folderId
      ? `/drive/home?folder=${encodeURIComponent(target.folderId)}`
      : "/drive/home";
  const folder = encodeURIComponent(target.folderSlug ?? "shared");
  const version = target.version === null ? "" : `/v${target.version}`;
  const sheet = target.sheet === null ? "" : `?sheet=${encodeURIComponent(target.sheet)}`;
  return `/drive/${folder}/a/${encodeURIComponent(target.reference)}${version}${sheet}`;
}

export function readSearch(search: string): Record<string, string | undefined> {
  return Object.fromEntries(new URLSearchParams(search));
}

export type DrivePlace =
  | { kind: "home" }
  | { kind: "settings"; pane: string }
  | { kind: "document"; folderSlug: string; slug: string; version?: number }
  | { kind: "shared-link"; token: string };

/** The route a Drive path names. Unknown paths are the home view. */
export function parsePlace(pathname: string): DrivePlace {
  const parts = pathname
    .split("/")
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    });
  const [first, second, third, fourth] = parts;
  if (first === "settings") return { kind: "settings", pane: second ?? "folder" };
  if (first === "s" && second) return { kind: "shared-link", token: second };
  if (first && second === "a" && third) {
    const number = fourth ? Number(fourth.replace(/^v/, "")) : NaN;
    return {
      kind: "document",
      folderSlug: first,
      slug: third,
      ...(Number.isInteger(number) && number > 0 ? { version: number } : {}),
    };
  }
  return { kind: "home" };
}

/** Encode a module subpath's query for the host router's href navigation. */
export function withDriveSearch(pathname: string, search: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value !== undefined && value !== "") query.set(key, value);
  }
  return query.size ? `${pathname}?${query}` : pathname;
}
