import type { MailProviderKind } from "@otterware/mail-contracts";
import { ServerIcon } from "lucide-react";
import gmailMark from "../assets/gmail.svg";
import microsoftMark from "../assets/microsoft.svg";

function GmailMark({ className = "size-4" }: { className?: string }) {
  return <img src={gmailMark} className={`${className} object-contain`} alt="" aria-hidden />;
}

/** Microsoft's four squares, for Outlook. */
function MicrosoftMark({ className = "size-4" }: { className?: string }) {
  return <img src={microsoftMark} className={`${className} object-contain`} alt="" aria-hidden />;
}

/** The connection's provider, beside its mailbox name. Older accounts are Gmail. */
export function ProviderMark({
  provider = "gmail",
  className = "size-3.5",
}: {
  provider?: MailProviderKind;
  className?: string;
}) {
  const label = provider === "gmail" ? "Gmail" : provider === "outlook" ? "Outlook" : "IMAP";
  return (
    <span role="img" aria-label={label} className="inline-flex shrink-0 items-center">
      {provider === "gmail" ? (
        <GmailMark className={className} />
      ) : provider === "outlook" ? (
        <MicrosoftMark className={className} />
      ) : (
        <ServerIcon className={className} aria-hidden />
      )}
    </span>
  );
}
