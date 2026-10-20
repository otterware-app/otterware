import * as Effect from "effect/Effect";
import { browserClient, runInBrowser } from "../browser/runtime";

/** Otter Mail's relay: it runs Google's consent for browsers and seals the grant (BrowserGoogle). */
export const MAIL_RELAY_URL =
  (import.meta.env.VITE_OTTER_MAIL_RELAY_URL as string | undefined) ||
  "https://relay.mail.otterware.app";

/**
 * Connects Google in this browser: the relay's consent opens in a popup and posts back a grant
 * sealed for this Otter Account, which this browser keeps. Other devices connect their own.
 */
export async function connectGoogleInBrowser(): Promise<void> {
  // Opened before the first await so the browser treats it as part of the click.
  const popup = window.open("about:blank", "otter-gmail-sign-in", "popup,width=520,height=680");
  if (!popup) throw new Error("Allow pop-ups for this site to connect Google.");
  try {
    const { url } = await runInBrowser(
      Effect.flatMap(browserClient, (client) =>
        client["browser.account.connect"]({
          provider: "google",
          scopes: [],
          returnTo: window.location.href,
        }),
      ),
    );
    popup.location.href = url;
    const grant = await new Promise<{ email: string; sealed: string }>((resolve, reject) => {
      const done = () => {
        window.removeEventListener("message", onMessage);
        window.clearInterval(closedCheck);
      };
      const onMessage = (event: MessageEvent) => {
        const data = event.data as {
          type?: string;
          result?: { email: string; sealed: string };
          error?: string;
        };
        if (event.origin !== new URL(MAIL_RELAY_URL).origin || data?.type !== "otter:gmail-sign-in")
          return;
        done();
        if (data.result) resolve({ email: data.result.email, sealed: data.result.sealed });
        else reject(new Error(data.error ?? "Google sign-in didn't work."));
      };
      const closedCheck = window.setInterval(() => {
        if (popup.closed) {
          done();
          reject(new Error("Google sign-in was closed before it finished."));
        }
      }, 500);
      window.addEventListener("message", onMessage);
    });
    await runInBrowser(
      Effect.flatMap(browserClient, (client) => client["browser.account.saveGoogle"](grant)),
    );
  } finally {
    if (!popup.closed) popup.close();
  }
}
