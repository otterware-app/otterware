import { mailBridge } from "../../host/bridge";
import { useLatest } from "../use-latest";
import { DEFAULT_SETTINGS } from "@otterware/mail-contracts";

import { useEffect, useState } from "react";
import { Switch } from "../../components/ui/switch";
import { toast } from "../gmail/toast";
import { gmailApi, type MailApp, type NotificationsMode } from "../gmail/api";
import {
  getAdvanceDirection,
  setAdvanceDirection as persistAdvanceDirection,
  type AdvanceDirection,
} from "../gmail/advance-direction";

import { RowSelect, SettingResetButton, SettingsRow, SettingsSection } from "./settings-ui";
import { searchableSetting } from "./settings-search";
import { features } from "../features";
import { osNames } from "../os-names";
import { Btn } from "../gmail/ui";
import { requestTour, startSetup } from "../onboarding/onboarding";
import { requestProblemReport } from "../support/report-problem";
import { useRailUnreadDots } from "../gmail/rail-preferences";
import { TranslationSection } from "./translation-section";

/** Where the settings page is. */
export type { SettingsRoute } from "../../host/public";

const NOTIFICATIONS_OPTIONS: { value: NotificationsMode; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "inbox", label: "Inbox only" },
  { value: "all", label: "All new mail" },
];

/** Auto-sync cadence choices in seconds; 0 = manual only. */
const SYNC_INTERVAL_OPTIONS = [
  { value: 0, label: "Manually" },
  { value: 15, label: "Every 15 seconds" },
  { value: 30, label: "Every 30 seconds" },
  { value: 60, label: "Every minute" },
  { value: 300, label: "Every 5 minutes" },
  { value: 900, label: "Every 15 minutes" },
];

const ADVANCE_DIRECTION_OPTIONS: { value: AdvanceDirection; label: string }[] = [
  { value: "next", label: "Next message" },
  { value: "previous", label: "Previous message" },
  { value: "none", label: "Don't select another message" },
];

// ---------------------------------------------------------------------------
// General
// ---------------------------------------------------------------------------

