import { useMailStore } from "./mailStore";
import { BrowserAccountBridge } from "../browser/BrowserAccountBridge";
import { BrowserEnvironmentNotice } from "../browser/BrowserEnvironmentNotice";

import { useModuleTarget } from "../browser/runtime";
import { useBrowserMailAvailability } from "./browserClient";

import { useModulePageContext, type ModulePageProps } from "@otterware/module-kit/web";
import { MailSurface } from "./content/host/surface";
import { useLocation } from "@tanstack/react-router";
import { useMemo } from "react";
import { useModulePageFrameOverrides } from "../ModulePageLayout";
import { useServerModuleAvailability } from "../moduleState";

export default function MailPage({ subpath, active, projectId }: ModulePageProps) {
  const target = useModuleTarget();

  const inBrowser = target._tag === "browser";
  const browserAvailability = useBrowserMailAvailability(inBrowser);

  const serverAvailability = useServerModuleAvailability("mail");
  const availability = inBrowser ? browserAvailability : serverAvailability;
  const available = availability === "on";
  const { current, selection } = useMailStore();
  const host = current?.host;
  const search = useLocation({ select: (location) => location.searchStr });
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
  const overrides = useMemo(() => (inBrowser ? { availability } : null), [inBrowser, availability]);
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
          session={current!.session}
          projectId={projectId}
          path={`/${subpath}${search}`}
        />
      ) : null}
    </>
  );
}
