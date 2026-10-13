/**
 * The module shell's one rule (ADR 0008): module pages, Home and Settings ›
 * Modules talk to a paired environment when there is one and to this browser
 * otherwise. Shell code passes an `EnvironmentId` around; `THIS_BROWSER`
 * stands for the in-browser environment there, and the helpers below send its
 * queries and commands to the browser's worker instead of a WebSocket.
 */
import { RegistryContext } from "@effect/atom-react";
import {
  type AtomCommand,
  type AtomCommandOptions,
  type AtomCommandResult,
  runAtomCommand,
} from "@t3tools/client-runtime/state/runtime";
import { EnvironmentId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import { AsyncResult } from "effect/reactivity";
import { useCallback, useContext } from "react";

import { browserClient, runInBrowser, useModuleTarget } from "./runtime";

/** The in-browser environment, where shell code expects an environment id. Never routed to. */
export const THIS_BROWSER = EnvironmentId.make("this-browser");

export const isThisBrowser = (environmentId: EnvironmentId | null | undefined) =>
  environmentId === THIS_BROWSER;

/**
 * Where module pages send their RPCs: a paired environment, `THIS_BROWSER`
 * without one, or null while the saved connections load.
 */
export function useModuleEnvironmentId(): EnvironmentId | null {
  const target = useModuleTarget();
  return target._tag === "environment"
    ? target.environmentId
    : target._tag === "browser"
      ? THIS_BROWSER
      : null;
}

type BrowserClient = Effect.Success<typeof browserClient>;

/**
 * An environment command that this browser answers too: `browser` runs the
 * same request on the worker's client when the target is `THIS_BROWSER`.
 */
export function useModuleCommand<I, A, E, BrowserError>(
  command: AtomCommand<{ readonly environmentId: EnvironmentId; readonly input: I }, A, E>,
  browser: (client: BrowserClient, input: I) => Effect.Effect<A, BrowserError>,
  options?: AtomCommandOptions,
): (value: {
  readonly environmentId: EnvironmentId;
  readonly input: I;
}) => Promise<AtomCommandResult<A, E>> {
  const registry = useContext(RegistryContext);
  return useCallback(
    (value) =>
      isThisBrowser(value.environmentId)
        ? runInBrowser(
            Effect.flatMap(browserClient, (client) => browser(client, value.input)),
          ).then(
            (success) => AsyncResult.success(success) as AtomCommandResult<A, E>,
            (error: unknown) =>
              AsyncResult.failure(Cause.fail(error)) as unknown as AtomCommandResult<A, E>,
          )
        : runAtomCommand(registry, command, value, {
            label: options?.label ?? command.label,
            reportFailure: options?.reportFailure ?? true,
            reportDefect: options?.reportDefect ?? true,
          }),
    [browser, command, options?.label, options?.reportDefect, options?.reportFailure, registry],
  );
}
