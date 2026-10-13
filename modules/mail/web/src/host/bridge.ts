import type { BridgeFeatures, DesktopBridge } from "@otterware/mail-contracts";

export interface MailPageSelection {
  title: string;
  accountId: string | null;
  messageId: string | null;
  projectId?: string;
  selected?: readonly { accountId: string; id: string; subject: string }[];
  quote?: string;
}
export interface MailWebHost extends DesktopBridge {
  environmentId: string;
  navigate(path: string): void;
  openAssistant(): void;
  publishSelection(selection: MailPageSelection): void;
}
let current: MailWebHost | undefined;
export function installMailWebHost(host: MailWebHost): () => void {
  current = host;
  return () => {
    if (current === host) current = undefined;
  };
}
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
  platform: "web",
  features,
  invoke: (channel, input) => mailHost().invoke(channel, input),
  on: (channel, listener) => mailHost().on(channel, listener),
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
