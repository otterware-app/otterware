/** Data-only preload contract: safe to bundle without the Effect runtime. */
export const MODULE_DESKTOP_REQUEST = "otterware:module-request";
export const MODULE_DESKTOP_EVENT = "otterware:module-event";
export interface ModuleDesktopEvent {
  readonly module: string;
  readonly event: string;
  readonly payload: unknown;
}
/** A local, schema-checked Electron boundary. Environment operations belong on module RPCs. */
export interface ModuleDesktopBridge {
  invoke(module: string, method: string, input?: unknown): Promise<unknown>;
  on(listener: (event: ModuleDesktopEvent) => void): () => void;
}
