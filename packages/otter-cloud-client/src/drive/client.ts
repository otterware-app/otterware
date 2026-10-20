// @effect-diagnostics globalDate:off cryptoRandomUUID:off -- Browser transport uses wall-clock capability expiry and upload IDs.
import { z } from "zod";
import {
  DRIVE_ACCOUNTS_URL,
  DRIVE_CLOUD_AUDIENCE,
  DRIVE_CLOUD_ORIGIN,
  DRIVE_CONTENT_HOST,
} from "@otterware/drive-contracts/constants";
import {
  acceptLinkResponseSchema,
  apiErrorSchema,
  artifactListResponseSchema,
  artifactResponseSchema,
  artifactVersionsResponseSchema,
  artifactPreviewResponseSchema,
  folderListResponseSchema,
  folderSchema,
  sharedWithMeResponseSchema,
  sharingResponseSchema,
  uploadSessionResponseSchema,
  completeUploadResponseSchema,
  multipartUploadPartResponseSchema,
  type Artifact,
  type Sharing,
} from "@otterware/drive-contracts/api";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

export class DriveRequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "DriveRequestError";
  }
}
export const isolatedContentUrl = (value: string) => {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.hostname !== DRIVE_CONTENT_HOST ||
    url.username ||
    url.password
  )
    throw new Error("Drive content must come from its isolated content origin.");
  return url.href;
};
const ref = encodeURIComponent;
export type SharingTarget = { kind: "artifacts" | "folders"; id: string; name: string };

