// @vitest-environment jsdom
import { createContext, lazy, useContext, useState, act } from "react";
import { createRoot } from "react-dom/client";
import { createModuleRegistry, defineWebModule } from "@otterware/module-kit/web";
import { HouseIcon } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ModulePagesHost } from "./ModulePagesHost";
import { ModulePageLayout } from "./ModulePageLayout";

let pathname = "/home";
type AvailabilityState = "on" | "no-modules";
vi.mock("@tanstack/react-router", () => ({
  useLocation: ({ select }: { select: (location: { pathname: string }) => unknown }) =>
    select({ pathname }),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("./moduleState", () => ({
  useServerModuleAvailability: () => useContext(Availability),
}));
vi.mock("./settingsRegistry", () => ({ MODULES_SETTINGS_PATH: "/settings/modules" }));
vi.mock("../components/ui/sidebar", () => ({
  SidebarInset: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("../components/WorkspacePageHeader", () => ({
  WorkspacePageHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
}));
vi.mock("../env", () => ({ isElectron: false }));
vi.mock("./registry", () => ({
  get moduleRegistry() {
    return registry;
  },
}));

const Environment = createContext("one");
const Availability = createContext<AvailabilityState>("on");
let creations = 0;
function DraftField() {
  const [value, setValue] = useState(() => {
    creations++;
    return "draft";
  });
  return (
    <input
      aria-label={useContext(Environment)}
      value={value}
      onChange={(event) => setValue(event.currentTarget.value)}
    />
  );
}
function Page() {
  return (
    <ModulePageLayout moduleId="home">
      <DraftField />
    </ModulePageLayout>
  );
}
const registry = createModuleRegistry([
  defineWebModule({
    id: "home",
    label: "Home",
    icon: HouseIcon,
    rail: { position: "start", order: 0 },
    page: lazy(() => Promise.resolve({ default: Page })),
    settings: null,
    commands: [],
    searchTerms: [],
    serverModule: "home",
    sideChat: false,
  }),
]);

afterEach(() => {
  document.body.replaceChildren();
});
describe("persistent module pages", () => {
  it("retains a draft across route and environment changes, without creating another page", async () => {
    creations = 0;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const show = async (path: string, environment: string, state: AvailabilityState = "on") => {
      pathname = path;
      await act(async () => {
        root.render(
          <Environment value={environment}>
            <Availability value={state}>
              <ModulePagesHost>
                <span>Host route</span>
              </ModulePagesHost>
            </Availability>
          </Environment>,
        );
      });
    };
    try {
      await show("/home", "one");
      const input = container.querySelector("input")!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
          input,
          "unsent message",
        );
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await show("/settings/modules", "one");
      await show("/home", "two", "no-modules");
      expect(container.textContent).toContain("Home isn’t available here");
      await show("/home/projects/p1", "two");
      expect(container.querySelector('input[aria-label="two"]')?.getAttribute("value")).toBe(
        "unsent message",
      );
      expect(creations).toBe(1);
    } finally {
      await act(async () => root.unmount());
    }
  });
});
