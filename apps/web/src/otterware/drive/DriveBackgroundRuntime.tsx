import { useEffect, useState } from "react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { DriveClient } from "@otterware/otter-cloud-client/drive";
import type { Folder } from "@otterware/drive-contracts/api";
import { useAuth } from "../../accounts/AccountProvider";
import { useDriveStore } from "./ui/driveStore";
import { api, setDriveClient } from "./ui/lib/api";
import { removeSessionCachePrefix } from "./ui/lib/session-cache";

function Directory({ accountId }: { accountId: string | null }) {
  const query = useQuery({
    queryKey: ["folders", accountId ?? undefined],
    enabled: Boolean(accountId),
    queryFn: async () => (await api<{ data: Folder[] }>("/api/v1/folders")).data,
  });
  useEffect(() => {
    useDriveStore.setState({
      folders: query.data ?? [],
      error: query.error ? String(query.error) : null,
    });
  }, [query.data, query.error]);
  return null;
}
export default function DriveBackgroundRuntime() {
  const auth = useAuth();
  const [client] = useState(() => new DriveClient(auth.getToken));
  const queryClient = useDriveStore((state) => state.queryClient);
  const accountId = auth.user?.id ?? null;
  useEffect(() => {
    queryClient.clear();
    client.clearSession();
    removeSessionCachePrefix("otterdrive:");
    setDriveClient(client);
    useDriveStore.setState({
      transport: client,
      accountId,
      folders: [],
      folderId: null,
      error: null,
    });
    return () => {
      queryClient.clear();
      useDriveStore.setState({ transport: null, accountId: null, folders: [], folderId: null });
    };
  }, [accountId, client, queryClient]);
  const ready = useDriveStore(
    (state) => state.transport === client && state.accountId === accountId,
  );
  return ready ? (
    <QueryClientProvider client={queryClient}>
      <Directory accountId={accountId} />
    </QueryClientProvider>
  ) : null;
}
