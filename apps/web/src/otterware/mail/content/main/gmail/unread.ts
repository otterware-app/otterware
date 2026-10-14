import { useAllAccountLabels } from "./hooks";
import type { GmailAccount } from "./types";
import { COMBINED_ACCOUNT_ID } from "./custom-views";
export function useInboxUnread(accounts: GmailAccount[]): Record<string, number> {
  const counts = Object.fromEntries(
    useAllAccountLabels(accounts.map((a) => a.id)).map(({ accountId, labels }) => [
      accountId,
      labels.find((l) => l.id === "INBOX")?.unread ?? 0,
    ]),
  );
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  return { ...counts, [COMBINED_ACCOUNT_ID]: total };
}
