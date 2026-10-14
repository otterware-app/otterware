import { createMailWebModule } from "@otterware/mail-web/module";
import { lazy } from "react";

import { useMailSpaces } from "./mailSpaces";

export const MailWebModule = createMailWebModule({
  page: lazy(() => import("./MailPage")),
  settings: lazy(() => import("./MailSettings")),
  useSpaces: useMailSpaces,
  stores: [{ id: "mail.background", runtime: lazy(() => import("./MailBackground")) }],
});
