import {
  defineWebModule,
  type WebModule,
  type WebModuleSettingsSection,
} from "@otterware/module-kit/web";
import { HardDriveIcon } from "lucide-react";

/**
 * Drive's registration. The host supplies the page and the settings section,
 * which wrap `DriveApp` and `DriveSettings` in its account and routing; Drive
 * needs no server module to browse (it calls Otter Cloud directly).
 */
export const createDriveWebModule = (
  page: WebModule["page"],
  settings: WebModuleSettingsSection["component"],
  /** A thread's linked documents, from the environment's Drive module. */
  threadAccessory: NonNullable<WebModule["threadAccessory"]>,
) =>
  defineWebModule({
    id: "drive",
    label: "Drive",
    icon: HardDriveIcon,
    rail: { position: "start", order: 30 },
    page,
    settings: {
      label: "Drive",
      icon: HardDriveIcon,
      searchTerms: ["drive", "files", "documents", "folders", "members", "sharing"],
      component: settings,
    },
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
    threadAccessory,
  });
