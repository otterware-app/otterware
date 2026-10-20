import { useQuery } from "@tanstack/react-query";
import {
  artifactPreviewResponseSchema,
  linkPreviewResponseSchema,
} from "@otterware/drive-contracts/api";
import { isolatedContentUrl } from "@otterware/otter-cloud-client/drive";
import { api } from "../../lib/api";

// Signed URLs last an hour (content cookies four). Refresh well before that,
// and on returning to a stale reader, so late images and links still load.
const REFRESH_MS = 45 * 60 * 1_000;

export function useContentSession({
  folderId,
  reference,
  version,
  enabled,
  linkToken,
}: {
  /** The folder you reach the document through; undefined when by id. */
  folderId: string | undefined;
  /** Its slug in that folder, or its id. */
  reference: string;
  version: number;
  enabled: boolean;
  /** Opened by a link, without signing in: the grant comes from the link. */
  linkToken?: string | undefined;
}) {
  return useQuery({
    queryKey: [
      "content-session",
      linkToken ? `link:${linkToken}` : (folderId ?? "shared"),
      reference,
      version,
    ],
    queryFn: async ({ signal }) => {
      const preview = linkToken
        ? linkPreviewResponseSchema.parse(
            await api<unknown>(
              `/api/v1/links/${encodeURIComponent(linkToken)}/documents/${encodeURIComponent(reference)}`,
              { signal },
            ),
          ).data
        : artifactPreviewResponseSchema.parse(
            await api<unknown>(
              `/api/v1/artifacts/${encodeURIComponent(reference)}/preview?version=${version}`,
              { folderId, signal },
            ),
          ).data;
      if (preview.signedBaseUrl) return isolatedContentUrl(preview.signedBaseUrl);
      isolatedContentUrl(preview.resourceBaseUrl);
      await fetch(isolatedContentUrl(preview.url), {
        mode: "no-cors",
        credentials: "include",
        signal,
      });
      return preview.resourceBaseUrl;
    },
    enabled,
    staleTime: REFRESH_MS,
    gcTime: 60 * 60 * 1_000,
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: true,
    retry: false,
  });
}
