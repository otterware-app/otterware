import { useDriveStore } from "./driveStore";
import { useEffect, useEffectEvent, useState } from "react";
import { DriveClient } from "@otterware/otter-cloud-client/drive";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { LoaderIcon } from "lucide-react";
import { acceptLinkResponseSchema } from "@otterware/drive-contracts/api";
import { DriveErrorBoundary } from "./components/ui/error-boundary-view";
import { ToastProvider } from "./components/ui/toast";
import { DriveHostProvider, useDriveHost, type DriveHost } from "./host";
import { api, setDriveClient } from "./lib/api";
import { parsePlace, readSearch, useNavigate } from "./lib/router";
import { AuthGate } from "./main/auth/auth-gate";
import { AuthShell } from "./main/auth/auth-shell";
import { DocumentRoute } from "./main/drive/document-route";
import { driveSearchSchema, type DriveSearch } from "./main/drive/documents";
import { Overview, SharedOverview } from "./main/drive/overview";
import { DriveHome, useDrive, type Place } from "./main/home-view";

/** The Cloud client a host hands Drive; it reads the account's token per request. */
export const createDriveCloudClient = (getAccountToken: () => Promise<string | null>) =>
  new DriveClient(getAccountToken);

/**
 * Drive's window, for whichever app hosts it: the Otterware shell's module
 * page or the standalone web app. The host supplies the account, the Cloud
 * client and the location; everything below talks to Otter Cloud directly.
 */
export function DriveApp({ host }: { host: DriveHost }) {
  setDriveClient(host.transport);
  const queryClient = useDriveStore((state) => state.queryClient);
  return (
    <DriveHostProvider host={host}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider visible={host.active}>
          <div className="relative flex h-full min-h-0 w-full min-w-0 flex-1 flex-col bg-sidebar text-foreground">
            <DriveErrorBoundary>
              <AuthGate fallback={<p className="p-6">Loading Drive…</p>}>
                <DriveRoutes />
              </AuthGate>
            </DriveErrorBoundary>
          </div>
        </ToastProvider>
      </QueryClientProvider>
    </DriveHostProvider>
  );
}

function DriveRoutes() {
  const host = useDriveHost();
  const route = parsePlace(host.location.pathname);
  const search = driveSearchSchema.parse(readSearch(host.location.search));
  const sheet = readSearch(host.location.search).sheet;
  const settingsPath = route.kind === "settings" ? `/settings/${route.pane}` : null;
  useEffect(() => {
    if (host.active && settingsPath) host.navigate(settingsPath, { replace: true });
  }, [host, settingsPath]);
  if (settingsPath) return null;
  if (route.kind === "shared-link") return <AcceptLink token={route.token} />;

  const place: Place =
    route.kind === "document"
      ? { kind: "document", folderSlug: route.folderSlug, slug: route.slug }
      : route;
  const onSearchChange = (update: Partial<DriveSearch>, replace = false) => {
    const next = new URLSearchParams(host.location.search);
    for (const [key, value] of Object.entries(update))
      if (value === undefined || value === "") next.delete(key);
      else next.set(key, value);
    const query = next.toString();
    host.navigate(`${host.location.pathname}${query ? `?${query}` : ""}`, {
      replace,
    });
  };
  return (
    <DriveHome place={place} search={search} onSearchChange={onSearchChange}>
      {route.kind === "document" ? (
        <DocumentRoute
          folderSlug={route.folderSlug}
          slug={route.slug}
          version={route.version}
          sheet={sheet}
        />
      ) : (
        <HomeRoute />
      )}
    </DriveHome>
  );
}

function HomeRoute() {
  const { folder, documents, documentsLoading, noFolder, sharedView, sharedListed, sharedLoading } =
    useDrive();
  return (
    <>
      {sharedView ? (
        <SharedOverview items={sharedListed} loading={sharedLoading} />
      ) : (
        <Overview
          folder={folder}
          documents={documents}
          loading={documentsLoading}
          noFolder={noFolder}
        />
      )}
    </>
  );
}

/**
 * A link shared with "anyone with the link": opening it adds you to the
 * folder or document it shares, then opens it.
 */
function AcceptLink({ token }: { token: string }) {
  const navigate = useNavigate();
  // Accepting a link adds access, so it runs once per token.
  const open = useEffectEvent((target: Parameters<typeof navigate>[0]) => navigate(target));
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api<unknown>(`/api/v1/links/${encodeURIComponent(token)}`, {
      method: "POST",
    })
      .then(async (result) => {
        if (!active) return;
        const { data } = acceptLinkResponseSchema.parse(result);
        // The new access shows in the folders and Shared with me at once.
        queryClient.removeQueries({ queryKey: ["folders"] });
        queryClient.removeQueries({ queryKey: ["shared-with-me"] });
        if (data.type === "artifact" && data.slug)
          await open({
            to: "/$folderSlug/a/$slug",
            params: { folderSlug: data.folderSlug, slug: data.slug },
            replace: true,
          });
        else
          await open({
            to: "/home",
            search: { folder: data.folderId },
            replace: true,
          });
      })
      .catch((reason: unknown) => {
        if (active)
          setError(reason instanceof Error ? reason.message : "This link could not be opened.");
      });
    return () => {
      active = false;
    };
  }, [queryClient, token]);

  return (
    <AuthShell
      title={error ? "This link doesn’t work" : "Opening a shared link"}
      description={error ?? "Adding it to Shared with me…"}
    >
      {error ? null : (
        <div className="flex justify-center text-muted-foreground">
          <LoaderIcon className="size-4 animate-spin" />
        </div>
      )}
    </AuthShell>
  );
}
