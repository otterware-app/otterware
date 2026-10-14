import type { ReactNode } from "react";
import type { MailWebHost } from "./bridge";
import type { MailSession } from "./session";
export interface MailSurfaceProps {
  host: MailWebHost;
  session: MailSession;
  path?: string | undefined;
  children?: ReactNode | undefined;
}
export type SettingsRoute = {
  pane:
    | "general"
    | "appearance"
    | "keybindings"
    | "accounts"
    | "agents"
    | "browser"
    | "integrations"
    | "otter";
  target?: string | undefined;
};
export interface MailSettingsProps {
  route: SettingsRoute;
  onNavigate: (route: SettingsRoute) => void;
}
