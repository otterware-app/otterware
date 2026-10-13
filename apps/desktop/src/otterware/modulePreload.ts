import { contextBridge, ipcRenderer } from "electron";
import {
  MODULE_DESKTOP_EVENT,
  MODULE_DESKTOP_REQUEST,
  type ModuleDesktopBridge,
  type ModuleDesktopEvent,
} from "@otterware/module-kit/desktop/bridge";

export function exposeModuleDesktopBridge() {
  contextBridge.exposeInMainWorld("otterwareDesktop", {
    invoke: (module, method, input = null) =>
      ipcRenderer.invoke(MODULE_DESKTOP_REQUEST, { module, method, input }),
    on: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, event: ModuleDesktopEvent) =>
        listener(event);
      ipcRenderer.on(MODULE_DESKTOP_EVENT, handler);
      return () => {
        ipcRenderer.removeListener(MODULE_DESKTOP_EVENT, handler);
      };
    },
  } satisfies ModuleDesktopBridge);
}
