import { useMailDesktopCapabilities } from "./desktop";
import { AccountConnections } from "../account/AccountConnections";
import { MailSurface, SettingsPage, type SettingsRoute } from "@otterware/mail-web";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useOptionalSettingsScope } from "../../components/settings/SettingsScopeContext";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { Button } from "../../components/ui/button";
import { useModuleStates } from "../moduleState";
import { createMailHost } from "./rpc/host";
import { mailSession } from "./sessions";

const allPanes = [
  "general",
  "accounts",
  "appearance",
  "keybindings",
  "integrations",
  "browser",
] as const;
export default function MailSettings() {
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const scope = useOptionalSettingsScope();
  const environmentId = scope?.environment?.environmentId ?? primaryEnvironmentId;
  const modules = useModuleStates(environmentId);
  const available =
    modules.status === "available" &&
    modules.modules.some((module) => module.id === "mail" && module.state === "on");
  const navigate = useNavigate();
  const desktop = useMailDesktopCapabilities();
  const panes = allPanes.filter((pane) => pane !== "browser" || desktop !== null);
  const search = useLocation({ select: (location) => location.searchStr });
  const query = new URLSearchParams(search);
  const pane = panes.find((value) => value === query.get("pane")) ?? "general";
  const host = useMemo(
    () =>
      environmentId
        ? createMailHost(
            environmentId,
            {
              navigate: (path) => {
                void navigate({ to: path });
              },
              openAssistant: () => {
                void navigate({ to: "/mail" });
              },
              publishSelection: () => {},
            },
            desktop,
          )
        : null,
    [environmentId, navigate, desktop],
  );
  const openPane = (route: SettingsRoute) => {
    void navigate({
      to: `/settings/mail?pane=${route.pane}${route.target ? `&target=${encodeURIComponent(route.target)}` : ""}`,
    });
  };
  return (
    <section className="flex min-h-0 flex-col gap-4">
      <div>
        <h2 className="text-lg font-medium">Mail</h2>
        <p className="text-sm text-muted-foreground">
          Account preferences sync when this environment is connected to Otterware. Mailbox
          credentials stay on the selected environment.
        </p>
      </div>
      {pane === "accounts" && environmentId ? (
        <AccountConnections environmentId={environmentId} />
      ) : null}
      <nav aria-label="Mail settings" className="flex flex-wrap gap-2">
        {panes.map((value) => (
          <Button
            key={value}
            variant={value === pane ? "secondary" : "ghost"}
            onClick={() => openPane({ pane: value })}
          >
            {value[0]!.toUpperCase() + value.slice(1)}
          </Button>
        ))}
      </nav>
      {host && available ? (
        <div className="h-[65vh] min-h-96">
          <MailSurface host={host} session={mailSession(host.environmentId)}>
            <SettingsPage
              route={{ pane, ...(query.get("target") ? { target: query.get("target")! } : {}) }}
              onNavigate={openPane}
            />
          </MailSurface>
        </div>
      ) : (
        <p className="text-muted-foreground">
          Connect to an environment with Mail enabled to change these settings.
        </p>
      )}
    </section>
  );
}
