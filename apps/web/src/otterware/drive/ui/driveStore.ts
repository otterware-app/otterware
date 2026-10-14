import { createClientStore, type ModuleHeaderAction } from "@otterware/module-kit/web";
import { QueryClient } from "@tanstack/react-query";
import type { Folder } from "@otterware/drive-contracts/api";
import type { DriveClient } from "@otterware/otter-cloud-client/drive";

/** One cache for the runtime, page and Settings; route visits never construct clients. */
export const useDriveStore = createClientStore<{
  queryClient: QueryClient;
  transport: DriveClient | null;
  accountId: string | null;
  folders: Folder[];
  folderId: string | null;
  error: string | null;
  pendingCommand: string | null;
  viewerExpanded: boolean;
  documentActions: readonly ModuleHeaderAction[];
}>(() => ({
  queryClient: new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 30_000 } },
  }),
  transport: null,
  accountId: null,
  folders: [],
  folderId: null,
  error: null,
  pendingCommand: null,
  viewerExpanded: false,
  documentActions: [],
}));
export function runDriveCommand(command: string) {
  useDriveStore.setState({ pendingCommand: command });
}
