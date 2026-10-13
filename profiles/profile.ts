/**
 * An app profile: which modules a build ships, under which brand, data home
 * and update feed. Chosen at build time with `OTTERWARE_PROFILE` (see
 * `./active.ts`); the same profile object reaches the server, the web app, the
 * desktop main process and the packaging scripts.
 *
 * Plain data with relative imports only: `apps/desktop/scripts/electron-launcher.mjs`
 * loads these files directly with Node's type stripping.
 */

export const PROFILE_IDS = ["otterware", "code", "mail", "calendar", "drive"] as const;
export type ProfileId = (typeof PROFILE_IDS)[number];

/** Modules a profile can list. Code is not a module (ADR 0004): see `codeVisible`. */
export const MODULE_IDS = ["home", "mail", "calendar", "drive"] as const;
export type ModuleId = (typeof MODULE_IDS)[number];

export interface ProfileBrand {
  /** Shown in the UI, window title and macOS bundle name. */
  readonly productName: string;
  /** Dev builds of every profile carry the suffix so they run beside the installed app. */
  readonly devProductName: string;
  /** macOS bundle ID, Windows AppUserModelID, Linux desktop-entry stem. */
  readonly appId: string;
  readonly devAppId: string;
  /** Deep links and the custom protocol the packaged renderer is served from. */
  readonly urlScheme: string;
  readonly devUrlScheme: string;
  /** Linux executable, WM class, and the Electron userData folder name. */
  readonly slug: string;
  readonly devSlug: string;
  /** electron-builder's artifact name template. */
  readonly artifactName: string;
  /** Directories under the repo's `assets/` holding the brand kit exports, by channel. */
  readonly icons: {
    readonly production: string;
    readonly nightly: string;
    readonly development: string;
    /** File name prefix inside those directories, e.g. `otter` for `otter-macos-1024.png`. */
    readonly filePrefix: string;
  };
  /** The CLI's npm identity, or null for profiles that ship no CLI. */
  readonly npm: {
    readonly launcherPackage: string;
    readonly platformPackageScope: string;
    readonly platformPackagePrefix: string;
  } | null;
}

export interface ProfileUpdateFeed {
  /** GitHub repository whose Releases carry the desktop update manifests. */
  readonly repository: string;
  /**
   * Channel prefix on that repository, so profiles never read each other's
   * manifests: `mail` yields `mail-nightly` / `mail-latest`. Null keeps the
   * bare `nightly` / `latest` names Otter Code installs already poll.
   */
  readonly channelPrefix: string | null;
}

export interface AppProfile {
  readonly id: ProfileId;
  /** Modules built into this profile, in rail order. Absent means "not installed". */
  readonly modules: ReadonlyArray<ModuleId>;
  /** Whether Code's surfaces (projects, threads, coding settings) are shown. Hide-only (ADR 0004). */
  readonly codeVisible: boolean;
  readonly brand: ProfileBrand;
  /**
   * Directory name under the user's home that holds the server state
   * (`userdata/statev2.sqlite`, `suite.sqlite`). ADR 0012: Otterware and Otter
   * Code share `.otter-code`; standalone apps get their own.
   */
  readonly dataHome: string;
  readonly updateFeed: ProfileUpdateFeed;
  /** Where the web app lands on its first open. */
  readonly landingRoute: string;
}

export const defineProfile = <const P extends AppProfile>(profile: P): P => profile;

export const OTTERWARE_RELEASE_REPOSITORY = "otterware-app/otterware";

/** Otter Code's brand kit; the other profiles borrow it until their own art lands. */
export const OTTER_CODE_ICONS: ProfileBrand["icons"] = {
  production: "assets/otter",
  nightly: "assets/otter-nightly",
  development: "assets/otter-dev",
  filePrefix: "otter",
};
