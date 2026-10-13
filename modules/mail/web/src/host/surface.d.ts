import type { ReactElement } from "react";
import type { MailSurfaceProps, MailSettingsProps } from "./public";
/** The renderer is checked with its own compiler settings; the host consumes this boundary. */
export declare function MailSurface(props: MailSurfaceProps): ReactElement;
export declare function SettingsPage(props: MailSettingsProps): ReactElement;
export { MailSession } from "./session";
export type { MailWebHost, MailPageSelection } from "./bridge";
export type { SettingsRoute } from "./public";
