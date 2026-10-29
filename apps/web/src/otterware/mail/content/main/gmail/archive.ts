import type { MailCapabilities } from "@otterware/mail-contracts";
import type { GmailLabel } from "./types";

export function archiveFrom(
  labelIds: readonly string[],
  listLabel: GmailLabel | undefined,
  capabilities: MailCapabilities,
): string | null {
  if (
    capabilities.archiveFolder &&
    listLabel?.type === "user" &&
    !listLabel.id.startsWith("category:") &&
    labelIds.includes(listLabel.id)
  ) {
    return listLabel.id;
  }
  return labelIds.includes("INBOX") ? "INBOX" : null;
}
