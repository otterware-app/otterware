import "../../../../index.css";
import { DEFAULT_CALENDAR_PREFERENCES } from "@otterware/calendar-contracts";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "../../../../../test/render";
import { TimeGrid } from "./TimeGrid";
import { MonthGrid } from "./MonthGrid";

it("ignores actual pointer clicks on empty time, all-day and month cells", async () => {
  const onCreate = vi.fn();
  const common = {
    instances: [],
    calendars: new Map(),
    timeZone: "UTC",
    preferences: DEFAULT_CALENDAR_PREFERENCES,
    today: 20_000,
    selectedKey: null,
    onCreate,
    onOpenEvent: vi.fn(),
    onChangeEvent: vi.fn(),
  };
  const container = document.createElement("div");
  container.style.cssText = "width:900px;height:650px";
  await using screen = await render(<TimeGrid {...common} days={[20_000]} />, { container });
  await page.elementLocator(container.querySelector("[data-calendar-column]")!).click();
  await page.elementLocator(container.querySelector("[data-lane-day]")!).click();
  expect(onCreate).not.toHaveBeenCalled();
  await screen.rerender(
    <MonthGrid
      {...common}
      month={10}
      weeks={[[20_000, 20_001, 20_002, 20_003, 20_004, 20_005, 20_006]]}
      onOpenDay={vi.fn()}
      onShowMore={vi.fn()}
    />,
  );
  await page.elementLocator(container.querySelector("[data-day]")!).click();
  expect(onCreate).not.toHaveBeenCalled();
});