/** Mail › General: Otter Mail's General sections, in its order. */
export function GeneralRows() {
  const [syncInterval, setSyncInterval] = useState<number | null>(null);
  const [notificationsMode, setNotificationsMode] = useState<NotificationsMode | null>(null);
  const [advanceDirection, setAdvanceDirectionState] = useState<AdvanceDirection>(() =>
    getAdvanceDirection(),
  );
  const [launchAtLogin, setLaunchAtLogin] = useState(DEFAULT_SETTINGS.launchAtLogin);
  const [railDots, setRailDots] = useRailUnreadDots();
  const [dockBadge, setDockBadge] = useState(DEFAULT_SETTINGS.dockBadgeEnabled);
  const [mailApps, setMailApps] = useState<MailApp[] | null>(null);
  const [defaultMailAppId, setDefaultMailAppId] = useState<string | null>(null);

  const loadSyncSettings = async () => {
    console.log("[Settings:loadSyncSettings]");
    try {
      const settings = await gmailApi.getSyncSettings();
      setSyncInterval(settings.syncIntervalSeconds);
      setNotificationsMode(settings.notificationsMode);
      setLaunchAtLogin(settings.launchAtLogin);
      setDockBadge(settings.dockBadgeEnabled);
    } catch (error) {
      toast.error(`Failed to load sync settings: ${error}`);
    }
  };

  const loadMailApps = async () => {
    if (!features.defaultMailApp) return;
    try {
      const result = await gmailApi.listMailApps();
      setMailApps(result.apps);
      setDefaultMailAppId(result.defaultId);
    } catch (error) {
      console.log("[Settings:listMailApps] failed", { error: String(error) });
    }
  };

  const loadMailAppsForEffect = useLatest(loadMailApps);
  const loadSyncSettingsForEffect = useLatest(loadSyncSettings);
  useEffect(() => {
    void loadSyncSettingsForEffect.current();
    void loadMailAppsForEffect.current();
    // Changed on another device.
    const offSettings = mailBridge.on(
      "settings:changed",
      () => void loadSyncSettingsForEffect.current(),
    );
    const onStorage = () => setAdvanceDirectionState(getAdvanceDirection());
    window.addEventListener("storage", onStorage);
    return () => {
      offSettings();
      window.removeEventListener("storage", onStorage);
    };
  }, [loadMailAppsForEffect, loadSyncSettingsForEffect]);

  const handleSyncIntervalChange = async (value: string) => {
    const seconds = Number(value);
    setSyncInterval(seconds);
    console.log("[Settings:setSyncInterval]", { seconds });
    try {
      await gmailApi.setSyncSettings({ syncIntervalSeconds: seconds });
    } catch (error) {
      toast.error(`Failed to save sync setting: ${error}`);
      void loadSyncSettings();
    }
  };

  const handleNotificationsModeChange = async (value: string) => {
    const mode = value as NotificationsMode;
    setNotificationsMode(mode);
    console.log("[Settings:setNotificationsMode]", { mode });
    try {
      await gmailApi.setSyncSettings({ notificationsMode: mode });
    } catch (error) {
      toast.error(`Failed to save notifications setting: ${error}`);
      void loadSyncSettings();
    }
  };

  const handleAdvanceDirectionChange = (value: string) => {
    const direction = value as AdvanceDirection;
    console.log("[Settings:setAdvanceDirection]", { direction });
    setAdvanceDirectionState(direction);
    persistAdvanceDirection(direction);
  };

  const handleLaunchAtLoginChange = async (checked: boolean) => {
    setLaunchAtLogin(checked);
    console.log("[Settings:setLaunchAtLogin]", { checked });
    try {
      await gmailApi.setSyncSettings({ launchAtLogin: checked });
    } catch (error) {
      toast.error(`Failed to save launch-at-login setting: ${error}`);
      void loadSyncSettings();
    }
  };

  const handleDockBadgeChange = async (checked: boolean) => {
    setDockBadge(checked);
    console.log("[Settings:setDockBadgeEnabled]", { checked });
    try {
      await gmailApi.setSyncSettings({ dockBadgeEnabled: checked });
    } catch (error) {
      toast.error(`Failed to change Dock badge: ${error}`);
      void loadSyncSettings();
    }
  };

  const handleDefaultMailChange = async (id: string) => {
    setDefaultMailAppId(id);
    console.log("[Settings:setDefaultMailApp]", { id });
    try {
      await gmailApi.setDefaultMailApp(id);
    } catch (error) {
      toast.error(`Failed to change default mail app: ${error}`);
    }
    // macOS may still put a consent dialog in the way — re-read the actual
    // state rather than trusting the optimistic selection.
    void loadMailApps();
  };

  return (
    <>
      {/* What only the desktop app has isn't shown elsewhere. */}
      {features.launchAtLogin || features.dockBadge ? (
        <SettingsSection title={features.dockBadge ? "Startup & Dock" : "Startup"}>
          {features.launchAtLogin ? (
            <SettingsRow
              {...searchableSetting("launch-at-login")}
              resetAction={
                launchAtLogin !== DEFAULT_SETTINGS.launchAtLogin ? (
                  <SettingResetButton
                    label="launch at login"
                    onClick={() => void handleLaunchAtLoginChange(DEFAULT_SETTINGS.launchAtLogin)}
                  />
                ) : null
              }
              description={`Open Otter Mail automatically when you log in to your ${osNames.computer}.`}
              control={
                <Switch
                  id="launchAtLogin"
                  checked={launchAtLogin}
                  onCheckedChange={(checked) => void handleLaunchAtLoginChange(checked)}
                />
              }
            />
          ) : null}
          {features.dockBadge ? (
            <SettingsRow
              {...searchableSetting("dock-badge")}
              resetAction={
                dockBadge !== DEFAULT_SETTINGS.dockBadgeEnabled ? (
                  <SettingResetButton
                    label="dock badge"
                    onClick={() => void handleDockBadgeChange(DEFAULT_SETTINGS.dockBadgeEnabled)}
                  />
                ) : null
              }
              description="A badge with the number of unread messages in your inboxes."
              control={
                <Switch
                  id="dockBadgeEnabled"
                  checked={dockBadge}
                  onCheckedChange={(checked) => void handleDockBadgeChange(checked)}
                />
              }
            />
          ) : null}
        </SettingsSection>
      ) : null}

      <SettingsSection title="Mail">
        <SettingsRow
          {...searchableSetting("sync-interval")}
          resetAction={
            syncInterval != null && syncInterval !== DEFAULT_SETTINGS.syncIntervalSeconds ? (
              <SettingResetButton
                label="check for new mail"
                onClick={() =>
                  void handleSyncIntervalChange(String(DEFAULT_SETTINGS.syncIntervalSeconds))
                }
              />
            ) : null
          }
          description="Sync runs in the background at this cadence."
          control={
            <RowSelect
              value={syncInterval != null ? String(syncInterval) : undefined}
              onValueChange={(v) => void handleSyncIntervalChange(v)}
              options={SYNC_INTERVAL_OPTIONS.map((o) => ({
                value: String(o.value),
                label: o.label,
              }))}
              ariaLabel="Check for new mail"
            />
          }
        />
        <SettingsRow
          {...searchableSetting("notifications")}
          resetAction={
            notificationsMode != null &&
            notificationsMode !== DEFAULT_SETTINGS.notificationsMode ? (
              <SettingResetButton
                label="notifications"
                onClick={() =>
                  void handleNotificationsModeChange(DEFAULT_SETTINGS.notificationsMode)
                }
              />
            ) : null
          }
          description="Notify about new mail found by background sync."
          control={
            <RowSelect
              value={notificationsMode ?? undefined}
              onValueChange={(v) => void handleNotificationsModeChange(v)}
              options={NOTIFICATIONS_OPTIONS}
              ariaLabel="Notifications"
            />
          }
        />
        <SettingsRow
          {...searchableSetting("advance-direction")}
          resetAction={
            advanceDirection !== "next" ? (
              <SettingResetButton
                label="after archive, delete, or move"
                onClick={() => handleAdvanceDirectionChange("next")}
              />
            ) : null
          }
          description="Which message to select next in the list."
          control={
            <RowSelect
              value={advanceDirection}
              onValueChange={handleAdvanceDirectionChange}
              options={ADVANCE_DIRECTION_OPTIONS}
              ariaLabel="After archive, delete, or move"
            />
          }
        />
        <SettingsRow
          {...searchableSetting("rail-unread-dots")}
          resetAction={
            railDots ? (
              <SettingResetButton label="mailbox unread dots" onClick={() => setRailDots(false)} />
            ) : null
          }
          description="A dot on each mailbox in the rail whose Inbox has unread mail, and each view with unread mail."
          control={<Switch id="railUnreadDots" checked={railDots} onCheckedChange={setRailDots} />}
        />
      </SettingsSection>

      <TranslationSection />

      {features.defaultMailApp ? (
        <SettingsSection title="System">
          <SettingsRow
            {...searchableSetting("default-mail-app")}
            description={`Which app opens mailto: links across ${osNames.system}.`}
            control={
              <RowSelect
                value={defaultMailAppId ?? undefined}
                onValueChange={(v) => void handleDefaultMailChange(v)}
                options={(mailApps ?? []).map((app) => ({ value: app.id, label: app.name }))}
                // Linux may have no mail app at all, or none set as the default.
                placeholder={mailApps ? "None" : undefined}
                ariaLabel="Default email app"
              />
            }
          />
        </SettingsSection>
      ) : null}

      <SettingsSection title="Getting started">
        <SettingsRow
          {...searchableSetting("tour")}
          description="A minute's walk through the app, on your own mail."
          control={
            <Btn size="sm" onClick={requestTour}>
              Take the tour
            </Btn>
          }
        />
        <SettingsRow
          {...searchableSetting("setup")}
          description="Mailboxes, look, notifications, your agent and the keys, one step at a time."
          control={
            <Btn size="sm" onClick={() => startSetup()}>
              Run setup again
            </Btn>
          }
        />
      </SettingsSection>

      <SettingsSection title="Support">
        <SettingsRow
          {...searchableSetting("send-feedback")}
          description="Report a Mail bug or suggest a feature on GitHub."
          control={
            <Btn size="sm" onClick={requestProblemReport}>
              Send feedback
            </Btn>
          }
        />
      </SettingsSection>
    </>
  );
}
