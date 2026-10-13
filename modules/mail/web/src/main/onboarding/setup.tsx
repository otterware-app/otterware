import { AddMailboxMenu } from "../gmail/add-mailbox";
import { useAddAccount } from "../gmail/hooks";
import { Btn } from "../gmail/ui";
import { toast } from "../gmail/toast";

/** Mailbox setup; the host owns identity and agent onboarding. */
export function SetupFlow() {
  const add = useAddAccount();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
      <h2 className="text-xl font-medium">Your mail, in Otterware</h2>
      <p className="text-sm text-muted-foreground">
        Connect a mailbox to read, organize and send mail.
      </p>
      <AddMailboxMenu
        onGmail={() => add.mutate(undefined, { onError: (error) => toast.error(String(error)) })}
      >
        <Btn disabled={add.isPending}>Add mailbox</Btn>
      </AddMailboxMenu>
    </div>
  );
}
