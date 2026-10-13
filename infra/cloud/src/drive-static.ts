/** Static Drive profile pages share Cloud's API; raw uploaded content never enters this asset path. */
export function driveStaticRequest(request: Request): Request | null {
  if (!["GET", "HEAD"].includes(request.method)) return null;
  const url = new URL(request.url);
  if (url.pathname.startsWith("/drive/assets/")) return request;
  if (
    url.pathname !== "/" &&
    url.pathname !== "/drive" &&
    !url.pathname.startsWith("/drive/") &&
    url.pathname !== "/account/callback" &&
    !/^\/[^/]+\/a\/[^/]+(?:\/v[1-9][0-9]*)?\/?$/.test(url.pathname) &&
    !/^\/s\/[^/]+$/.test(url.pathname) &&
    url.pathname !== "/home"
  )
    return null;
  url.pathname = "/drive/index.html";
  return new Request(url, request);
}
