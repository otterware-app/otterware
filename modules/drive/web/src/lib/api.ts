import type { DriveClient } from "@otterware/otter-cloud-client/drive";

/**
 * Drive's REST API (`/api/v1/...`), called on Otter Cloud through the host's
 * `DriveClient`, which adds the account's Drive capability. The page sets the
 * client before anything below it renders (`DrivePage`).
 */

let current: DriveClient | null = null;

export function setDriveClient(client: DriveClient) {
  current = client;
}

function client(): DriveClient {
  if (!current) throw new Error("Drive is not connected to Otter Cloud.");
  return current;
}

export interface ApiRequestInit extends RequestInit {
  /** Resolves slugs, and places new documents, in this folder. */
  folderId?: string | undefined;
}

/** The raw response, for content and downloads. */
export function apiFetch(path: string, init: ApiRequestInit = {}) {
  const { folderId, ...requestInit } = init;
  return client().request(path, requestInit, folderId);
}

export async function api<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const { folderId, ...requestInit } = init;
  const headers = new Headers(requestInit.headers);
  headers.set("accept", "application/json");
  return (await client().json(path, { ...requestInit, headers }, folderId)) as T;
}
