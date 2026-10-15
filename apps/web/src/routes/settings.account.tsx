import { createFileRoute } from "@tanstack/react-router";

import { AccountSettingsPage } from "../otterware/account/AccountSettingsPage";

export const Route = createFileRoute("/settings/account")({
  component: AccountSettingsPage,
});
