import { createMailWebModule } from "@otterware/mail-web/module";
import { lazy } from "react";
export const MailWebModule = createMailWebModule(
  lazy(() => import("./MailPage")),
  lazy(() => import("./MailSettings")),
);
