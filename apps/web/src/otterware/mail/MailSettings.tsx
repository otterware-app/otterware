import { BrowserAccountBridge } from "../browser/BrowserAccountBridge";
import { BrowserEnvironmentNotice } from "../browser/BrowserEnvironmentNotice";
import { useModuleTarget } from "../browser/runtime";
import {
  browserMailTransport,
  useBrowserMailAvailability,
  useBrowserMailIdentity,
  useMailPageCapabilities,
} from "./browserClient";
import { BrowserAccountConnections } from "./BrowserAccountConnections";
import { useMailDesktopCapabilities } from "./desktop";
import { AccountConnections } from "../account/AccountConnections";
import { MailSurface, SettingsPage, type SettingsRoute } from "@otterware/mail-web";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { useOptionalSettingsScope } from "../../components/settings/SettingsScopeContext";
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
  const target = useModuleTarget();
  const primaryEnvironmentId = target._tag === "environment" ? target.environmentId : null;
  const scope = useOptionalSettingsScope();
  const environmentId = scope?.environment?.environmentId ?? primaryEnvironmentId;
  const inBrowser = !environmentId && target._tag === "browser";
  const browserAvailability = useBrowserMailAvailability(inBrowser);
  const browserIdentity = useBrowserMailIdentity(inBrowser);
  const modules = useModuleStates(environmentId);
  const available = inBrowser
    ? browserAvailability === "on"
    : modules.status === "available" &&
      modules.modules.some((module) => module.id === "mail" && module.state === "on");
  const navigate = useNavigate();
  const desktop = useMailDesktopCapabilities();
  const navigateMail = useCallback(
    (path: string) => {
      void navigate({ to: path });
    },
    [navigate],
  );
  useMailPageCapabilities(inBrowser, navigateMail);
  const panes = allPanes.filter((pane) => pane !== "browser" || desktop !== null);
  const search = useLocation({ select: (location) => location.searchStr });
  const query = new URLSearchParams(search);
  const pane = panes.find((value) => value === query.get("pane")) ?? "general";
  const host = useMemo(
    () =>
      environmentId || inBrowser
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
            inBrowser ? { ...browserMailTransport, id: `browser:${browserIdentity}` } : undefined,
          )
        : null,
    [environmentId, inBrowser, browserIdentity, navigate, desktop],
  );
  const openPane = (route: SettingsRoute) => {
    void navigate({
      to: `/settings/mail/mail?pane=${route.pane}${route.target ? `&target=${encodeURIComponent(route.target)}` : ""}`,
    });
  };
  return (
    <section className="flex min-h-0 flex-col gap-4">
      {inBrowser ? (
        <>
          <BrowserAccountBridge />
          <BrowserEnvironmentNotice />
        </>
      ) : null}
      <div>
        <h2 className="text-lg font-medium">Mail</h2>
        <p className="text-sm text-muted-foreground">
          Account preferences sync when this environment is connected to Otterware. Mailbox
          credentials stay on the selected environment.
        </p>
      </div>
      {pane === "accounts" && inBrowser ? <BrowserAccountConnections /> : null}
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
