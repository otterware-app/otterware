/**
 * Upstream web tests run against the host alone. T3 Code tests mock host
 * state partially, while module registrations reach that state through their
 * shell hooks, so loading the real registry would break them. A test that needs
 * modules calls `vi.unmock("~/otterware/registry")`.
 * Import the registry factory directly: composition re-exports module registrations,
 * which can wait on the same partially mocked host modules during browser collection.
 */
import { vi } from "vite-plus/test";

vi.mock("~/otterware/registry", async () => {
  const { createModuleRegistry } = await import("@otterware/module-kit/web");
  return { moduleRegistry: createModuleRegistry([]) };
});
