import { describe, expect, it } from "vite-plus/test";
import { DriveClient, isolatedContentUrl } from "./client.ts";
import {
  DRIVE_ACCOUNTS_URL,
  DRIVE_CLOUD_ORIGIN,
  DRIVE_CLOUD_AUDIENCE,
} from "@otterware/drive-contracts";
import type { Artifact } from "@otterware/drive-contracts/api";
const origin = DRIVE_CLOUD_ORIGIN;
const version = {
  id: "v2",
  number: 2,
  label: "Second",
  entryPath: "notes.txt",
  createdAt: "2026-10-13T10:00:00.000Z",
  createdBy: null,
  fileCount: 1,
  byteSize: 5,
  contentHash: "hash",
};
const artifact: Artifact = {
  id: "document",
  folderId: "personal",
  ownerUserId: "owner",
  slug: "notes",
  title: "Notes",
  description: "",
  createdAt: version.createdAt,
  updatedAt: version.createdAt,
  archivedAt: null,
  currentVersion: version,
  versionCount: 2,
  url: `${origin}/personal/a/notes`,
  role: "owner",
};
function fakeApi(route: (url: URL, init: RequestInit) => Response) {
  const requests: Array<{ url: URL; init: RequestInit }> = [];
  const fetcher: typeof fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    requests.push({ url, init });
    if (url.href === `${DRIVE_ACCOUNTS_URL}/suite/session`)
      return Response.json({ token: "offline" });
    if (url.pathname === "/v1/cloud/drive-token")
      return Response.json({
        accessToken: "cloud",
        expiresAt: 4_000_000_000_000,
        audience: DRIVE_CLOUD_AUDIENCE,
      });
    return route(url, init);
  };
  return { client: new DriveClient(async () => "oauth", origin, fetcher), requests };
}
describe("Drive Cloud browser transport", () => {
  it("uses the account grant and Cloud audience without an environment connection", async () => {
    const { client, requests } = fakeApi(() => Response.json({ data: [] }));
    await client.folders();
    await client.folders();
    expect(requests.map((request) => request.url.pathname)).toEqual([
      "/v1/auth/suite/session",
      "/v1/cloud/drive-token",
      "/api/v1/folders",
      "/api/v1/folders",
    ]);
    const headers = new Headers(requests[2]!.init.headers);
    expect(headers.get("authorization")).toBe("Bearer cloud");
    expect(headers.get("x-otter-audience")).toBe(DRIVE_CLOUD_AUDIENCE);
  });
  it("reads every page before filtering documents", async () => {
    const { client, requests } = fakeApi((url) =>
      Response.json({
        data: [{ ...artifact, id: url.searchParams.has("cursor") ? "second" : "first" }],
        pagination: { nextCursor: url.searchParams.has("cursor") ? null : "next" },
      }),
    );
    expect((await client.documents("personal")).map((item) => item.id)).toEqual([
      "first",
      "second",
    ]);
    expect(new Headers(requests.at(-1)!.init.headers).get("x-otterdrive-folder")).toBe("personal");
  });
  it("publishes edited content with its inspected version and retained-file base", async () => {
    const { client, requests } = fakeApi((url) => {
      if (url.pathname.endsWith("/uploads"))
        return Response.json({
          data: {
            id: "upload",
            artifactId: artifact.id,
            expiresAt: version.createdAt,
            files: [{ path: "notes.txt", uploadUrl: `${origin}/api/v1/uploads/upload/files/file` }],
          },
        });
      if (url.pathname.endsWith("/complete")) return Response.json({ data: { artifact, version } });
      return new Response(null, { status: 204 });
    });
    await client.upload(new Blob(["hello"], { type: "text/plain" }), "notes.txt", {
      document: artifact,
      baseVersion: 1,
    });
    const manifest = JSON.parse(
      String(requests.find((request) => request.url.pathname.endsWith("/uploads"))!.init.body),
    );
    expect(manifest).toMatchObject({
      expectedCurrentVersion: 2,
      baseVersion: 1,
      files: [
        { size: 5, sha256: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824" },
      ],
    });
    expect(requests.some((request) => request.init.method === "DELETE")).toBe(false);
  });
  it("does not retry a conflict or delete an existing document", async () => {
    const { client, requests } = fakeApi(() =>
      Response.json(
        { error: { code: "version_conflict", message: "Current version changed" } },
        { status: 409 },
      ),
    );
    await expect(
      client.upload(new Blob(["hello"]), "notes.txt", { document: artifact }),
    ).rejects.toThrow("Current version changed");
    expect(requests.filter((request) => request.url.pathname.startsWith("/api/v1/")).length).toBe(
      1,
    );
    expect(requests.some((request) => request.init.method === "DELETE")).toBe(false);
  });
  it("preserves Cloud's account-linking guidance", async () => {
    const { client } = fakeApi(() =>
      Response.json({ error: "Sign in to Drive once to create your account." }, { status: 409 }),
    );
    await expect(client.folders()).rejects.toThrow("Sign in to Drive once");
  });
  it("refuses upload URLs outside Cloud and rendered HTML on the app origin", async () => {
    const { client, requests } = fakeApi(() => new Response(null, { status: 204 }));
    await expect(client.request("https://unrelated.example/api/v1/upload")).rejects.toThrow(
      "Invalid Drive API URL",
    );
    expect(requests).toHaveLength(0);
    expect(() => isolatedContentUrl(`${origin}/raw/a/id/v1/index.html`)).toThrow(
      "isolated content origin",
    );
    expect(
      isolatedContentUrl("https://usercontent.otterware.app/raw/a/id/v1/index.html"),
    ).toContain("usercontent.otterware.app");
  });
});

describe("public Drive links", () => {
  it("reads without an account grant and strips supplied authentication", async () => {
    const requests: RequestInit[] = [];
    const client = new DriveClient(
      async () => {
        throw new Error("Public reads must not request an account grant");
      },
      origin,
      async (_url, init = {}) => {
        requests.push(init);
        return Response.json({ data: [] });
      },
    );
    for (const path of [
      "/api/v1/links/token",
      "/api/v1/links/token/documents/doc",
      "/api/v1/links/token/documents/doc/content?path=notes.txt",
      "/api/v1/links/token/documents/doc/download",
    ]) {
      await client.request(path, {
        headers: { authorization: "Bearer private", "x-otter-audience": "private" },
        credentials: "include",
      });
    }
    for (const init of requests) {
      expect(new Headers(init.headers).has("authorization")).toBe(false);
      expect(new Headers(init.headers).has("x-otter-audience")).toBe(false);
      expect(init.credentials).toBe("omit");
    }
  });
  it("still requires an account grant for mutations and unrelated routes", async () => {
    let requests = 0;
    const client = new DriveClient(
      async () => null,
      origin,
      async () => {
        requests++;
        return new Response();
      },
    );
    await expect(client.request("/api/v1/links/token", { method: "POST" })).rejects.toThrow(
      "Sign in",
    );
    await expect(client.request("/api/v1/links/token/admin")).rejects.toThrow("Sign in");
    await expect(client.request("/api/v1/folders")).rejects.toThrow("Sign in");
    expect(requests).toBe(0);
  });
});
