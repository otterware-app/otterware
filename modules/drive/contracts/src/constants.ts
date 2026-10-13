export const DRIVE_CLOUD_ORIGIN = "https://cloud.otterware.app";
export const DRIVE_CLOUD_AUDIENCE = "otterware:drive";
export const DRIVE_ACCOUNTS_URL = "https://accounts.otterware.app/v1/auth";

export const DRIVE_DEFAULT_BASE_URL = "https://drive.otterware.app";
/** Hosts Drive moved away from; they redirect to `drive.otterware.app` with path and query. */
export const DRIVE_LEGACY_HOSTS: ReadonlyArray<string> = [
  "app.otterware.dev",
  "drive.otterware.dev",
];
/** Raw document content (`/raw/a/<artifactId>/<versionId>/...`), never a page of its own. */
export const DRIVE_CONTENT_HOST = "usercontent.otterware.app";
