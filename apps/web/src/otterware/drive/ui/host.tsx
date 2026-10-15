import type { DriveClient } from "@otterware/otter-cloud-client/drive";
import { createContext, useContext, type ReactNode } from "react";

/** The signed-in Otter Account, as Drive shows it (rail avatar, sharing). */
export interface DriveAccount {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly image?: string | null;
}

/** Where Drive is: a path below its own root (`/home`, `/<folder>/a/<slug>`) and its query. */
export interface DriveLocation {
  readonly pathname: string;
  readonly search: string;
}

/** The host account, transport and cached module location. */
export interface DriveHost {
  /** Calls Otter Cloud directly with the account's token (ADR 0008). */
  readonly transport: DriveClient;
  /** Null while signed out. */
  readonly account: DriveAccount | null;
  /** The account is still being restored. */
  readonly accountPending: boolean;
  readonly location: DriveLocation;
  /** The href an anchor uses for a Drive path. */
  readonly href: (to: string) => string;
  /**
   * Opens a Drive path outside this window: a browser tab of this site, or,
   * from the desktop app, of drive.otterware.app.
   */
  readonly openInNewTab: (to: string) => void;
  /** The page is showing; shortcuts and page context pause while it is not. */
  readonly active: boolean;
  /**
   * A version was opened. The shell records it so Home stops listing the
   * document as changed (`drive.markViewed`); absent without an environment.
   */
  readonly onDocumentViewed?: (artifactId: string, version: number) => void;
}

const HostContext = createContext<DriveHost | null>(null);

export function DriveHostProvider({ host, children }: { host: DriveHost; children: ReactNode }) {
  return <HostContext value={host}>{children}</HostContext>;
}

export function useDriveHost(): DriveHost {
  const host = useContext(HostContext);
  if (!host) throw new Error("Drive needs a DriveHostProvider.");
  return host;
}

/** The signed-in account; Drive's pages only render while there is one. */
export function useDriveAccount(): DriveAccount | null {
  return useDriveHost().account;
}
