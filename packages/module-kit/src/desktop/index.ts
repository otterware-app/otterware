import * as Schema from "effect/Schema";
import type { ModuleDesktopBridge } from "./bridge.ts";

export { MODULE_DESKTOP_REQUEST, MODULE_DESKTOP_EVENT } from "./bridge.ts";
export type { ModuleDesktopBridge, ModuleDesktopEvent } from "./bridge.ts";
export interface ModuleDesktopContext {
  readonly senderId: number;
}
export type ModuleDesktopMethod = (
  input: unknown,
  context: ModuleDesktopContext,
) => Promise<unknown>;
export function desktopMethod<S extends Schema.Top & { readonly DecodingServices: never }>(
  input: S,
  run: (input: S["Type"], context: ModuleDesktopContext) => unknown | Promise<unknown>,
): ModuleDesktopMethod {
  const decode = Schema.decodeUnknownSync(input);
  return async (value, context) => run(decode(value), context);
}
const Request = Schema.Struct({
  module: Schema.String,
  method: Schema.String,
  input: Schema.Unknown,
});
const decodeRequest = Schema.decodeUnknownSync(Request);

export function createDesktopRegistry() {
  const modules = new Map<string, Readonly<Record<string, ModuleDesktopMethod>>>();
  return {
    register(module: string, methods: Readonly<Record<string, ModuleDesktopMethod>>) {
      if (modules.has(module)) throw new Error(`Desktop module already registered: ${module}`);
      modules.set(module, methods);
      return () => {
        modules.delete(module);
      };
    },
    async invoke(raw: unknown, context: ModuleDesktopContext) {
      const request = decodeRequest(raw);
      const methods = modules.get(request.module);
      const method =
        methods && Object.hasOwn(methods, request.method) ? methods[request.method] : undefined;
      if (!method) throw new Error("This module desktop capability is unavailable.");
      return method(request.input, context);
    },
  };
}
/** Kept separate from the host's upstream DesktopBridge type. */
export function moduleDesktopBridge(): ModuleDesktopBridge | undefined {
  return (globalThis as typeof globalThis & { otterwareDesktop?: ModuleDesktopBridge })
    .otterwareDesktop;
}
