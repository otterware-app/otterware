import { afterEach, describe, expect, it, vi } from "vite-plus/test";

function createStorage(overrides: Partial<Storage> = {}): Storage {
  const store = new Map<string, string>();
  return {
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, value);
    },
    ...overrides,
  };
}

afterEach(() => {
  vi.doUnmock("react");
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("native window chrome", () => {
  it("exposes the native glass backing across chrome syncs and restores a solid canvas", async () => {
    const { syncBrowserChromeTheme } = await import("./useTheme");
    const rootStyle = { backgroundColor: "#111111", removeProperty: vi.fn() };
    const bodyStyle = { backgroundColor: "#111111", removeProperty: vi.fn() };
    rootStyle.removeProperty.mockImplementation(() => {
      rootStyle.backgroundColor = "";
    });
    bodyStyle.removeProperty.mockImplementation(() => {
      bodyStyle.backgroundColor = "";
    });
    const root = {
      dataset: { themeId: "t3-code", windowMaterial: "translucent" },
      style: rootStyle,
    };
    const body = { style: bodyStyle };
    const meta = { setAttribute: vi.fn() };
    vi.stubGlobal("document", {
      documentElement: root,
      body,
      querySelector: () => null,
      querySelectorAll: () => [meta],
    });
    vi.stubGlobal("getComputedStyle", () => ({
      backgroundColor: "#111111",
      getPropertyValue: () => "#111111",
    }));

    syncBrowserChromeTheme();
    syncBrowserChromeTheme();
    expect(rootStyle.removeProperty).toHaveBeenCalledWith("background-color");
    expect(bodyStyle.removeProperty).toHaveBeenCalledWith("background-color");
    expect(rootStyle.backgroundColor).toBe("");
    expect(bodyStyle.backgroundColor).toBe("");
    expect(meta.setAttribute).toHaveBeenLastCalledWith("content", "#111111");

    root.dataset.windowMaterial = "solid";
    rootStyle.backgroundColor = "";
    bodyStyle.backgroundColor = "";
    syncBrowserChromeTheme();
    expect(rootStyle.backgroundColor).toBe("#111111");
    expect(bodyStyle.backgroundColor).toBe("#111111");
  });
});

describe("theme preference", () => {
  it("reads an explicit Synara selection without changing the saved preference", async () => {
    const storage = createStorage();
    storage.setItem("t3code:theme", "synara");
    vi.stubGlobal("window", { localStorage: storage });
    const { readThemePreference } = await import("./useTheme");
    expect(readThemePreference()).toBe("synara");
    expect(storage.getItem("t3code:theme")).toBe("synara");
  });
});
