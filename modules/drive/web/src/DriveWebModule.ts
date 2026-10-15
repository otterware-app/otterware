import { defineWebModule, type WebModule } from "@otterware/module-kit/web";
import { HardDriveIcon } from "lucide-react";

export const createDriveWebModule = (
  shell: Pick<
    WebModule,
    | "page"
    | "useSpaces"
    | "useSidebar"
    | "useHeaderActions"
    | "stores"
    | "settings"
    | "commands"
    | "threadAccessory"
  >,
) =>
  defineWebModule({
    id: "drive",
    label: "Drive",
    icon: HardDriveIcon,
    searchTerms: ["drive", "files", "documents", "folders", "upload"],
    serverModule: null,
    sideChat: true,
    ...shell,
  });
