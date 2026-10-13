// @vitest-environment jsdom
import { act, createContext, lazy, useContext, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { createModuleRegistry, defineWebModule } from "@otterware/module-kit/web";
import { CalendarIcon } from "lucide-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ModulePagesHost } from "./ModulePagesHost";

let pathname = "/settings/modules";
vi.mock("@tanstack/react-router", () => ({
  useLocation: ({ select }: { select: (location: { pathname: string }) => unknown }) =>
    select({ pathname }),
}));

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
const subscriptions = new Map<string, number>();
let pageLoads = 0;
function Runtime() {
  const environment = useContext(Environment);
  useEffect(() => {
    subscriptions.set(environment, (subscriptions.get(environment) ?? 0) + 1);
    return () => {
      const remaining = (subscriptions.get(environment) ?? 1) - 1;
      if (remaining === 0) subscriptions.delete(environment);
      else subscriptions.set(environment, remaining);
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

beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(() => vi.unstubAllGlobals());

describe("module background runtimes", () => {
  it("subscribes before a page visit, follows the environment and closes when disabled", async () => {
    pageLoads = 0;
    pathname = "/settings/modules";
    registry = createModuleRegistry([module]);
    const container = document.createElement("div");
    const root = createRoot(container);
    const show = async (state: string, environment = "one", path = pathname) => {
      pathname = path;
      await act(async () => {
        root.render(
          <Environment value={environment}>
            <Availability value={state}>
              <ModulePagesHost>{null}</ModulePagesHost>
            </Availability>
          </Environment>,
        );
      });
    };
    try {
      await show("loading");
      expect([...subscriptions.keys()]).toEqual([]);
      await show("on");
      expect([...subscriptions.keys()]).toEqual(["one"]);
      expect(pageLoads).toBe(0);
      await show("on", "one", "/calendar");
      expect(pageLoads).toBe(1);
      expect(subscriptions.get("one")).toBe(1);
      await show("on", "one", "/settings/calendar");
      expect(subscriptions.get("one")).toBe(1);
      await show("on", "two");
      expect([...subscriptions.keys()]).toEqual(["two"]);
      await show("off", "two");
      expect([...subscriptions.keys()]).toEqual([]);
      await show("on", "two");
      expect([...subscriptions.keys()]).toEqual(["two"]);
      await show("failed", "two");
      expect([...subscriptions.keys()]).toEqual([]);
      await show("not-installed", "two");
      expect([...subscriptions.keys()]).toEqual([]);
      await show("no-modules", "two");
      expect([...subscriptions.keys()]).toEqual([]);
      await show("on", "two");
    } finally {
      await act(async () => root.unmount());
    }
    expect([...subscriptions.keys()]).toEqual([]);
  });

  it("does not start a runtime excluded from the build profile", async () => {
    registry = createModuleRegistry([]);
    const root = createRoot(document.createElement("div"));
    try {
      await act(async () => root.render(<ModulePagesHost>{null}</ModulePagesHost>));
      expect([...subscriptions.keys()]).toEqual([]);
    } finally {
      await act(async () => root.unmount());
    }
  });
});
