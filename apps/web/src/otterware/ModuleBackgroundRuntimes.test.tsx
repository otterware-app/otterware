// @vitest-environment jsdom
import { act, createContext, lazy, useContext, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { createModuleRegistry, defineWebModule } from "@otterware/module-kit/web";
import { CalendarIcon } from "lucide-react";
import { describe, expect, it, vi } from "vite-plus/test";
import { ModuleBackgroundRuntimes } from "./ModuleBackgroundRuntimes";

vi.mock("./moduleState", () => ({
  useServerModuleAvailability: () => useContext(Availability),
}));
vi.mock("./registry", () => ({
  get moduleRegistry() {
    return registry;
  },
}));

const Availability = createContext("on");
const Environment = createContext("one");
const subscriptions = new Set<string>();
let pageLoads = 0;
function Runtime() {
  const environment = useContext(Environment);
  useEffect(() => {
    subscriptions.add(environment);
    return () => {
      subscriptions.delete(environment);
    };
  }, [environment]);
  return null;
}
const module = defineWebModule({
  id: "calendar",
  label: "Calendar",
  icon: CalendarIcon,
  rail: { position: "start", order: 20 },
  page: lazy(async () => {
    pageLoads++;
    return { default: () => null };
  }),
  backgroundRuntime: lazy(async () => ({ default: Runtime })),
  settings: null,
  commands: [],
  searchTerms: [],
  serverModule: "calendar",
  sideChat: true,
});
let registry = createModuleRegistry([module]);

describe("module background runtimes", () => {
  it("subscribes before a page visit, follows the environment and closes when disabled or absent", async () => {
    pageLoads = 0;
    registry = createModuleRegistry([module]);
    const container = document.createElement("div");
    const root = createRoot(container);
    const show = async (state: string, environment = "one") => {
      await act(async () => {
        root.render(
          <Environment value={environment}>
            <Availability value={state}>
              <ModuleBackgroundRuntimes />
            </Availability>
          </Environment>,
        );
      });
    };
    try {
      await show("loading");
      expect([...subscriptions]).toEqual([]);
      await show("on");
      expect([...subscriptions]).toEqual(["one"]);
      expect(pageLoads).toBe(0);
      await show("on", "two");
      expect([...subscriptions]).toEqual(["two"]);
      await show("off", "two");
      expect([...subscriptions]).toEqual([]);
      await show("on", "two");
      expect([...subscriptions]).toEqual(["two"]);
      await show("failed", "two");
      expect([...subscriptions]).toEqual([]);
      await show("not-installed", "two");
      expect([...subscriptions]).toEqual([]);
      await show("no-modules", "two");
      expect([...subscriptions]).toEqual([]);
      await show("on", "two");
      registry = createModuleRegistry([]);
      await show("on", "two");
      expect([...subscriptions]).toEqual([]);
    } finally {
      await act(async () => root.unmount());
    }
    expect([...subscriptions]).toEqual([]);
  });
});
