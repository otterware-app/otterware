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
