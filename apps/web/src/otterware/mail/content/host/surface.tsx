import { MailboxHealth } from "../main/gmail/sync-health";
import { useMailboxes } from "../main/mailboxes";
import { READING_WIDTHS, useReadingWidth } from "../main/reading-preferences";
import { createContext, useContext, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { HomeView } from "../main/home-view";
import { MailSessionContext, type MailSession } from "./session";

const LocationContext = createContext({ path: "/", projectId: null as string | null });
export const useMailLocation = () => useContext(LocationContext);
export function MailContentProvider({
  session,
  children,
}: {
  session: MailSession;
  children: ReactNode;
}) {
  return (
    <MailSessionContext.Provider value={session}>
      <QueryClientProvider client={session.queryClient}>{children}</QueryClientProvider>
    </MailSessionContext.Provider>
  );
}
function MailContent() {
  const width = useReadingWidth();
  const { accounts } = useMailboxes();
  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      style={{ "--reading-width": READING_WIDTHS[width].maxWidth } as React.CSSProperties}
    >
      <div className="flex min-h-0 flex-1">
        <HomeView />
      </div>
      <MailboxHealth accountIds={accounts.map((account) => account.id)} />
    </div>
  );
}
export function MailSurface({
  session,
  path = "/",
  projectId = null,
}: {
  session: MailSession;
  path?: string | undefined;
  projectId?: (string | null) | undefined;
}) {
  return (
    <MailContentProvider session={session}>
      <LocationContext.Provider value={{ path, projectId }}>
        <MailContent />
      </LocationContext.Provider>
    </MailContentProvider>
  );
}
export { MailSession } from "./session";
export type { MailWebHost, MailPageSelection } from "./bridge";
