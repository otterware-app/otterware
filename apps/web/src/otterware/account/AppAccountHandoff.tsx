import { useEffect } from "react";
import { useAuth } from "../../accounts/AccountProvider";
import { isElectron } from "../../env";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { useAtomCommand } from "../../state/use-atom-command";
import { handAppAccount } from "./rpc";

// The environment reuses its suite session for days, so handing a token hourly keeps it renewed.
const HAND_EVERY_MS = 60 * 60_000;
const RETRY_MS = 15_000;

/**
 * The desktop app's built-in environment uses the Otter Account the app is signed in to: this
 * hands it the app's access token while the app is open, and null once the app signs out.
 * Mounted once in the shell; other clients and headless environments keep their own sign-in.
 */
export function AppAccountHandoff() {
  return isElectron ? <Handoff /> : null;
}

function Handoff() {
  const auth = useAuth();
  const environmentId = usePrimaryEnvironmentId();
  const hand = useAtomCommand(handAppAccount);
  const { isLoaded, userId, getToken } = auth;
  useEffect(() => {
    if (!isLoaded || environmentId === null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const run = async () => {
      // A failed renewal must not sign the environment out; the app's own sign-out hands null.
      const accessToken = userId === null ? null : await getToken().catch(() => undefined);
      const result =
        accessToken === undefined
          ? null
          : await hand({ environmentId, input: { accessToken } }).catch(() => null);
      if (!stopped) timer = setTimeout(run, result?._tag === "Success" ? HAND_EVERY_MS : RETRY_MS);
    };
    void run();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [isLoaded, userId, environmentId, getToken, hand]);
  return null;
}
