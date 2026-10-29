import { CopyIcon, KeyRoundIcon } from "lucide-react";
import { toast } from "./toast";
import { Btn } from "./ui";

export function CodeCard({ code, onTrash }: { code: string; onTrash?: (() => void) | undefined }) {
  const copy = () =>
    void navigator.clipboard.writeText(code).then(
      () => {
        toast.success("Code copied");
        onTrash?.();
      },
      () => toast.error("Couldn't copy"),
    );

  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      <KeyRoundIcon className="size-4 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-sm text-muted-foreground">Verification code</div>
        <div className="truncate font-mono text-lg font-semibold tracking-wider text-foreground select-all">
          {code}
        </div>
      </div>
      <Btn size="sm" onClick={copy}>
        <CopyIcon />
        {onTrash ? "Copy & trash" : "Copy"}
      </Btn>
    </div>
  );
}
