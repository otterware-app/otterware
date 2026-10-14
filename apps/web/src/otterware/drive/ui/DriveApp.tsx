import { withDriveSearch } from "~/otterware/drive/drivePaths";
import { parsePlace, readSearch } from "../drivePaths";
import { Button } from "~/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "~/components/ui/empty";
import { RenderErrorBoundary } from "~/components/RenderErrorBoundary";
import { Link, useNavigate } from "@tanstack/react-router";
import { useDriveStore } from "./driveStore";
import { useEffect, useEffectEvent, useState } from "react";
import { DriveClient } from "@otterware/otter-cloud-client/drive";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { LoaderIcon } from "lucide-react";
import { acceptLinkResponseSchema } from "@otterware/drive-contracts/api";

import { DriveHostProvider, useDriveHost, type DriveHost } from "./host";
import { api, setDriveClient } from "./lib/api";
import { DocumentRoute } from "./main/drive/document-route";
import { parseDriveSearch, type DriveSearch } from "./main/drive/documents";
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
  const [retry, setRetry] = useState(0);
  return (
    <DriveHostProvider host={host}>
      <QueryClientProvider client={queryClient}>
        <RenderErrorBoundary
          resetKeys={[host.account?.id, retry]}
          fallback={
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Drive couldn’t render this page</EmptyTitle>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" onClick={() => setRetry((value) => value + 1)}>
                  Try again
                </Button>
                <Button variant="outline" onClick={() => window.location.reload()}>
                  Reload
                </Button>
              </EmptyContent>
            </Empty>
          }
        >
          {host.accountPending ? (
            <p className="p-6">Loading Drive…</p>
          ) : !host.account ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Sign in to use Drive</EmptyTitle>
                <EmptyDescription>
                  Your drives use the Otter Account in App › Account.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button render={<Link to="/settings/account" />}>Open App › Account</Button>
              </EmptyContent>
            </Empty>
          ) : (
            <DriveRoutes />
          )}
        </RenderErrorBoundary>
      </QueryClientProvider>
    </DriveHostProvider>
  );
}

function DriveRoutes() {
  const navigate = useNavigate();
  const host = useDriveHost();
  const route = parsePlace(host.location.pathname);
  const search = parseDriveSearch(readSearch(host.location.search));
  const sheet = readSearch(host.location.search).sheet;
  const settingsPath =
    route.kind === "settings"
      ? route.pane === "members"
        ? "/settings/drive/access"
        : route.pane === "account"
          ? "/settings/account"
          : route.pane === "appearance"
            ? "/settings/appearance"
            : route.pane === "agents"
              ? "/settings/providers"
              : "/settings/drive/drives"
      : null;
  useEffect(() => {
    if (host.active && settingsPath) void navigate({ href: settingsPath, replace: true });
  }, [host.active, navigate, settingsPath]);
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
    void navigate({
      href: `${host.href(host.location.pathname)}${query ? `?${query}` : ""}`,
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
  const host = useDriveHost();
  const navigate = useNavigate();
  // Accepting a link adds access, so it runs once per token.
  const open = useEffectEvent((data: ReturnType<typeof acceptLinkResponseSchema.parse>["data"]) =>
    navigate({
      href:
        data.type === "artifact" && data.slug
          ? host.href(`/${encodeURIComponent(data.folderSlug)}/a/${encodeURIComponent(data.slug)}`)
          : withDriveSearch(host.href("/home"), { folder: data.folderId }),
      replace: true,
    }),
  );
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
        await open(data);
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
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{error ? "This link doesn’t work" : "Opening a shared link"}</EmptyTitle>
        <EmptyDescription>{error ?? "Adding it to Shared with me…"}</EmptyDescription>
      </EmptyHeader>
      {error ? null : <LoaderIcon className="size-4 animate-spin" />}
    </Empty>
  );
}
