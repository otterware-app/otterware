import { useSyncExternalStore } from "react";
import type { BridgeFeatures, DesktopBridge } from "@otterware/mail-contracts";

export interface MailPageSelection {
  title: string;
  accountId: string | null;
  messageId: string | null;
  projectId?: string | undefined;
  selected?: readonly { accountId: string; id: string; subject: string }[] | undefined;
  quote?: string | undefined;
}
export interface MailWebHost extends DesktopBridge {
  environmentId: string;
  canWrite?(): boolean;
  subscribeWritePermission?(listener: () => void): () => void;
  navigate(path: string, replace?: boolean): void;
  openAssistant(): void;
  publishSelection(selection: MailPageSelection): void;
  /** Starts the one Google connect the Otter Account shares with Calendar. */
  /** Authorizes Google on this device for Mail: a linked account (`email`) or a new one. */
  connectGoogle?(email?: string): Promise<void>;
}
let current: MailWebHost | undefined;
const subscriptions = new Set<{
  channel: string;
  listener: (value: unknown) => void;
  stop?: (() => void) | undefined;
}>();
export const isMailHost = (host: MailWebHost) => current === host;
export function installMailWebHost(host: MailWebHost): () => void {
  current = host;
  for (const subscription of subscriptions) {
    subscription.stop?.();
    if (subscription.channel === "host:changed") subscription.listener(host.environmentId);
    else subscription.stop = host.on(subscription.channel, subscription.listener);
  }
  return () => {
    if (current !== host) return;
    for (const subscription of subscriptions) {
      subscription.stop?.();
      subscription.stop = undefined;
    }
    current = undefined;
  };
}
export const mailHostOrNull = () => current ?? null;
/** Authorizes a linked Google account for Mail on this device, or links a new one. */
export const connectMailbox = (email?: string) => {
  void mailHost().connectGoogle?.(email);
};
export const mailHost = () => {
  if (!current) throw new Error("Mail is not connected to an environment.");
  return current;
};
const defaultFeatures: BridgeFeatures = {
  windowControls: null,
  vibrancy: false,
  historyButtons: false,
  launchAtLogin: false,
  dockBadge: false,
  defaultMailApp: false,
  translation: false,
  dragOut: false,
  openFiles: false,
  externalAgent: false,
  localAgents: false,
  browser: false,
};
const features = new Proxy(defaultFeatures, {
  get: (defaults, key: keyof BridgeFeatures) => current?.features[key] ?? defaults[key],
});
/** Local renderer compatibility only. The host maps each operation to a concrete typed RPC. */
export const mailBridge: DesktopBridge = {
  get platform() {
    return current?.platform ?? "web";
  },
  features,
  invoke: (channel, input) => mailHost().invoke(channel, input),
  on: (channel, listener) => {
    const subscription = {
      channel,
      listener,
      stop: channel === "host:changed" ? undefined : current?.on(channel, listener),
    };
    subscriptions.add(subscription);
    return () => {
      subscription.stop?.();
      subscriptions.delete(subscription);
    };
  },
  openExternal: (url) => mailHost().openExternal(url),
  nativeTheme: {
    getInfo: () => mailHost().nativeTheme.getInfo(),
    setThemeSource: (source) => mailHost().nativeTheme.setThemeSource(source),
  },
  updates: {
    getState: () => mailHost().updates.getState(),
    check: () => mailHost().updates.check(),
    download: () => mailHost().updates.download(),
    install: () => mailHost().updates.install(),
    onState: (listener) => mailHost().updates.onState(listener),
  },
};

const noSubscription = () => () => {};
export function useMailCanWrite(): boolean {
  const host = mailHost();
  return useSyncExternalStore(
    host.subscribeWritePermission ?? noSubscription,
    () => host.canWrite?.() ?? true,
  );
}
