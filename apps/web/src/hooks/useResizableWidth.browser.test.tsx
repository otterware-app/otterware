import { describe, expect, it, vi } from "vite-plus/test";

import { act, render, stubGlobal, type Screen } from "../../test/render";

import { RESIZABLE_WIDTH_PROPERTY, useResizableWidth } from "./useResizableWidth";

function Panel({
  edge = "left",
  maxWidth = 800,
  storageKey = "test-panel-width",
  fallbackStorageKey,
}: {
  edge?: "left" | "right";
  maxWidth?: number;
  storageKey?: string;
  fallbackStorageKey?: string;
}) {
  const { width, handlers } = useResizableWidth({
    storageKey,
    fallbackStorageKey,
    defaultWidth: 400,
    minWidth: 200,
    maxWidth,
    edge,
  });
  return (
    <aside data-testid="host">
      <output>{width}</output>
      <div data-testid="handle" {...handlers} />
    </aside>
  );
}

const host = (screen: Screen) => screen.container.querySelector<HTMLElement>("[data-testid=host]")!;
const shownWidth = (screen: Screen) =>
  Number(screen.container.querySelector("output")!.textContent);
const liveWidth = (screen: Screen) => host(screen).style.getPropertyValue(RESIZABLE_WIDTH_PROPERTY);
const bodyStyle = () => document.body.style;

function setup() {
  const items = new Map<string, string>();
  let captured = false;
  let frame: FrameRequestCallback | undefined;
  const setItem = vi.fn((key: string, value: string) => {
    items.set(key, value);
  });
  const storage: Storage = {
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    get length() {
      return items.size;
    },
    removeItem: (key) => {
      items.delete(key);
    },
    setItem,
  };

  return {
    storage,
    setItem,
    get captured() {
      return captured;
    },
    requestAnimationFrame(callback: FrameRequestCallback) {
      frame = callback;
      return 42;
    },
    cancelAnimationFrame: vi.fn(),
    frame: () => frame?.(0),
    pointer(
      screen: Screen,
      type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel" | "lostpointercapture",
      clientX = 100,
    ) {
      const element = screen.container.querySelector<HTMLElement>("[data-testid=handle]")!;
      // Synthetic pointers have no active pointer for the browser to capture.
      element.setPointerCapture = () => {
        captured = true;
      };
      element.hasPointerCapture = () => captured;
      element.releasePointerCapture = () => {
        captured = false;
      };
      element.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          button: 0,
          pointerId: 1,
          clientX,
        }),
      );
    },
  };
}

