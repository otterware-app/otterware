import { DEFAULT_API_URL } from "@otterware/drive-contracts/api";

/**
 * Links people copy and share point at Drive's public site, whichever app
 * they were copied from (the Otterware shell may run on a local server).
 */
export function publicDriveUrl(path: string): string {
  return new URL(path, DEFAULT_API_URL).href;
}

/** A folder's link: opening it shows the folder in Drive. */
export function folderUrl(folderId: string): string {
  return publicDriveUrl(`/home?folder=${encodeURIComponent(folderId)}`);
}
