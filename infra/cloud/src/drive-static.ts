/** Preserve bookmarks from Drive's former standalone router. */
export function driveStaticRedirect(request: Request): Response | null {
  if (!["GET", "HEAD"].includes(request.method)) return null;
  const url = new URL(request.url);
  const path = url.pathname;
  if (
    path === "/home" ||
    /^\/[^/]+\/a\/[^/]+(?:\/v[1-9][0-9]*)?\/?$/.test(path) ||
    /^\/s\/[^/]+$/.test(path)
  ) {
    url.pathname = `/drive${path}`;
    return Response.redirect(url, 302);
  }
  return null;
}

/** Static Drive profile pages share Cloud's API; raw uploaded content never enters this asset path. */
export function driveStaticRequest(request: Request): Request | null {
  if (!["GET", "HEAD"].includes(request.method)) return null;
  const url = new URL(request.url);
  if (
    url.pathname.startsWith("/drive/assets/") ||
    (url.pathname.startsWith("/drive/") &&
      !/^\/drive\/[^/]+\/a\//.test(url.pathname) &&
      /\.(?:js|css|wasm|woff2?|png|svg|ico|webmanifest|mp3|wav)$/.test(url.pathname)) ||
    /^\/drive\/(?:favicon[^/]*|apple-touch-icon.png|manifest.webmanifest)$/.test(url.pathname)
  )
    return request;
  if (/^\/(?:favicon[^/]*|apple-touch-icon.png|manifest.webmanifest)$/.test(url.pathname)) {
    url.pathname = `/drive${url.pathname}`;
    return new Request(url, request);
  }
  if (
    url.pathname !== "/" &&
    url.pathname !== "/drive" &&
    !url.pathname.startsWith("/drive/") &&
    url.pathname !== "/account/callback" &&
    !/^\/[^/]+\/a\/[^/]+(?:\/v[1-9][0-9]*)?\/?$/.test(url.pathname) &&
    !/^\/s\/[^/]+$/.test(url.pathname) &&
    url.pathname !== "/home" &&
    url.pathname !== "/settings" &&
    !url.pathname.startsWith("/settings/")
  )
    return null;
  url.pathname = "/drive/index.html";
  return new Request(url, request);
}
