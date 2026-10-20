/**
 * Upstream web tests run against the host alone. T3 Code tests mock host
 * state partially, while module registrations reach that state through their
 * shell hooks, so loading the real registry would break them. A test that needs
 * modules calls `vi.unmock("~/otterware/registry")`.
 */
import { vi } from "vite-plus/test";

vi.mock("~/otterware/registry", async () => {
  const { composeWebModules } = await import("@otterware/composition/web");
  return { moduleRegistry: composeWebModules([]) };
});
