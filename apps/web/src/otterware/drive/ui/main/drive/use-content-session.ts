import { useQuery } from "@tanstack/react-query";
import { artifactPreviewResponseSchema } from "@otterware/drive-contracts/api";
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
}: {
  /** The folder you reach the document through; undefined when by id. */
  folderId: string | undefined;
  /** Its slug in that folder, or its id. */
  reference: string;
  version: number;
  enabled: boolean;
}) {
  return useQuery({
    queryKey: ["content-session", folderId ?? "shared", reference, version],
    queryFn: async ({ signal }) => {
      const preview = artifactPreviewResponseSchema.parse(
        await api<unknown>(
          `/api/v1/artifacts/${encodeURIComponent(reference)}/preview?version=${version}`,
          { folderId, signal },
        ),
      ).data;
      // Uploaded content is never executed in the app, and only ever loaded
      // from usercontent.otterware.app. A signed base carries its grant in the
      // path, so it needs no cookie: the desktop app and servers outside
      // otterware.app cannot keep one on the content origin.
      if (preview.signedBaseUrl) return isolatedContentUrl(preview.signedBaseUrl);
      // Before Cloud signed URLs: fetching follows the redirect and sets the
      // content origin's HttpOnly cookie.
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
