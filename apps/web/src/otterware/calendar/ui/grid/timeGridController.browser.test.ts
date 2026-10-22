import { DEFAULT_CALENDAR_PREFERENCES } from "@otterware/calendar-contracts";
import { expect, it, vi } from "vite-plus/test";
import { TimeGridController, type TimeGridElements } from "./timeGridController";

function fixture() {
  const root = document.createElement("div");
  document.body.append(root);
  const child = () => {
    const element = document.createElement("div");
    root.append(element);
    return element;
  };
  const elements: Omit<TimeGridElements, "root"> = {
    scroll: child(),
    header: child(),
    columns: child(),
    lane: child(),
    live: child(),
  };
  elements.scroll.style.cssText = "position:fixed;top:0;height:900px";
  elements.header.style.cssText = "position:fixed;top:0;height:0";
  elements.columns.style.cssText = "position:fixed;left:0;top:0;width:400px;height:1440px";
  const onCreate = vi.fn();
  const controller = new TimeGridController({ root, ...elements }, () => ({
    days: [20_000, 20_001],
    timeZone: "UTC",
    snapMinutes: 15,
    hourHeight: 60,
    preferences: DEFAULT_CALENDAR_PREFERENCES,
    calendars: new Map(),
    instances: new Map(),
    selectedKey: null,
    onCreate,
    onOpenEvent: vi.fn(),
    onChangeEvent: vi.fn(),
  }));
  return {
    ...elements,
    controller,
    onCreate,
    [Symbol.dispose]() {
      controller.dispose();
      root.remove();
    },
  };
}

it("does not create an event from a click on empty timed or all-day space", () => {
  using grid = fixture();
  grid.columns.click();
  grid.lane.click();
  expect(grid.onCreate).not.toHaveBeenCalled();
});
it.each([0, 4, 14.9, -14.9])("ignores an unsnapped %s-minute drag", (minutes) => {
  using grid = fixture();
  const plan = grid.controller.planGesture(grid.columns, 50, 100, new PointerEvent("pointerdown"))!;
  plan.activate();
  plan.update(50, 100 + minutes, { alt: false });
  plan.drop({ alt: false });
  expect(grid.onCreate).not.toHaveBeenCalled();
});
it.each([15, -15, 30])("creates once after a %s-minute drag", (minutes) => {
  using grid = fixture();
  const plan = grid.controller.planGesture(grid.columns, 50, 100, new PointerEvent("pointerdown"))!;
  plan.activate();
  plan.update(50, 100 + minutes, { alt: false });
  plan.drop({ alt: false });
  expect(grid.onCreate).toHaveBeenCalledOnce();
  const draft = grid.onCreate.mock.calls[0]![0];
  expect(draft.end - draft.start).toBeGreaterThanOrEqual(15 * 60_000);
});
it("abandons a draft when the pointer returns below the minimum span", () => {
  using grid = fixture();
  const plan = grid.controller.planGesture(grid.columns, 50, 100, new PointerEvent("pointerdown"))!;
  plan.activate();
  plan.update(50, 130, { alt: false });
  plan.update(50, 105, { alt: false });
  plan.drop({ alt: false });
  expect(grid.onCreate).not.toHaveBeenCalled();
});
