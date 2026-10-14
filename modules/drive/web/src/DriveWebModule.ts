import { defineWebModule, type WebModule } from "@otterware/module-kit/web";
import { HardDriveIcon } from "lucide-react";

/**
 * Drive's registration. The host supplies the page and the settings page,
 * which wrap `DriveApp` and `DriveSettings` in its account and routing; Drive
 * needs no server module to browse (it calls Otter Cloud directly). Chunk 3
 * of the rebuild adds the spaces (drives), sidebar rows, header actions and
 * the settings pages per docs/adr/0011.
 */
export const createDriveWebModule = (
  shell: Pick<WebModule, "page" | "useSpaces" | "useSidebar" | "useHeaderActions" | "stores"> & {
    readonly settings: WebModule["settings"][number]["component"];
    /** A thread's linked documents, from the environment's Drive module. */
    readonly threadAccessory: NonNullable<WebModule["threadAccessory"]>;
  },
) => {
  const { settings, ...rest } = shell;
  return defineWebModule({
    id: "drive",
    label: "Drive",
    icon: HardDriveIcon,
    ...rest,
    settings: [
      {
        id: "drive",
        label: "Drive",
        icon: HardDriveIcon,
        searchTerms: ["drive", "files", "documents", "folders", "members", "sharing"],
        component: settings,
        placement: { grouped: "page", standalone: "page" },
      },
    ],
    commands: [
      {
        id: "drive.shared",
        title: "Drive: Shared with me",
        searchTerms: ["shared", "drive", "documents"],
        subpath: "home?view=shared",
      },
      {
        id: "drive.recent",
        title: "Drive: recent documents",
        searchTerms: ["recent", "drive", "documents", "this week"],
        subpath: "home?view=recent",
      },
      {
        id: "drive.folder-settings",
        title: "Drive: folder settings",
        searchTerms: ["drive", "folder", "members", "rename"],
        subpath: "settings/folder",
      },
    ],
    searchTerms: ["drive", "files", "documents", "folders", "upload"],
    serverModule: null,
    sideChat: true,
  });
};
