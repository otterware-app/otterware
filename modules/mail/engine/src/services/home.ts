import type { HomeItem } from "@otterware/module-kit/contracts";
import { listAccounts } from "./account-store.js";
import { getCombinedThreadsByRules } from "./mail-store.js";
import { turnedOffMailboxes } from "./mail-sync.js";

/** Home reads the local cache only: opening Home must never trigger provider requests. */
export async function mailHomeItems(): Promise<ReadonlyArray<HomeItem>> {
  const accounts = (await listAccounts()).filter(
    (account) => !turnedOffMailboxes().has(account.id),
  );
  const { messages } = getCombinedThreadsByRules(
    accounts.map((account) => ({
      accountId: account.id,
      allOf: ["INBOX", "UNREAD"],
      noneOf: [],
    })),
    0,
    20,
  );
  return messages.flatMap((message) => {
    if (!message.accountId || !Number.isFinite(message.date)) return [];
    const target = {
      route: `/mail/${encodeURIComponent(message.accountId)}/INBOX/${encodeURIComponent(message.id)}`,
    };
    return [
      {
        id: `${message.accountId}/${message.threadId}`,
        module: "mail",
        kind: "unread-mail",
        title: message.subject || "(No subject)",
        subtitle: message.fromName || message.fromEmail,
        occurredAt: new Date(message.date).toISOString(),
        priority: 20,
        target,
        actions: [{ id: "open", label: "Read", primary: true, target }],
        facets: {
          senders: [message.fromEmail],
          labels: message.threadLabelIds ?? message.labelIds,
        },
      },
    ];
  });
}
