import { createFileRoute } from "@tanstack/react-router";

import { AccountSettingsPage } from "../otterware/account/AccountSettingsPage";

export const Route = createFileRoute("/_chat/settings/account")({
  component: AccountSettingsPage,
});
