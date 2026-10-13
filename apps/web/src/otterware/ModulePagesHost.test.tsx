// @vitest-environment jsdom
import { createContext, lazy, useContext, useState, act } from "react";
import { createRoot } from "react-dom/client";
import { createModuleRegistry, defineWebModule } from "@otterware/module-kit/web";
import { HouseIcon } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ModulePagesHost } from "./ModulePagesHost";

let pathname = "/home";
vi.mock("@tanstack/react-router", () => ({
  useLocation: ({ select }: { select: (location: { pathname: string }) => unknown }) =>
    select({ pathname }),
}));
vi.mock("./registry", () => ({
  get moduleRegistry() {
    return registry;
  },
}));

const Environment = createContext("one");
let creations = 0;
function Page() {
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
    const show = async (path: string, environment: string) => {
      pathname = path;
      await act(async () => {
        root.render(
          <Environment value={environment}>
            <ModulePagesHost>
              <span>Host route</span>
            </ModulePagesHost>
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
