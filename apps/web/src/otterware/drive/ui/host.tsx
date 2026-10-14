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

/**
 * What the app around Drive supplies. The Otterware shell and the standalone
 * web app (`standalone.tsx`) each build one; Drive's components never reach
 * past it for routing, sign-in or the Cloud client.
 */
export interface DriveHost {
  /** Calls Otter Cloud directly with the account's token (ADR 0008). */
  readonly transport: DriveClient;
  /** Null while signed out. */
  readonly account: DriveAccount | null;
  /** The account is still being restored. */
  readonly accountPending: boolean;
  readonly signIn: () => void;
  /** Null where the surrounding app owns signing out (the Otterware shell). */
  readonly signOut: (() => Promise<void>) | null;
  readonly location: DriveLocation;
  /** `to` is a Drive path with an optional query, e.g. `/home?folder=x`. */
  readonly navigate: (to: string, options?: { readonly replace?: boolean }) => void;
  /** The href an anchor uses for a Drive path. */
  readonly href: (to: string) => string;
  /**
   * Opens a Drive path outside this window: a browser tab of this site, or,
   * from the desktop app, of drive.otterware.app.
   */
  readonly openInNewTab: (to: string) => void;
  /**
   * Holds navigations, the browser's Back and Forward included, while
   * `shouldBlock` resolves true for the Drive path they lead to; leaving Drive
   * for another page of the surrounding app is never held. Returns the release.
   */
  readonly blockNavigation: (blocker: {
    readonly shouldBlock: (next: DriveLocation) => boolean | Promise<boolean>;
    readonly beforeUnload: () => boolean;
  }) => () => void;
  /** Inside the Otterware shell: the shell owns the window, its palette, theme and account. */
  readonly embedded: boolean;
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
