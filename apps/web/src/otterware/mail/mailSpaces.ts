/**
 * Mail's rail spaces (ADR 0020): one per mailbox, opening its inbox. Views
 * join in chunk 2 of the rebuild, once Mail's views live in a client store.
 */
import type { ModuleSpace } from "@otterware/module-kit/web";
import { createEnvironmentRpcQueryAtomFamily } from "@t3tools/client-runtime/state/runtime";
import { InboxIcon } from "lucide-react";
import { useMemo } from "react";

import { connectionAtomRuntime } from "../../connection/runtime";
import { useEnvironmentQuery } from "../../state/query";
import { isThisBrowser, useModuleEnvironmentId } from "../browser/moduleEndpoint";
import { useServerModuleAvailability } from "../moduleState";

const accountsQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:otterware:mail-accounts",
  tag: "mail.gmail.listAccounts",
  staleTimeMs: 30_000,
  idleTtlMs: 5 * 60_000,
});

interface MailAccountLike {
  readonly id: string;
  readonly email: string;
  readonly name?: string;
}

const isAccount = (value: unknown): value is MailAccountLike =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as MailAccountLike).id === "string" &&
  typeof (value as MailAccountLike).email === "string";

export function useMailSpaces(): ReadonlyArray<ModuleSpace> {
  const environmentId = useModuleEnvironmentId();
  const available = useServerModuleAvailability("mail") === "on";
  const query = useEnvironmentQuery(
    available && environmentId !== null && !isThisBrowser(environmentId)
      ? accountsQuery({ environmentId, input: {} })
      : null,
  );
  const accounts = query.data;
  return useMemo(
    () =>
      Array.isArray(accounts)
        ? accounts.filter(isAccount).map((account): ModuleSpace => ({
            id: account.id,
            label: account.name?.trim() || account.email,
            icon: InboxIcon,
            href: `/mail/${encodeURIComponent(account.id)}/INBOX`,
          }))
        : [],
    [accounts],
  );
}
