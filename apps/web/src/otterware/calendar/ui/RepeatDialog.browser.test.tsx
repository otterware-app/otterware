import "../../../index.css";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "../../../../test/render";
import { RepeatDialog } from "./RepeatDialog";

const anchor = { start: Date.UTC(2026, 9, 22, 12), allDay: false, timeZone: "Europe/Berlin" };

it("saves a compact weekly interval, selected weekdays and occurrence limit", async () => {
  const onSave = vi.fn();
  await using _screen = await render(
    <RepeatDialog anchor={anchor} rule="" onSave={onSave} onCancel={vi.fn()} />,
  );
  await expect
    .element(page.getByRole("button", { name: "Thu", exact: true }))
    .toHaveAttribute("aria-pressed", "true");
  await page.getByRole("spinbutton", { name: "Repeat interval" }).fill("2");
  await page.getByRole("button", { name: "Mon", exact: true }).click();
  await page.getByRole("button", { name: "Repeat ends" }).click();
  await page.getByRole("menuitem", { name: "after", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Occurrences" }).fill("12");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect(onSave).toHaveBeenCalledWith("RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;COUNT=12");
});

it("prefills an existing rule and cancels without applying local changes", async () => {
  const onSave = vi.fn(),
    onCancel = vi.fn();
  await using _screen = await render(
    <RepeatDialog
      anchor={anchor}
      rule="RRULE:FREQ=WEEKLY;INTERVAL=3;BYDAY=MO,FR;COUNT=8"
      onSave={onSave}
      onCancel={onCancel}
    />,
  );
  await expect.element(page.getByRole("spinbutton", { name: "Repeat interval" })).toHaveValue(3);
  await expect.element(page.getByRole("spinbutton", { name: "Occurrences" })).toHaveValue(8);
  await expect
    .element(page.getByRole("button", { name: "Mon", exact: true }))
    .toHaveAttribute("aria-pressed", "true");
  await page.getByRole("spinbutton", { name: "Repeat interval" }).fill("4");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(onCancel).toHaveBeenCalledOnce();
  expect(onSave).not.toHaveBeenCalled();
});

it("saves a monthly weekday pattern with a date ending and preserves exclusions", async () => {
  const onSave = vi.fn();
  await using _screen = await render(
    <RepeatDialog
      anchor={anchor}
      rule={"RRULE:FREQ=MONTHLY;BYDAY=4TH\nEXDATE:20261126T120000Z"}
      onSave={onSave}
      onCancel={vi.fn()}
    />,
  );
  await page.getByRole("button", { name: "Repeat ends" }).click();
  await page.getByRole("menuitem", { name: "on", exact: true }).click();
  await page.getByLabelText("Last date", { exact: true }).fill("2026-12-31");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect(onSave).toHaveBeenCalledWith(
    "RRULE:FREQ=MONTHLY;BYDAY=4TH;UNTIL=20261231T225959Z\nEXDATE:20261126T120000Z",
  );
});

it("rejects invalid intervals, empty weekly selections and invalid counts", async () => {
  await using _screen = await render(
    <RepeatDialog anchor={anchor} rule="" onSave={vi.fn()} onCancel={vi.fn()} />,
  );
  await page.getByRole("spinbutton", { name: "Repeat interval" }).fill("0");
  await expect.element(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await page.getByRole("spinbutton", { name: "Repeat interval" }).fill("1");
  await page.getByRole("button", { name: "Thu", exact: true }).click();
  await expect.element(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Mon", exact: true }).click();
  await page.getByRole("button", { name: "Repeat ends" }).click();
  await page.getByRole("menuitem", { name: "after", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Occurrences" }).fill("");
  await expect.element(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
});

it.each([1280, 390, 320])("keeps the Repeat controls aligned and uncut at %spx", async (width) => {
  await page.viewport(width, 900);
  await using _viewport = { [Symbol.asyncDispose]: () => page.viewport(1280, 900) };
  await using _screen = await render(
    <RepeatDialog anchor={anchor} rule="" onSave={vi.fn()} onCancel={vi.fn()} />,
  );
  const popup = page.getByRole("dialog", { name: "Repeat", exact: true });
  await expect.element(popup).toBeVisible();
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  const bounds = dialog.getBoundingClientRect();
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(width);
  expect(dialog.scrollWidth).toBeLessThanOrEqual(dialog.clientWidth);
  const interval = dialog.querySelector('[aria-label="Repeat interval"]')!.getBoundingClientRect();
  const mon = dialog.querySelector("button[aria-pressed]")!.getBoundingClientRect();
  const ends = dialog.querySelector('[aria-label="Repeat ends"]')!.getBoundingClientRect();
  expect(interval.left).toBe(mon.left);
  expect(mon.left).toBe(ends.left);
  expect(interval.height).toBe(32);
  expect(mon.height).toBe(32);
  const thu = dialog.querySelectorAll("button[aria-pressed]")[3]!;
  expect(getComputedStyle(thu).boxShadow).toBe("none");
  expect(getComputedStyle(thu).borderWidth).toBe("0px");
  expect(getComputedStyle(thu).backgroundColor).not.toBe(
    getComputedStyle(dialog.querySelectorAll("button[aria-pressed]")[0]!).backgroundColor,
  );
});

it.each([
  ["day", "DAILY"],
  ["month", "MONTHLY"],
  ["year", "YEARLY"],
])("switches the compact unit menu to %s", async (unit, frequency) => {
  const onSave = vi.fn();
  await using _screen = await render(
    <RepeatDialog anchor={anchor} rule="" onSave={onSave} onCancel={vi.fn()} />,
  );
  await page.getByRole("button", { name: "Repeat unit" }).click();
  await page.getByRole("menuitem", { name: unit, exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect(onSave).toHaveBeenCalledWith(`RRULE:FREQ=${frequency}`);
});

it("keeps the dark modal opaque with a filled weekday selection", async () => {
  document.documentElement.classList.add("dark");
  using _theme = { [Symbol.dispose]: () => document.documentElement.classList.remove("dark") };
  await using _screen = await render(
    <RepeatDialog anchor={anchor} rule="" onSave={vi.fn()} onCancel={vi.fn()} />,
  );
  const dialog = document.querySelector<HTMLElement>("[data-repeat-dialog]")!;
  const canvas = document.createElement("canvas"),
    context = canvas.getContext("2d")!;
  context.fillStyle = getComputedStyle(dialog).backgroundColor;
  context.fillRect(0, 0, 1, 1);
  expect(context.getImageData(0, 0, 1, 1).data[3]).toBe(255);
});
