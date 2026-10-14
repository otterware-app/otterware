/**
 * Explains why a browser-backed page waits: this browser profile's
 * environment runs in one tab at a time, and this tab takes over as soon as
 * the other one closes.
 */
import { useAtomValue } from "@effect/atom-react";
import {
  BrowserEnvironment,
  type BrowserEnvironmentStatus,
} from "@t3tools/client-runtime/otterware/browser-environment";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { AsyncResult } from "effect/reactivity";
import { InfoIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { browserAtomRuntime } from "./runtime";

const statusAtom = browserAtomRuntime.atom(
  Stream.unwrap(
    Effect.gen(function* () {
      const environment = yield* BrowserEnvironment;
      return SubscriptionRef.changes(environment.status);
    }),
  ),
);

export function useBrowserEnvironmentStatus(): BrowserEnvironmentStatus {
  return Option.getOrElse(AsyncResult.value(useAtomValue(statusAtom)), () => "idle" as const);
}

export function BrowserEnvironmentNotice() {
  if (useBrowserEnvironmentStatus() !== "elsewhere") return null;
  return (
    <Alert variant="info">
      <InfoIcon />
      <AlertTitle>Open in another tab</AlertTitle>
      <AlertDescription>
        Your mail, calendars and chats in this browser are in use in another tab. Switch to that
        tab, or close it and this one continues automatically.
      </AlertDescription>
    </Alert>
  );
}
