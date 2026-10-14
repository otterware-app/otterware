import { createHomeWebModule } from "@otterware/composition/web";
import { lazy } from "react";

export const HomeWebModule = createHomeWebModule(lazy(() => import("./HomePage")));
