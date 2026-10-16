import { detectLanguage, hasBuiltInTranslator, translate } from "../translation";
import { MailOperations } from "@otterware/mail-contracts/rpc";
import * as Schema from "effect/Schema";
const decodeTranslation = Schema.decodeUnknownSync(
  MailOperations["translation:translate"].payloadSchema,
);
import {
  mailDesktop,
  dockBadgeEnabled,
  setDockBadgeEnabled,
  type MailDesktopCapabilities,
} from "../desktop";
import type { MailWebHost } from "../content/host/bridge";
import type { ThemeSource, UpdateState } from "@otterware/mail-contracts";
import type { EnvironmentId } from "@t3tools/contracts";
import { ensureLocalApi } from "../../../localApi";
import { appAtomRegistry } from "../../../rpc/atomRegistry";
import { mailOperations, mailWriteCommand } from "./operations";
import { subscribeMailEvents } from "./events";
import { mailSettingsPath } from "../settingsPaths";

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
export interface MailTransport {
  readonly id: string;
  call(channel: string, input: unknown): Promise<unknown>;
  subscribe(publish: (channel: string, payload: unknown) => void): () => void;
}
export function createMailHost(
  environmentId: EnvironmentId | null,
  callbacks: Pick<MailWebHost, "navigate" | "openAssistant" | "publishSelection">,
  desktopCapabilities?: MailDesktopCapabilities | null,
  transport?: MailTransport,
) {
  const call = (channel: string, input: unknown): Promise<unknown> => {
    if (transport) return transport.call(channel, input);
    const operation = mailOperations[channel];
    if (!environmentId || !operation)
      return Promise.reject(new Error(`Mail operation is unavailable: ${channel}`));
    return operation(environmentId, input);
  };
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  let stopEvents: (() => void) | undefined;
  let themeSource: ThemeSource = "system";
  const publish = (channel: string, payload: unknown) => {
    for (const listener of listeners.get(channel) ?? []) listener(payload);
  };
  const invoke = async (channel: string, input: unknown): Promise<unknown> => {
    const params = record(input);
    const desktop = desktopCapabilities && mailDesktop();
    if (
      desktop &&
      desktopCapabilities.translation &&
      (channel === "translation:detect" || channel === "translation:translate")
    )
      return desktop.invoke("mail", channel, input);
    if (hasBuiltInTranslator && channel === "translation:detect")
      return detectLanguage(text(params.text).slice(0, 4000));
    if (hasBuiltInTranslator && channel === "translation:translate") {
      const request = decodeTranslation(input);
      return translate([...request.segments], request.source, request.target);
    }
    if (
      desktop &&
      (channel === "gmail:openAttachment" ||
        channel === "gmail:dragAttachment" ||
        channel === "gmail:openComposeAttachment")
    ) {
      const bytes =
        channel === "gmail:openComposeAttachment"
          ? params
          : record(await call("gmail:getAttachmentData", params));
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
      const result = await call(channel, accountSettings);
      return {
        ...record(result),
        ...record(await desktop.invoke("mail", "app:settings")),
        dockBadgeEnabled: dockBadgeEnabled(),
      };
    }
    if (
      transport &&
      [
        "gmail:pickAttachments",
        "gmail:openComposeAttachment",
        "gmail:getAttachment",
        "gmail:openAttachment",
      ].includes(channel)
    )
      return call(channel, input);
    switch (channel) {
      case "window:getSettingsTarget":
      case "window:takePendingOpenMessage":
      case "app:takePendingMailto":
        return null;
      case "window:openSettings":
        callbacks.navigate(mailSettingsPath(text(params.pane)));
        return;
      case "gmail:pickAttachments":
        return pickAttachments(typeof params.existingBytes === "number" ? params.existingBytes : 0);
      case "gmail:openComposeAttachment":
        download(text(params.base64), text(params.name), "application/octet-stream");
        return { ok: true };
      case "gmail:getAttachment":
      case "gmail:openAttachment": {
        const bytes = record(
          await call("gmail:getAttachmentData", {
            accountId: params.accountId,
            messageId: params.messageId,
            attachmentId: params.attachmentId,
          }),
        );
        download(text(bytes.base64), text(params.filename), text(params.mimeType));
        return { saved: true, ok: true };
      }
      default: {
        return call(channel, input);
      }
    }
  };
  const host: MailWebHost = {
    environmentId: transport?.id ?? environmentId ?? "pending",
    ...callbacks,
    platform: desktopCapabilities?.platform ?? "web",
    canWrite: () =>
      transport
        ? true
        : environmentId
          ? appAtomRegistry.get(mailWriteCommand.permissionAtom(environmentId))
          : false,
    subscribeWritePermission: (listener) =>
      environmentId
        ? appAtomRegistry.subscribe(mailWriteCommand.permissionAtom(environmentId), listener)
        : () => {},
    features: {
      windowControls: null,
      vibrancy: false,
      historyButtons: false,
      launchAtLogin: desktopCapabilities?.launchAtLogin ?? false,
      dockBadge: desktopCapabilities?.dockBadge ?? false,
      defaultMailApp: desktopCapabilities?.defaultMailApp ?? false,
      translation: (desktopCapabilities?.translation ?? false) || hasBuiltInTranslator,
      dragOut: desktopCapabilities?.dragOut ?? false,
      openFiles: desktopCapabilities?.openFiles ?? false,
      externalAgent: false,
      localAgents: false,
      browser: false,
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
      if (!stopEvents)
        stopEvents = transport
          ? transport.subscribe(publish)
          : environmentId
            ? subscribeMailEvents(environmentId, publish)
            : undefined;
      return () => {
        stopDesktop?.();
        channelListeners.delete(listener);
        if (channelListeners.size === 0) listeners.delete(channel);
        if (listeners.size === 0) {
          stopEvents?.();
          stopEvents = undefined;
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