/** Calls Cloud directly, including when no environment has ever been connected. */
export class DriveClient {
  private cached: { accountToken: string; token: string; expiresAt: number } | null = null;
  readonly getAccountToken: () => Promise<string | null>;
  readonly origin: string;
  private readonly fetcher: typeof globalThis.fetch;
  constructor(
    getAccountToken: () => Promise<string | null>,
    origin = DRIVE_CLOUD_ORIGIN,
    fetcher = globalThis.fetch.bind(globalThis),
  ) {
    this.getAccountToken = getAccountToken;
    const url = new URL(origin);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/" ||
      (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname))
    )
      throw new Error("Invalid Drive Cloud origin.");
    this.origin = url.origin;
    this.fetcher = fetcher;
  }
  clearSession() {
    this.cached = null;
  }
  private async capability(signal?: AbortSignal) {
    const accountToken = await this.getAccountToken();
    if (!accountToken) {
      this.clearSession();
      throw new DriveRequestError(401, "Sign in to your Otter Account to use Drive.");
    }
    if (this.cached?.accountToken === accountToken && this.cached.expiresAt > Date.now() + 30_000)
      return this.cached.token;
    const account = z.object({ token: z.string() }).parse(
      await this.checked(`${DRIVE_ACCOUNTS_URL}/suite/session`, {
        method: "POST",
        headers: { authorization: `Bearer ${accountToken}`, "content-type": "application/json" },
        body: "{}",
        credentials: "omit",
        ...(signal ? { signal } : {}),
      }).then((response) => response.json()),
    );
    if (!account.token) throw new Error("Accounts did not return a session.");
    const cloud = z
      .object({ accessToken: z.string(), expiresAt: z.number(), audience: z.string() })
      .parse(
        await this.checked(`${this.origin}/v1/cloud/drive-token`, {
          method: "POST",
          headers: { authorization: `Bearer ${account.token}`, "content-type": "application/json" },
          body: JSON.stringify({ audience: DRIVE_CLOUD_AUDIENCE }),
          credentials: "omit",
          ...(signal ? { signal } : {}),
        }).then((response) => response.json()),
      );
    if (!cloud.accessToken || !cloud.expiresAt || cloud.audience !== DRIVE_CLOUD_AUDIENCE)
      throw new Error("Cloud did not return a Drive capability.");
    this.cached = { accountToken, token: cloud.accessToken, expiresAt: cloud.expiresAt };
    return cloud.accessToken;
  }
  private async checked(url: string, init: RequestInit) {
    const response = await this.fetcher(url, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      if (response.status === 401) this.clearSession();
      const body: unknown = await response.json().catch(() => null);
      const error = apiErrorSchema.safeParse(body);
      throw new DriveRequestError(
        response.status,
        error.success
          ? error.data.error.message
          : body !== null &&
              typeof body === "object" &&
              "error" in body &&
              typeof body.error === "string"
            ? body.error
            : `Drive request failed (${response.status}).`,
      );
    }
    return response;
  }
  async request(path: string, init: RequestInit = {}, folderId?: string) {
    const url = new URL(path, this.origin);
    // Upload URLs are API endpoints, not arbitrary hosts carrying our bearer token.
    if (url.origin !== this.origin || !url.pathname.startsWith("/api/v1/"))
      throw new Error("Invalid Drive API URL.");
    const headers = new Headers(init.headers);
    const publicLink =
      (init.method ?? "GET") === "GET" &&
      /^\/api\/v1\/links\/[^/]+(?:\/documents\/[^/]+(?:\/(?:content|download))?)?\/?$/.test(
        url.pathname,
      );
    if (publicLink) {
      headers.delete("authorization");
      headers.delete("x-otter-audience");
    } else {
      headers.set("authorization", `Bearer ${await this.capability(init.signal ?? undefined)}`);
      headers.set("x-otter-audience", DRIVE_CLOUD_AUDIENCE);
    }
    if (folderId) headers.set("x-otterdrive-folder", folderId);
    if (typeof init.body === "string" && !headers.has("content-type"))
      headers.set("content-type", "application/json");
    return this.checked(url.href, { ...init, headers, credentials: "omit" });
  }
  async json(path: string, init: RequestInit = {}, folderId?: string): Promise<unknown> {
    const response = await this.request(path, init, folderId);
    return response.status === 204 ? undefined : response.json();
  }
  async folders(signal?: AbortSignal) {
    return folderListResponseSchema.parse(
      await this.json("/api/v1/folders", signal ? { signal } : {}),
    ).data;
  }
  async documents(folderId: string, signal?: AbortSignal, archived = false) {
    const documents: Artifact[] = [];
    let cursor: string | null = null;
    do {
      const query = new URLSearchParams({
        limit: "100",
        ...(archived ? { archived: "true" } : {}),
        ...(cursor ? { cursor } : {}),
      });
      const page = artifactListResponseSchema.parse(
        await this.json(`/api/v1/artifacts?${query}`, signal ? { signal } : {}, folderId),
      );
      documents.push(...page.data);
      if (cursor !== null && page.pagination.nextCursor === cursor)
        throw new Error("Drive repeated its page cursor.");
      cursor = page.pagination.nextCursor;
    } while (cursor);
    return documents;
  }
  async acrossFolders(folderIds: readonly string[], signal?: AbortSignal, archived = false) {
    let index = 0;
    const results: Artifact[][] = [];
    await Promise.all(
      Array.from({ length: Math.min(4, folderIds.length) }, async () => {
        for (;;) {
          const next = index++;
          const id = folderIds[next];
          if (!id) return;
          results[next] = await this.documents(id, signal, archived);
        }
      }),
    );
    return results.flat();
  }
  async shared(signal?: AbortSignal) {
    return sharedWithMeResponseSchema.parse(
      await this.json("/api/v1/shared", signal ? { signal } : {}),
    ).data;
  }
  async document(id: string, signal?: AbortSignal, folderId?: string) {
    return artifactResponseSchema.parse(
      await this.json(`/api/v1/artifacts/${ref(id)}`, signal ? { signal } : {}, folderId),
    ).data;
  }
  async acceptLink(token: string, signal?: AbortSignal) {
    return acceptLinkResponseSchema.parse(
      await this.json(`/api/v1/links/${ref(token)}`, {
        method: "POST",
        ...(signal ? { signal } : {}),
      }),
    ).data;
  }
  async versions(id: string, signal?: AbortSignal) {
    return artifactVersionsResponseSchema.parse(
      await this.json(`/api/v1/artifacts/${ref(id)}/versions`, signal ? { signal } : {}),
    ).data;
  }
  async content(id: string, version: number, signal?: AbortSignal) {
    return this.request(
      `/api/v1/artifacts/${ref(id)}/content?version=${version}`,
      signal ? { signal } : {},
    );
  }
  async preview(id: string, version: number, signal?: AbortSignal) {
    const data = artifactPreviewResponseSchema.parse(
      await this.json(
        `/api/v1/artifacts/${ref(id)}/preview?version=${version}`,
        signal ? { signal } : {},
      ),
    ).data;
    isolatedContentUrl(data.url);
    isolatedContentUrl(data.resourceBaseUrl);
    await this.fetcher(data.url, {
      mode: "no-cors",
      credentials: "include",
      ...(signal ? { signal } : {}),
    });
    return data;
  }
  async sharing(target: SharingTarget) {
    return sharingResponseSchema.parse(
      await this.json(`/api/v1/${target.kind}/${ref(target.id)}/sharing`),
    ).data;
  }
  async changeSharing(
    target: SharingTarget,
    action: string,
    method: string,
    body?: object,
  ): Promise<Sharing> {
    await this.json(`/api/v1/${target.kind}/${ref(target.id)}/sharing/${action}`, {
      method,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return this.sharing(target);
  }
  async createFolder(name: string, parentId: string | null, kind: "folder" | "shared" = "folder") {
    return z.object({ data: folderSchema }).parse(
      await this.json("/api/v1/folders", {
        method: "POST",
        body: JSON.stringify({ name, kind, ...(parentId ? { parentId } : {}) }),
      }),
    ).data;
  }
  async patch(id: string, input: object) {
    return artifactResponseSchema.parse(
      await this.json(`/api/v1/artifacts/${ref(id)}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    ).data;
  }
  async archive(id: string, archived: boolean) {
    await this.json(`/api/v1/artifacts/${ref(id)}${archived ? "" : "/restore"}`, {
      method: archived ? "DELETE" : "POST",
    });
  }
  async create(title: string, slug: string, folderId?: string, entryPath = "document.md") {
    return artifactResponseSchema.parse(
      await this.json(
        "/api/v1/artifacts",
        { method: "POST", body: JSON.stringify({ title, slug, entryPath }) },
        folderId,
      ),
    ).data;
  }
  async upload(
    blob: Blob,
    name: string,
    options: { document?: Artifact; folderId?: string; label?: string; baseVersion?: number } = {},
  ) {
    const hash = sha256.create();
    const reader = blob.stream().getReader();
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        hash.update(next.value);
      }
    } finally {
      reader.releaseLock();
    }
    const digest = bytesToHex(hash.digest());
    const folderId = options.folderId;
    const isNew = !options.document;
    const artifact =
      options.document ??
      (await this.create(
        name,
        `${
          name
            .replace(/\.[^.]+$/, " ")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 70) || "file"
        }-${crypto.randomUUID().slice(0, 8)}`,
        folderId,
        name,
      ));
    try {
      const session = uploadSessionResponseSchema.parse(
        await this.json(
          `/api/v1/artifacts/${ref(artifact.id)}/uploads`,
          {
            method: "POST",
            body: JSON.stringify({
              label: options.label ?? "Uploaded in Otter Drive",
              entryPath: name,
              expectedCurrentVersion: artifact.currentVersion?.number ?? 0,
              ...(options.baseVersion ? { baseVersion: options.baseVersion } : {}),
              files: [
                {
                  path: name,
                  contentType: blob.type || "application/octet-stream",
                  size: blob.size,
                  sha256: digest,
                },
              ],
            }),
          },
          folderId,
        ),
      ).data;
      const remote = session.files.find((file) => file.path === name);
      if (!remote || session.files.length !== 1)
        throw new Error("The upload session omitted the file.");
      const headers = {
        "content-type": blob.type || "application/octet-stream",
        "x-content-sha256": digest,
      };
      if (remote.multipart) {
        if (!remote.partSize || remote.partSize < 1) throw new Error("Invalid multipart size.");
        const parts = [];
        for (
          let partNumber = 1;
          partNumber <= Math.ceil(blob.size / remote.partSize);
          partNumber++
        ) {
          const url = new URL(remote.uploadUrl, this.origin);
          url.searchParams.set("part", String(partNumber));
          const receipt = multipartUploadPartResponseSchema.parse(
            await this.json(
              url.href,
              {
                method: "PUT",
                headers,
                body: blob.slice((partNumber - 1) * remote.partSize, partNumber * remote.partSize),
              },
              folderId,
            ),
          ).data;
          if (receipt.partNumber !== partNumber)
            throw new Error("Drive returned the wrong multipart receipt.");
          parts.push(receipt);
        }
        await this.json(
          `${remote.uploadUrl}/complete`,
          { method: "POST", body: JSON.stringify({ parts }) },
          folderId,
        );
      } else await this.request(remote.uploadUrl, { method: "PUT", headers, body: blob }, folderId);
      return completeUploadResponseSchema.parse(
        await this.json(
          `/api/v1/uploads/${ref(session.id)}/complete`,
          { method: "POST" },
          folderId,
        ),
      ).data.artifact;
    } catch (error) {
      if (isNew)
        await this.json(
          `/api/v1/artifacts/${ref(artifact.id)}/draft`,
          { method: "DELETE" },
          folderId,
        ).catch(() => undefined);
      throw error;
    }
  }
}
