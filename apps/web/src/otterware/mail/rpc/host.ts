import { createMailBrowser } from "../browser";
import {
  mailDesktop,
  dockBadgeEnabled,
  setDockBadgeEnabled,
  type MailDesktopCapabilities,
} from "../desktop";
import type { MailWebHost } from "@otterware/mail-web";
import type { ThemeSource, UpdateState } from "@otterware/mail-contracts";
import type { EnvironmentId } from "@t3tools/contracts";
import { ensureLocalApi } from "../../../localApi";
import { appAtomRegistry } from "../../../rpc/atomRegistry";
import { mailOperations, mailWriteCommand } from "./operations";
import { subscribeMailEvents } from "./events";

const unavailable = async (): Promise<never> => {
  throw new Error("This capability is provided by Otterware Settings.");
};
const updateState: UpdateState = {
  status: "disabled",
  currentVersion: "",
  availableVersion: null,
  downloadPercent: null,
  checkedAt: null,
  message: null,
  manualDownloadUrl: null,
};
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
const text = (value: unknown) => (typeof value === "string" ? value : "");

function download(base64: string, filename: string, mimeType: string) {
  const bytes = Uint8Array.from(atob(base64.replaceAll("-", "+").replaceAll("_", "/")), (c) =>
    c.charCodeAt(0),
  );
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || "attachment";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
function pickAttachments(existingBytes: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.oncancel = () => resolve({ attachments: [] });
    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      if (files.reduce((sum, file) => sum + file.size, existingBytes) > 25 * 1024 * 1024) {
        resolve({ attachments: [], error: "Attachments must total less than 25 MB." });
        return;
      }
      void Promise.all(
        files.map(
          (file) =>
            new Promise((done, fail) => {
              const reader = new FileReader();
              reader.onerror = () => fail(reader.error);
              reader.onload = () =>
                done({
                  name: file.name,
                  mimeType: file.type || "application/octet-stream",
                  size: file.size,
                  base64: String(reader.result).split(",")[1] ?? "",
                });
              reader.readAsDataURL(file);
            }),
        ),
      ).then((attachments) => resolve({ attachments }), reject);
    };
    input.click();
  });
}
export function createMailHost(
  environmentId: EnvironmentId,
  callbacks: Pick<MailWebHost, "navigate" | "openAssistant" | "publishSelection">,
  desktopCapabilities?: MailDesktopCapabilities | null,
) {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  let stopEvents: (() => void) | undefined;
  let stopBrowser: (() => void) | undefined;
  let themeSource: ThemeSource = "system";
  const publish = (channel: string, payload: unknown) => {
    for (const listener of listeners.get(channel) ?? []) listener(payload);
  };
  const browser = desktopCapabilities ? createMailBrowser(environmentId, publish) : null;
  const invoke = async (channel: string, input: unknown): Promise<unknown> => {
    if (browser?.methods[channel]) return browser.methods[channel](input);
    const params = record(input);
    const desktop = desktopCapabilities && mailDesktop();
    if (desktop && (channel === "translation:detect" || channel === "translation:translate"))
      return desktop.invoke("mail", channel, input);
    if (
      desktop &&
      (channel === "gmail:openAttachment" ||
        channel === "gmail:dragAttachment" ||
        channel === "gmail:openComposeAttachment")
    ) {
      const bytes =
        channel === "gmail:openComposeAttachment"
          ? params
          : record(await mailOperations["gmail:getAttachmentData"]!(environmentId, params));
      return desktop.invoke("mail", "file:open", {
        name: text(params.filename) || text(params.name),
        base64: text(bytes.base64),
        drag: channel === "gmail:dragAttachment",
      });
    }
    if (
      desktop &&
      [
        "app:takePendingMailto",
        "app:getDefaultMailStatus",
        "app:setDefaultMailApp",
        "app:listMailApps",
      ].includes(channel)
    )
      return desktop.invoke("mail", channel, input);
    if (desktop && (channel === "gmail:getSyncSettings" || channel === "gmail:setSyncSettings")) {
      const { launchAtLogin, dockBadgeEnabled: badge, ...accountSettings } = params;
      if (channel === "gmail:setSyncSettings") {
        if (typeof launchAtLogin === "boolean")
          await desktop.invoke("mail", "app:setLogin", { enabled: launchAtLogin });
        if (typeof badge === "boolean") setDockBadgeEnabled(badge);
      }
      const result = await mailOperations[channel]!(environmentId, accountSettings);
      return {
        ...record(result),
        ...record(await desktop.invoke("mail", "app:settings")),
        dockBadgeEnabled: dockBadgeEnabled(),
      };
    }
    switch (channel) {
      case "window:getSettingsTarget":
      case "window:takePendingOpenMessage":
      case "app:takePendingMailto":
        return null;
      case "window:openSettings":
        callbacks.navigate(
          `/settings/mail?pane=${encodeURIComponent(text(params.pane) || "general")}`,
        );
        return;
      case "gmail:pickAttachments":
        return pickAttachments(typeof params.existingBytes === "number" ? params.existingBytes : 0);
      case "gmail:openComposeAttachment":
        download(text(params.base64), text(params.name), "application/octet-stream");
        return { ok: true };
      case "gmail:getAttachment":
      case "gmail:openAttachment": {
        const bytes = record(
          await mailOperations["gmail:getAttachmentData"]!(environmentId, {
            accountId: params.accountId,
            messageId: params.messageId,
            attachmentId: params.attachmentId,
          }),
        );
        download(text(bytes.base64), text(params.filename), text(params.mimeType));
        return { saved: true, ok: true };
      }
      default: {
        const operation = mailOperations[channel];
        if (!operation) throw new Error(`Mail operation is unavailable: ${channel}`);
        return operation(environmentId, input);
      }
    }
  };
  const host: MailWebHost = {
    environmentId,
    ...callbacks,
    platform: desktopCapabilities?.platform ?? "web",
    canWrite: () => appAtomRegistry.get(mailWriteCommand.permissionAtom(environmentId)),
    subscribeWritePermission: (listener) =>
      appAtomRegistry.subscribe(mailWriteCommand.permissionAtom(environmentId), listener),
    features: {
      windowControls: null,
      vibrancy: false,
      historyButtons: false,
      launchAtLogin: desktopCapabilities?.launchAtLogin ?? false,
      dockBadge: desktopCapabilities?.dockBadge ?? false,
      defaultMailApp: desktopCapabilities?.defaultMailApp ?? false,
      translation: desktopCapabilities?.translation ?? false,
      dragOut: desktopCapabilities?.dragOut ?? false,
      openFiles: desktopCapabilities?.openFiles ?? false,
      externalAgent: false,
      localAgents: false,
      browser: browser !== null,
    },
    invoke: <T>(channel: string, input?: unknown) => invoke(channel, input) as Promise<T>,
    on(channel, listener) {
      let channelListeners = listeners.get(channel);
      if (!channelListeners) {
        channelListeners = new Set();
        listeners.set(channel, channelListeners);
      }
      channelListeners.add(listener);
      const stopDesktop = mailDesktop()?.on((event) => {
        if (event.module === "mail" && event.event === channel) listener(event.payload);
      });
      if (!stopEvents) stopEvents = subscribeMailEvents(environmentId, publish);
      if (!stopBrowser && browser) stopBrowser = browser.subscribe();
      return () => {
        stopDesktop?.();
        channelListeners.delete(listener);
        if (channelListeners.size === 0) listeners.delete(channel);
        if (listeners.size === 0) {
          stopEvents?.();
          stopEvents = undefined;
          stopBrowser?.();
          stopBrowser = undefined;
        }
      };
    },
    openExternal: (url) => ensureLocalApi().shell.openExternal(url),
    nativeTheme: {
      getInfo: async () => ({
        themeSource,
        shouldUseDarkColors:
          themeSource === "dark" ||
          (themeSource === "system" && matchMedia("(prefers-color-scheme: dark)").matches),
        shouldUseHighContrastColors: matchMedia("(prefers-contrast: more)").matches,
        prefersReducedTransparency: matchMedia("(prefers-reduced-transparency: reduce)").matches,
      }),
      setThemeSource: async (source) => {
        themeSource = source;
        publish("nativeTheme:updated", await host.nativeTheme.getInfo());
      },
    },
    updates: {
      getState: async () => updateState,
      check: unavailable,
      download: unavailable,
      install: unavailable,
      onState: () => () => {},
    },
  };
  return host;
}
