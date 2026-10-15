/**
 * Home's queries and commands against the environment module pages use: a
 * paired one, or this browser without one. The overview
 * refreshes on an interval (Mail, Calendar and Drive change outside the app)
 * and immediately when a thread's attention state changes on this client, so
 * Code rows follow the sidebar without waiting for the next poll.
 */
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import { HOME_METHODS, type HomeOverviewInput } from "@otterware/composition/contracts";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Schedule from "effect/Schedule";
import * as Stream from "effect/Stream";
import { Atom } from "effect/reactivity";

import { appAtomRegistry } from "../../rpc/atomRegistry";
import { connectionAtomRuntime } from "../../connection/runtime";
import { environmentThreadShells } from "../../state/threads";
import type { browserClient } from "../browser/runtime";
import { browserAtomRuntime, browserClient as browserClientEffect } from "../browser/runtime";

const homeDefinitionRevisionAtom = Atom.make(0);

/** Refresh every active Home scope after changing project rules or a saved filter. */
export function refreshHomeOverviews() {
  appAtomRegistry.set(
    homeDefinitionRevisionAtom,
    appAtomRegistry.get(homeDefinitionRevisionAtom) + 1,
  );
}

/** Changes when a thread starts or stops waiting on the user, or a run finishes or is seen. */
const threadAttentionSignalAtom = Atom.make((get) => {
  let signature = `${get(homeDefinitionRevisionAtom)}:`;
  for (const thread of get(environmentThreadShells.threadShellsAtom)) {
    if (thread.hasPendingApprovals || thread.hasPendingUserInput) signature += `w${thread.id};`;
    if (thread.latestRun?.completedAt) {
      signature += `c${thread.id}:${thread.latestRun.completedAt}:${thread.lastVisitedAt ?? ""};`;
    }
  }
  return signature;
}).pipe(Atom.withLabel("suite:home:thread-attention-signal"));

export const homeOverviewQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:suite:home-overview",
  tag: HOME_METHODS.overview,
  staleTimeMs: 5_000,
  refreshIntervalMs: 20_000,
  idleTtlMs: 60_000,
  refreshTrigger: () => threadAttentionSignalAtom,
});

export const homeCommands = {
  performAction: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "environment-data:suite:home-perform-action",
    tag: HOME_METHODS.performAction,
  }),
  saveProject: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "environment-data:suite:home-save-project",
    tag: HOME_METHODS.saveProject,
  }),
  deleteProject: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "environment-data:suite:home-delete-project",
    tag: HOME_METHODS.deleteProject,
  }),
  saveView: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "environment-data:suite:home-save-view",
    tag: HOME_METHODS.saveView,
  }),
  deleteView: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "environment-data:suite:home-delete-view",
    tag: HOME_METHODS.deleteView,
  }),
};

/**
 * Home's overview from this browser when no environment is paired: read now,
 * again every 20 seconds and after a project or view changes here.
 */
export const browserHomeOverviewQuery = Atom.family((key: string) =>
  browserAtomRuntime.atom((get) => {
    get(homeDefinitionRevisionAtom);
    const input = JSON.parse(key) as HomeOverviewInput;
    return Stream.fromSchedule(Schedule.spaced(Duration.seconds(20))).pipe(
      Stream.prepend([0]),
      Stream.mapEffect(() =>
        Effect.flatMap(browserClientEffect, (client) => client[HOME_METHODS.overview](input)),
      ),
    );
  }),
);

type BrowserClient = Effect.Success<typeof browserClient>;

/** The same commands, answered by this browser (`useModuleCommand`). */
export const browserHomeCommands = {
  performAction: (
    client: BrowserClient,
    input: Parameters<BrowserClient["home.performAction"]>[0],
  ) => client[HOME_METHODS.performAction](input),
  saveProject: (client: BrowserClient, input: Parameters<BrowserClient["home.saveProject"]>[0]) =>
    client[HOME_METHODS.saveProject](input),
  deleteProject: (
    client: BrowserClient,
    input: Parameters<BrowserClient["home.deleteProject"]>[0],
  ) => client[HOME_METHODS.deleteProject](input),
  saveView: (client: BrowserClient, input: Parameters<BrowserClient["home.saveView"]>[0]) =>
    client[HOME_METHODS.saveView](input),
  deleteView: (client: BrowserClient, input: Parameters<BrowserClient["home.deleteView"]>[0]) =>
    client[HOME_METHODS.deleteView](input),
};
