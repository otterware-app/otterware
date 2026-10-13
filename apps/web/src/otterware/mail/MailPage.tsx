import { useMailDesktopCapabilities } from "./desktop";
import { useModulePageContext, type ModulePageProps } from "@otterware/module-kit/web";
import { MailSurface, type MailPageSelection } from "@otterware/mail-web";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { ModulePageLayout } from "../ModulePageLayout";
import { useServerModuleAvailability } from "../moduleState";
import { createMailHost } from "./rpc/host";
import { mailSession } from "./sessions";

export default function MailPage({ subpath, active }: ModulePageProps) {
  const environmentId = usePrimaryEnvironmentId();
  const available = useServerModuleAvailability("mail") === "on";
  const navigate = useNavigate();
  const desktop = useMailDesktopCapabilities();
  const search = useLocation({ select: (location) => location.searchStr });
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [selection, setSelection] = useState<MailPageSelection | null>(null);
  const host = useMemo(
    () =>
      environmentId
        ? createMailHost(
            environmentId,
            {
              navigate: (path) => {
                void navigate({ to: path });
              },
              openAssistant: () => setAssistantOpen(true),
              publishSelection: setSelection,
            },
            desktop,
          )
        : null,
    [environmentId, navigate, desktop],
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
  return (
    <ModulePageLayout
      moduleId="mail"
      assistantOpen={assistantOpen}
      onAssistantOpenChange={setAssistantOpen}
    >
      {active && available && host ? (
        <MailSurface
          host={host}
          session={mailSession(host.environmentId)}
          path={`/${subpath}${search}`}
        />
      ) : null}
    </ModulePageLayout>
  );
}
