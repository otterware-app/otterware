import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  sharedLinkResponseSchema,
  linkPreviewResponseSchema,
} from "@otterware/drive-contracts/api";
import { isolatedContentUrl } from "@otterware/otter-cloud-client/drive";
import { toastManager } from "~/components/ui/toast";
import { Button } from "~/components/ui/button";
import { api, apiFetch } from "../../lib/api";
import { documentKind } from "../../lib/document-kind";
import { useDriveHost } from "../../host";
import { DocumentPreview } from "./document-preview";

/** Public link access never accepts membership or borrows an account's permission. */
export function LinkView({ token, folder, doc }: { token: string; folder?: string; doc?: string }) {
  const host = useDriveHost();
  const navigate = useNavigate();
  const base = `/api/v1/links/${encodeURIComponent(token)}`;
  const link = useQuery({
    queryKey: ["drive-public-link", token, folder],
    queryFn: async ({ signal }) =>
      sharedLinkResponseSchema.parse(
        await api(base + (folder ? `?folder=${encodeURIComponent(folder)}` : ""), { signal }),
      ).data,
    retry: false,
  });
  const documentId = doc ?? link.data?.document?.id;
  const preview = useQuery({
    queryKey: ["drive-public-preview", token, documentId],
    enabled: Boolean(documentId),
    queryFn: async ({ signal }) =>
      linkPreviewResponseSchema.parse(
        await api(`${base}/documents/${encodeURIComponent(documentId!)}`, { signal }),
      ).data,
    retry: false,
  });
  const open = (next: { folder?: string; doc?: string }) => {
    const search = new URLSearchParams();
    if (next.folder) search.set("folder", next.folder);
    if (next.doc) search.set("doc", next.doc);
    void navigate({
      href: `${host.href(`/s/${encodeURIComponent(token)}`)}${search.size ? `?${search}` : ""}`,
    });
  };
  const error = link.error ?? preview.error;
  const shown = preview.data;
  const kind = shown ? documentKind(shown.contentType, shown.document.version.entryPath) : null;
  const download = async () => {
    if (!shown) return;
    try {
      const response = await apiFetch(
        `${base}/documents/${encodeURIComponent(shown.document.id)}/download`,
      );
      const url = URL.createObjectURL(await response.blob());
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download =
        response.headers.get("content-disposition")?.match(/filename="?([^";]+)"?/i)?.[1] ??
        shown.document.version.entryPath;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      toastManager.add({
        type: "error",
        title: "Could not download",
        description: reason instanceof Error ? reason.message : String(reason),
      });
    }
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-medium">
          {shown?.document.title ?? link.data?.name ?? "Shared link"}
        </span>
        <span className="text-xs text-muted-foreground">View only</span>
        {shown ? (
          <Button size="sm" variant="outline" onClick={() => void download()}>
            Download
          </Button>
        ) : null}
        {doc || folder ? (
          <Button size="sm" variant="outline" onClick={() => open({})}>
            Back to shared folder
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert">{error.message}</p>
      ) : !link.data ? (
        <p>Loading shared link…</p>
      ) : shown && kind ? (
        kind === "frame" ? (
          <iframe
            title={shown.document.title}
            className="min-h-0 w-full flex-1 border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-downloads"
            src={isolatedContentUrl(shown.signedUrl)}
          />
        ) : kind === "video" ? (
          <video
            controls
            className="min-h-0 w-full flex-1"
            src={isolatedContentUrl(shown.signedUrl)}
          />
        ) : (
          <DocumentPreview
            readOnly
            kind={kind}
            reference={shown.document.id}
            version={shown.document.version.number}
            entryPath={shown.document.version.entryPath}
            folderId={undefined}
            folderSlug="shared"
            slug={shown.document.id}
            linkToken={token}
          />
        )
      ) : documentId ? (
        <p>Loading document…</p>
      ) : (
        <div className="flex flex-col items-start gap-1">
          {link.data.folder?.folders.map((item) => (
            <Button key={item.id} variant="ghost" onClick={() => open({ folder: item.id })}>
              {item.name}
            </Button>
          ))}
          {link.data.folder?.documents.map((item) => (
            <Button
              key={item.id}
              variant="ghost"
              onClick={() => open({ ...(folder ? { folder } : {}), doc: item.id })}
            >
              {item.title}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
