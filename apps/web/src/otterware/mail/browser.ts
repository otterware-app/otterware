import type { EnvironmentId } from "@t3tools/contracts";
import { mailDesktop } from "./desktop";
const PROFILE = "module-mail";
const object = (input: unknown) =>
  input && typeof input === "object" ? (input as Record<string, unknown>) : {};
export function createMailBrowser(
  environmentId: EnvironmentId,
  publish: (channel: string, payload: unknown) => void,
) {
  const bridge = window.desktopBridge;
  if (!bridge?.previewExtensions || !bridge.preview) return null;
  const extensions = bridge.previewExtensions;
  const preview = bridge.preview;
  let activeTab = -1;
  const methods: Record<string, (input: unknown) => Promise<unknown>> = {
    "browser:config": () => preview.getPreviewConfig(environmentId, PROFILE),
    "browser:extensions": async () =>
      (await extensions.list()).map((item) => ({
        ...item,
        optionsUrl: item.hasOptions ? item.id : null,
      })),
    "browser:extensionActions": async () =>
      (await extensions.actions(activeTab)).map((item) => ({
        ...item,
        optionsUrl: item.hasOptions ? item.id : null,
      })),
    "browser:activeTab": async (input) => {
      if (typeof input !== "number") return;
      activeTab = input;
      await extensions.setActiveTab(input);
      publish("browser:extensionActionsChanged", null);
    },
    "browser:runAction": async (input) => {
      const params = object(input);
      const anchor = object(params.anchor);
      if (
        typeof params.id !== "string" ||
        ![anchor.x, anchor.y, anchor.width, anchor.height].every((n) => typeof n === "number")
      )
        throw new Error("Invalid extension action.");
      return extensions.runAction({
        extensionId: params.id,
        webContentsId: activeTab,
        anchor: {
          x: Number(anchor.x),
          y: Number(anchor.y),
          width: Number(anchor.width),
          height: Number(anchor.height),
        },
      });
    },
    "browser:openOptions": (input) => extensions.openOptions(String(object(input).id)),
    "browser:setExtensionEnabled": (input) => {
      const params = object(input);
      return extensions.setEnabled(String(params.id), params.enabled === true);
    },
    "browser:removeExtension": (input) => extensions.remove(String(object(input).id)),
    "browser:loadUnpacked": () => extensions.loadUnpacked(),
    "browser:clearData": async (input) => {
      const origin = object(input).origin;
      if (typeof origin === "string")
        return mailDesktop()!.invoke("mail", "browser:clearSite", {
          webContentsId: activeTab,
          origin,
        });
      await preview.clearCookies(environmentId, PROFILE);
      await preview.clearCache(environmentId, PROFILE);
    },
  };
  return {
    methods,
    subscribe() {
      const stopChanged = extensions.onChanged(() => {
        publish("browser:extensionsChanged", null);
        publish("browser:extensionActionsChanged", null);
      });
      const stopOpen = extensions.onOpenTab((url) => publish("browser:openTab", { url }));
      return () => {
        stopChanged();
        stopOpen();
      };
    },
  };
}
