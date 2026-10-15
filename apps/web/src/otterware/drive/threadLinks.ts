/**
 * Drive documents linked to Code threads. Links live on the environment
 * (`suite.sqlite`, the Drive module's engine); the environment pushes every
 * thread's links whenever one changes, and agents link documents through
 * `drive_link_document_to_thread`, so a link an agent adds shows at once.
 */
import { useAtomValue } from "@effect/atom-react";
import { DRIVE_METHODS, type DriveThreadLink } from "@otterware/composition/contracts";
import { createDriveThreadLinkAtoms } from "@otterware/composition/web";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import { createEnvironmentSessionAtoms } from "@t3tools/client-runtime/state/session";
import { EnvironmentId, sessionGrantsScope } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";
import { useMemo } from "react";

import { connectionAtomRuntime } from "../../connection/runtime";

const driveThreadLinkChanges = createDriveThreadLinkAtoms(connectionAtomRuntime);

const sessions = createEnvironmentSessionAtoms(connectionAtomRuntime);

/** Linking changes the environment's data: it needs a connection that may operate. */
export const canLinkDriveDocuments = Atom.family((environmentId: EnvironmentId) =>
  Atom.make((get) => {
    const value = get(sessions.sessionStateAtom(environmentId));
    const session = Option.getOrNull(AsyncResult.value(value));
    return session !== null && sessionGrantsScope(session, "orchestration:operate");
  }),
);

/** The documents the link dialog offers: your recent ones, or those matching a search. */
export const driveDocumentSearch = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:drive:document-search",
  tag: DRIVE_METHODS.listDocuments,
  staleTimeMs: 30_000,
  idleTtlMs: 60_000,
});

export const linkDriveDocument = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:drive:link-document",
  tag: DRIVE_METHODS.linkDocument,
});

export const unlinkDriveDocument = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:drive:unlink-document",
  tag: DRIVE_METHODS.unlinkDocument,
});

const NO_LINKS: ReadonlyArray<DriveThreadLink> = [];

/** One thread's linked documents, newest first. */
export function useDriveThreadLinks(environmentId: string, threadId: string) {
  const result = useAtomValue(
    driveThreadLinkChanges({ environmentId: EnvironmentId.make(environmentId), input: {} }),
  );
  const all = Option.getOrNull(AsyncResult.value(result))?.links ?? NO_LINKS;
  return useMemo(
    () =>
      all
        .filter((link) => link.threadId === threadId)
        .toSorted((left, right) => right.linkedAt.localeCompare(left.linkedAt)),
    [all, threadId],
  );
}
