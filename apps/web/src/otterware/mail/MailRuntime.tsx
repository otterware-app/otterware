import { clearUndo } from "./content/main/gmail/undo";
import { MailKeybindingMigration } from "./MailKeybindingMigration";
import { useOpenLink } from "~/browser/useOpenLink";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useShellSelection } from "@otterware/module-kit/web";
import { useModuleTarget } from "../browser/runtime";
import {
  browserMailTransport,
  useBrowserMailAvailability,
  useBrowserMailIdentity,
  useMailPageCapabilities,
} from "./browserClient";
import { useServerModuleAvailability } from "../moduleState";
import { useMailDesktopCapabilities } from "./desktop";
import { createMailHost } from "./rpc/host";
import { mailSession } from "./sessions";
import { installMailWebHost } from "./content/host/bridge";
import { MailContentProvider } from "./content/host/surface";
import { useMailboxes } from "./content/main/mailboxes";
import { useMailViews } from "./content/main/gmail/custom-views";
import { useProjects } from "./content/main/gmail/projects";
import {
  queryKeys,
  useLabels,
  useAccountSync,
  useExternalMailChanges,
  useGmailWriteFailureToasts,
} from "./content/main/gmail/hooks";
import { useInboxUnread } from "./content/main/gmail/unread";
import { useRailUnreadDots } from "./content/main/gmail/rail-preferences";
import { startSyncedPreferences } from "./content/main/synced-preferences";
import { useSignInAlerts } from "./content/main/gmail/sync-health";
import { useMailStore, type MailSnapshot } from "./mailStore";
import MailBackground from "./MailBackground";
import { useConnectProvider } from "../account/useConnectProvider";

export default function MailRuntime() {
  const target = useModuleTarget();
  const environmentId = target._tag === "environment" ? target.environmentId : null;
  const inBrowser = target._tag === "browser";
  const browserAvailability = useBrowserMailAvailability(inBrowser);
  const browserIdentity = useBrowserMailIdentity(inBrowser);
  const availability = useServerModuleAvailability("mail");
  const navigate = useNavigate();
  const desktop = useMailDesktopCapabilities();
  const openLink = useOpenLink(null);
  const navigateMail = useMemo(
    () =>
      (path: string, replace = false) => {
        void navigate({ href: path, replace });
      },
    [navigate],
  );
  useMailPageCapabilities(inBrowser, navigateMail);
  // A ref keeps the host stable: rebuilding it reinstalls Mail and clears its state.
  const connect = useConnectProvider();
  const connectProvider = useRef(connect);
  useLayoutEffect(() => {
    connectProvider.current = connect;
  }, [connect]);
  const host = useMemo(
    () =>
      environmentId || inBrowser
        ? {
            ...createMailHost(
              environmentId,
              {
                navigate: navigateMail,
                openAssistant: () => useShellSelection.getState().setAssistantOpen("mail", true),
                publishSelection: (selection) => useMailStore.setState({ selection }),
              },
              desktop,
              inBrowser ? { ...browserMailTransport, id: `browser:${browserIdentity}` } : undefined,
            ),
            openExternal: openLink,
            // Without a signed-in environment the connect fails; Connections explains why.
            connectGoogle: () =>
              connectProvider.current("google").catch(() => navigateMail("/settings/connections")),
          }
        : null,
    [environmentId, inBrowser, browserIdentity, navigateMail, desktop, openLink],
  );
  const [installed, setInstalled] = useState<typeof host>(null);
  const available = (inBrowser ? browserAvailability : availability) === "on";
  useLayoutEffect(() => {
    if (!host || !available) return;
    clearUndo();
    const clear = installMailWebHost(host);
    setInstalled(host);
    return () => {
      clear();
      useMailStore.setState({ current: null, selection: null, searches: [], activeSearchId: null });
    };
  }, [host, available]);
  if (!host || installed !== host || !available) return null;
  const session = mailSession(host.environmentId);
  return (
    <MailContentProvider session={session}>
      <MailData host={host} session={session} />
      <MailKeybindingMigration host={host} />
      <MailBackground />
    </MailContentProvider>
  );
}
function MailData({ host, session }: Pick<MailSnapshot, "host" | "session">) {
  const { accounts, combined } = useMailboxes();
  const { views } = useMailViews();
  const projects = useProjects();
  const unread = useInboxUnread(accounts);
  const [dots] = useRailUnreadDots();
  useExternalMailChanges();
  useGmailWriteFailureToasts();
  useSignInAlerts();
  useEffect(() => startSyncedPreferences(), [host]);
  useEffect(() => {
    useMailStore.setState((state) => ({
      current: {
        host,
        session,
        accounts,
        combined,
        views,
        projects: projects.data ?? [],
        unread,
        dots,
        labels: Object.fromEntries(
          accounts.map((account) => [
            account.id,
            session.queryClient.getQueryData(queryKeys.labels(account.id)) ??
              (state.current?.host === host ? state.current.labels[account.id] : undefined) ??
              [],
          ]),
        ),
      },
    }));
  }, [host, session, accounts, combined, views, projects.data, unread, dots]);
  return accounts.map((account) => <MailboxData key={account.id} id={account.id} />);
}
function MailboxData({ id }: { id: string }) {
  const labels = useLabels(id);
  useAccountSync(id);
  useEffect(() => {
    if (!labels.data) return;
    useMailStore.setState((s) =>
      s.current
        ? { current: { ...s.current, labels: { ...s.current.labels, [id]: labels.data! } } }
        : s,
    );
  }, [id, labels.data]);
  return null;
}
