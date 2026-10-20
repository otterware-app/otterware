/**
 * Keeps this browser's environment signed in to the page's Otter Account:
 * attaches the Account's token whenever it changes and detaches on sign-out,
 * so engines reach Otter Cloud as this browser's device (ADR 0018).
 */
import { useEffect } from "react";
import * as Effect from "effect/Effect";

import { useAuth } from "../../accounts/AccountProvider";
import { resolveCloudPublicConfig } from "../../cloud/publicConfig";
import { MAIL_RELAY_URL } from "../account/browserGoogle";
import { browserClient, runInBrowser } from "./runtime";

const CLOUD_ORIGIN =
  (import.meta.env.VITE_OTTER_CLOUD_ORIGIN as string | undefined) || "https://cloud.otterware.app";
/** Account access tokens live about an hour; re-attach well before. */
const REFRESH_MS = 20 * 60_000;

export function BrowserAccountBridge() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  useEffect(() => {
    if (!isLoaded) return;
    const { accountsUrl } = resolveCloudPublicConfig();
    if (!isSignedIn || !accountsUrl) {
      void runInBrowser(
        Effect.flatMap(browserClient, (client) => client["browser.account.detach"]({})),
      ).catch(() => {});
      return;
    }
    let active = true;
    const attach = async () => {
      const accessToken = await getToken().catch(() => null);
      if (!active || accessToken === null) return;
      await runInBrowser(
        Effect.flatMap(browserClient, (client) =>
          client["browser.account.attach"]({
            accessToken,
            accountsUrl,
            cloudOrigin: CLOUD_ORIGIN,
            mailRelayUrl: MAIL_RELAY_URL,
          }),
        ),
      ).catch(() => {});
    };
    void attach();
    const timer = window.setInterval(() => void attach(), REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [isLoaded, isSignedIn, getToken]);
  return null;
}