describe("panel resize cleanup", () => {
  it.each(["unmount", "lost capture", "blur", "cancel"])(
    "clears the cursor and pending resize after %s",
    async (reason) => {
      const state = setup();
      using _storage = stubGlobal("localStorage", state.storage);
      // The hook probe does not use routing.
      await using screen = await render(<Panel />, { router: false });
      using _raf = vi
        .spyOn(window, "requestAnimationFrame")
        .mockImplementation(state.requestAnimationFrame);
      using _cancelRaf = vi
        .spyOn(window, "cancelAnimationFrame")
        .mockImplementation(state.cancelAnimationFrame);
      await act(() => {
        state.pointer(screen, "pointerdown");
        state.pointer(screen, "pointermove", 50);
      });
      const resizedHost = host(screen);
      await act(() => state.frame());
      expect(liveWidth(screen)).toBe("450px");
      expect(resizedHost.style.getPropertyValue("transition-property")).toBe("none");
      expect(shownWidth(screen)).toBe(400);
      await act(() => state.pointer(screen, "pointermove", 25));
      expect(bodyStyle().cursor).toBe("col-resize");
      expect(bodyStyle().userSelect).toBe("none");
      if (reason === "unmount") await screen.unmount();
      await act(() => {
        if (reason === "lost capture") state.pointer(screen, "lostpointercapture");
        if (reason === "blur") window.dispatchEvent(new Event("blur"));
        if (reason === "cancel") state.pointer(screen, "pointercancel");
      });
      expect(bodyStyle().cursor).toBe("");
      expect(bodyStyle().userSelect).toBe("");
      expect(state.captured).toBe(false);
      expect(resizedHost.style.getPropertyValue("transition-property")).toBe("");
      expect(state.cancelAnimationFrame).toHaveBeenCalledWith(42);
      if (reason === "unmount") {
        expect(state.setItem).not.toHaveBeenCalled();
        // The hook probe does not use routing.
        await using remounted = await render(<Panel />, { router: false });
        expect(shownWidth(remounted)).toBe(400);
      } else {
        expect(shownWidth(screen)).toBe(475);
        expect(state.setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", "475");
      }
    },
  );

  it.each(["left", "right"] as const)(
    "uses the release position for a fast %s-edge drag",
    async (edge) => {
      const state = setup();
      using _storage = stubGlobal("localStorage", state.storage);
      // The hook probe does not use routing.
      await using screen = await render(<Panel edge={edge} />, { router: false });
      using _raf = vi
        .spyOn(window, "requestAnimationFrame")
        .mockImplementation(state.requestAnimationFrame);
      using _cancelRaf = vi
        .spyOn(window, "cancelAnimationFrame")
        .mockImplementation(state.cancelAnimationFrame);

      await act(() => {
        state.pointer(screen, "pointerdown");
        state.pointer(screen, "pointermove", edge === "left" ? 50 : 150);
        state.pointer(screen, "pointerup", edge === "left" ? 25 : 175);
      });
      expect(shownWidth(screen)).toBe(475);
      expect(state.setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", "475");
      expect(state.cancelAnimationFrame).toHaveBeenCalledWith(42);
    },
  );

  it.each([
    [800, 450],
    [450, 800],
  ])("uses updated bounds during a drag from max %s to %s", async (initialMax, nextMax) => {
    const state = setup();
    using _storage = stubGlobal("localStorage", state.storage);
    // The hook probe does not use routing.
    await using screen = await render(<Panel maxWidth={initialMax} />, { router: false });
    using _raf = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation(state.requestAnimationFrame);
    using _cancelRaf = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation(state.cancelAnimationFrame);

    await act(() => {
      state.pointer(screen, "pointerdown");
      state.pointer(screen, "pointermove", -200);
    });
    await act(() => state.frame());
    expect(liveWidth(screen)).toBe(`${Math.min(700, initialMax)}px`);
    await screen.rerender(<Panel maxWidth={nextMax} />);
    await act(() => state.pointer(screen, "pointermove", -250));
    await act(() => state.frame());
    expect(liveWidth(screen)).toBe(`${Math.min(750, nextMax)}px`);
    await act(() => state.pointer(screen, "pointerup", -300));
    expect(shownWidth(screen)).toBe(nextMax);
    expect(state.setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", String(nextMax));
  });

  it("handles release before any move event", async () => {
    const state = setup();
    using _storage = stubGlobal("localStorage", state.storage);
    // The hook probe does not use routing.
    await using screen = await render(<Panel />, { router: false });
    using _raf = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation(state.requestAnimationFrame);
    using _cancelRaf = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation(state.cancelAnimationFrame);
    await act(() => {
      state.pointer(screen, "pointerdown");
      state.pointer(screen, "pointerup", 25);
    });
    expect(shownWidth(screen)).toBe(475);
    expect(state.setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", "475");
  });

  it("clamps the release position to the panel bounds", async () => {
    const state = setup();
    using _storage = stubGlobal("localStorage", state.storage);
    // The hook probe does not use routing.
    await using screen = await render(<Panel />, { router: false });
    using _raf = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation(state.requestAnimationFrame);
    using _cancelRaf = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation(state.cancelAnimationFrame);
    await act(() => {
      state.pointer(screen, "pointerdown");
      state.pointer(screen, "pointerup", -1000);
    });
    expect(shownWidth(screen)).toBe(800);
    expect(state.setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", "800");
  });

  it("saves the final width when release is followed by lost capture", async () => {
    const state = setup();
    using _storage = stubGlobal("localStorage", state.storage);
    // The hook probe does not use routing.
    await using screen = await render(<Panel />, { router: false });
    using _raf = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation(state.requestAnimationFrame);
    using _cancelRaf = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation(state.cancelAnimationFrame);
    await act(() => {
      state.pointer(screen, "pointerdown");
      state.pointer(screen, "pointermove", 50);
      state.pointer(screen, "pointerup", 50);
      state.pointer(screen, "lostpointercapture", 50);
    });
    expect(shownWidth(screen)).toBe(450);
    expect(state.setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", "450");
    expect(bodyStyle().cursor).toBe("");
    expect(state.captured).toBe(false);
  });
});

describe("panel width storage changes", () => {
  it("restores separate thread widths without remounting and retains them after reload", async () => {
    const state = setup();
    using _storage = stubGlobal("localStorage", state.storage);
    // The hook probe does not use routing.
    await using screen = await render(<Panel />, { router: false });
    using _raf = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation(state.requestAnimationFrame);
    using _cancelRaf = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation(state.cancelAnimationFrame);
    await act(() => {
      state.pointer(screen, "pointerdown");
      state.pointer(screen, "pointermove", 50);
      state.pointer(screen, "pointerup", 50);
    });
    expect(shownWidth(screen)).toBe(450);
    await screen.rerender(<Panel storageKey="thread-b" />);
    expect(shownWidth(screen)).toBe(400);
    await act(() => {
      state.pointer(screen, "pointerdown");
      state.pointer(screen, "pointermove", -100);
      state.pointer(screen, "pointerup", -100);
    });
    expect(shownWidth(screen)).toBe(600);
    await screen.rerender(<Panel />);
    expect(shownWidth(screen)).toBe(450);
    await screen.unmount();
    // The hook probe does not use routing.
    await using reloaded = await render(<Panel storageKey="thread-b" />, { router: false });
    expect(shownWidth(reloaded)).toBe(600);
  });

  it("finishes a drag on the thread it started in when the thread switches mid-drag", async () => {
    const state = setup();
    using _storage = stubGlobal("localStorage", state.storage);
    // The hook probe does not use routing.
    await using screen = await render(<Panel />, { router: false });
    using _raf = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation(state.requestAnimationFrame);
    using _cancelRaf = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation(state.cancelAnimationFrame);
    localStorage.setItem("thread-b", "650");
    state.setItem.mockClear();
    await act(() => {
      state.pointer(screen, "pointerdown");
      state.pointer(screen, "pointermove", 50);
    });
    await act(() => state.frame());
    expect(liveWidth(screen)).toBe("450px");
    await act(() => state.pointer(screen, "pointermove", 25));
    await screen.rerender(<Panel storageKey="thread-b" />);
    expect(shownWidth(screen)).toBe(650);
    expect(state.captured).toBe(true);
    expect(bodyStyle().cursor).toBe("col-resize");
    await act(() => {
      state.frame();
      state.pointer(screen, "pointerup", 25);
    });
    expect(shownWidth(screen)).toBe(650);
    expect(localStorage.getItem("thread-b")).toBe("650");
    expect(state.setItem).not.toHaveBeenCalledWith("thread-b", expect.anything());
    expect(state.setItem).toHaveBeenCalledExactlyOnceWith("test-panel-width", "475");
    expect(state.captured).toBe(false);
    expect(bodyStyle().cursor).toBe("");
    await screen.rerender(<Panel />);
    expect(shownWidth(screen)).toBe(475);
  });
  it("opens a thread without its own width at the last width dragged in any thread", async () => {
    const state = setup();
    using _storage = stubGlobal("localStorage", state.storage);
    // The hook probe does not use routing.
    await using screen = await render(<Panel />, { router: false });
    using _raf = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation(state.requestAnimationFrame);
    using _cancelRaf = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation(state.cancelAnimationFrame);
    localStorage.setItem("thread-a", "300");
    await screen.rerender(<Panel storageKey="thread-a" fallbackStorageKey="shared" />);
    expect(shownWidth(screen)).toBe(300);
    await screen.rerender(<Panel storageKey="thread-b" fallbackStorageKey="shared" />);
    expect(shownWidth(screen)).toBe(400);
    await act(() => {
      state.pointer(screen, "pointerdown");
      state.pointer(screen, "pointerup", -100);
    });
    expect(localStorage.getItem("thread-b")).toBe("600");
    expect(localStorage.getItem("shared")).toBe("600");
    await screen.rerender(<Panel storageKey="thread-c" fallbackStorageKey="shared" />);
    expect(shownWidth(screen)).toBe(600);
    await screen.rerender(<Panel storageKey="thread-a" fallbackStorageKey="shared" />);
    expect(shownWidth(screen)).toBe(300);
  });
});
