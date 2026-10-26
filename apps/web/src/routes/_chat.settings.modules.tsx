import { createFileRoute } from "@tanstack/react-router";

import { ModulesSettingsPage } from "../otterware/ModulesSettingsPage";

export const Route = createFileRoute("/_chat/settings/modules")({
  component: ModulesSettingsPage,
});
