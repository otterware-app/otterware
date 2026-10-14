export const DRIVE_BROWSER_AUDIENCE = "otterware:drive";
/** Public Drive clients authenticate with explicit bearer grants and never browser cookies. */
export function isPublicDriveRequest(request: Request) {
  if (request.headers.has("cookie")) return false;
  const path = new URL(request.url).pathname;
  return path === "/v1/cloud/drive-token" || path.startsWith("/api/v1/");
}
