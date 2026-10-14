import { useState } from "react";
import { Button } from "../../components/ui/button";
import { useDriveHost } from "../../host";
import { AuthShell } from "./auth-shell";

/**
 * Signed-in pages: the fallback while the account is restored, then the
 * page, or a step to sign in with the Otter Account.
 */
export function AuthGate({
  children,
  fallback,
}: {
  children: React.ReactNode;
  fallback: React.ReactNode;
}) {
  const host = useDriveHost();
  if (host.accountPending) return fallback;
  if (!host.account) return <SignIn />;
  return children;
}

function SignIn() {
  const host = useDriveHost();
  const [submitting, setSubmitting] = useState(false);
  return (
    <AuthShell
      title="Welcome to Otter Drive"
      description="Sign in with your Otter Account for your personal drive and any shared drives you have been invited to."
    >
      <Button
        size="lg"
        className="w-full"
        disabled={submitting}
        onClick={() => {
          setSubmitting(true);
          host.signIn();
        }}
      >
        {submitting ? "Signing in…" : "Continue with Otter"}
      </Button>
    </AuthShell>
  );
}
