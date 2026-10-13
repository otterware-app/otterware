// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { MailSurface, MailSession, type MailWebHost } from "./surface";

vi.mock("../styles.css?inline", () => ({ default: ".mail-root { color: black; }" }));
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});
it("renders mailbox setup without changing the host theme or starting another agent stack", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  const invoke = vi.fn(async (channel: string) => (channel === "gmail:listAccounts" ? [] : {}));
  const host: MailWebHost = {
    environmentId: "environment-one",
    platform: "web",
    features: {
      windowControls: null,
      vibrancy: false,
      historyButtons: false,
      launchAtLogin: false,
      dockBadge: false,
      defaultMailApp: false,
      translation: false,
      dragOut: false,
      openFiles: false,
      externalAgent: false,
      localAgents: false,
      browser: false,
    },
    invoke: <T,>(channel: string) => invoke(channel) as Promise<T>,
    on: () => () => {},
    navigate() {},
    openAssistant() {},
    publishSelection() {},
    openExternal: async () => {},
    nativeTheme: {
      getInfo: async () => ({
        themeSource: "system",
        shouldUseDarkColors: false,
        shouldUseHighContrastColors: false,
        prefersReducedTransparency: false,
      }),
      setThemeSource: async () => {},
    },
    updates: {
      getState: vi.fn(),
      check: vi.fn(),
      download: vi.fn(),
      install: vi.fn(),
      onState: () => () => {},
    },
  };
  const session = new MailSession();
  session.queryClient.setQueryData(["gmail:accounts"], []);
  const rootElement = document.createElement("div");
  document.body.append(rootElement);
  document.documentElement.dataset.themeId = "host-theme";
  const root = createRoot(rootElement);
  await act(async () => root.render(<MailSurface host={host} session={session} />));
  const shadow = rootElement.querySelector("[data-mail-surface]")?.shadowRoot;
  expect(shadow?.textContent).toContain("Connect a mailbox");
  expect(shadow?.querySelector("iframe")).toBeNull();
  expect(document.documentElement.dataset.themeId).toBe("host-theme");
  expect(
    invoke.mock.calls.map((call) => call[0]).filter((channel) => /^(agent|otter):/.test(channel)),
  ).toEqual([]);
  await act(async () => root.unmount());
  expect(rootElement.childElementCount).toBe(0);
  session.dispose();
});
