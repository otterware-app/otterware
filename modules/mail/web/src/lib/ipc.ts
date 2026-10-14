import { mailBridge } from "../host/bridge";
export const ipc = <T = unknown>(channel: string, params?: unknown): Promise<T> =>
  mailBridge.invoke<T>(channel, params);

/** Host RPC requests stay open through file transfers and provider operations. */
export const task = <T>(channel: string, params: Record<string, unknown>): Promise<T> =>
  mailBridge.invoke<T>(channel, params);
