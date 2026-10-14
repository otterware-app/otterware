import { BrowserAccountBridge } from "../browser/BrowserAccountBridge";
import { BrowserEnvironmentNotice } from "../browser/BrowserEnvironmentNotice";
import { BrowserChat } from "../browser/chat/BrowserChat";
import { useModuleTarget } from "../browser/runtime";
import {
  browserMailTransport,
  useBrowserMailAvailability,
  useBrowserMailIdentity,
  useMailPageCapabilities,
} from "./browserClient";
import { useMailDesktopCapabilities } from "./desktop";
import {
  useModulePageContext,
  useShellSelection,
  type ModulePageProps,
} from "@otterware/module-kit/web";
import { MailSurface, type MailPageSelection } from "@otterware/mail-web";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useModulePageFrameOverrides } from "../ModulePageLayout";
import { useServerModuleAvailability } from "../moduleState";
import { createMailHost } from "./rpc/host";
import { mailSession } from "./sessions";

export default function MailPage({ subpath, active }: ModulePageProps) {
  const target = useModuleTarget();
  const environmentId = target._tag === "environment" ? target.environmentId : null;
  const inBrowser = target._tag === "browser";
  const browserAvailability = useBrowserMailAvailability(inBrowser);
  const browserIdentity = useBrowserMailIdentity(inBrowser);
  const serverAvailability = useServerModuleAvailability("mail");
  const availability = inBrowser ? browserAvailability : serverAvailability;
  const available = availability === "on";
  const navigate = useNavigate();
  const desktop = useMailDesktopCapabilities();
  const navigateMail = useCallback(
    (path: string) => {
      void navigate({ to: path });
    },
    [navigate],
  );
  useMailPageCapabilities(inBrowser && active, navigateMail);
  const search = useLocation({ select: (location) => location.searchStr });
  const [selection, setSelection] = useState<MailPageSelection | null>(null);
  const host = useMemo(
    () =>
      environmentId || inBrowser
        ? createMailHost(
            environmentId,
            {
              navigate: (path) => {
                void navigate({ to: path });
              },
              openAssistant: () => useShellSelection.getState().setAssistantOpen("mail", true),
              publishSelection: setSelection,
            },
            desktop,
            inBrowser ? { ...browserMailTransport, id: `browser:${browserIdentity}` } : undefined,
          )
        : null,
    [environmentId, inBrowser, browserIdentity, navigate, desktop],
  );
  useModulePageContext(
    {
      module: "mail",
      title: selection?.title ?? "Mail",
      refs: [
        ...(selection?.accountId && selection.messageId
          ? [
              {
                kind: "mail.message",
                id: `${selection.accountId}/${selection.messageId}`,
                href: `/mail/${encodeURIComponent(selection.accountId)}/INBOX/${encodeURIComponent(selection.messageId)}`,
                ...(selection.quote ? { label: selection.quote } : {}),
              },
            ]
          : []),
        ...(selection?.projectId ? [{ kind: "mail.project", id: selection.projectId }] : []),
        ...(selection?.selected ?? []).map((row) => ({
          kind: "mail.message",
          id: `${row.accountId}/${row.id}`,
          label: row.subject,
        })),
      ],
    },
    active && available,
  );
  // This browser's Mail reports its own state and chats with the light agent.
  const assistantContent = useMemo(
    () =>
      inBrowser ? (
        <BrowserChat
          context={JSON.stringify({ module: "mail", path: `/mail/${subpath}`, selection })}
        />
      ) : undefined,
    [inBrowser, subpath, selection],
  );
  const overrides = useMemo(
    () => (inBrowser ? { availability, assistantContent } : null),
    [inBrowser, availability, assistantContent],
  );
  useModulePageFrameOverrides(overrides, active);
  return (
    <>
      {inBrowser && active ? (
        <>
          <BrowserAccountBridge />
          <BrowserEnvironmentNotice />
        </>
      ) : null}
      {active && available && host ? (
        <MailSurface
          host={host}
          session={mailSession(host.environmentId)}
          path={`/${subpath}${search}`}
        />
      ) : null}
    </>
  );
}
