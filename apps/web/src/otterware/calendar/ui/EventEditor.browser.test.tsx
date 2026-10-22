import "../../../index.css";
import { Calendar, CalendarId, type CalendarEventDetails } from "@otterware/calendar-contracts";
import * as Schema from "effect/Schema";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "../../../../test/render";
import { EventEditor } from "./EventEditor";

const calendars = [
  Schema.decodeSync(Calendar)({
    calendarId: "work",
    accountId: "me",
    name: "Work",
    color: "#06b6d4",
    accessRole: "owner",
    primary: true,
    visible: true,
  }),
];
const start = Date.UTC(2026, 9, 22, 12);
const end = start + 30 * 60_000;
function event(extra: Partial<CalendarEventDetails> = {}): CalendarEventDetails {
  return {
    calendarId: CalendarId.make("work"),
    eventId: "event",
    title: "Design review",
    start,
    end,
    description: "Discuss the next release.",
    attendees: [],
    canRespond: false,
    ...extra,
  };
}
function props() {
  return {
    event: null as CalendarEventDetails | null,
    duplicate: false,
    draft: { start, end, allDay: false },
    timeZone: "Europe/Berlin",
    calendars,
    defaultCalendar: CalendarId.make("work"),
    canWrite: true,
    busy: false,
    onClose: vi.fn(),
    onSave: vi.fn(),
    onDelete: vi.fn(),
    onRespond: vi.fn(),
  };
}

it("creates an event only after submitting, with inline title and guest fields", async () => {
  const input = props();
  await using _screen = await render(<EventEditor {...input} />);
  await page.getByRole("textbox", { name: "Event title", exact: true }).fill("Team lunch");
  await page.getByRole("textbox", { name: "Guests", exact: true }).fill("guest@example.test");
  expect(input.onSave).not.toHaveBeenCalled();
  await page.getByRole("button", { name: "Create event", exact: true }).click();
  expect(input.onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      title: "Team lunch",
      attendees: ["guest@example.test"],
      calendarId: "work",
      time: {
        allDay: false,
        start: "2026-10-22T14:00:00+02:00",
        end: "2026-10-22T14:30:00+02:00",
        timeZone: "Europe/Berlin",
      },
    }),
  );
});

it("shows readable event details, then explicitly enters editing", async () => {
  const input = { ...props(), event: event(), draft: null };
  await using _screen = await render(<EventEditor {...input} />);
  await expect.element(page.getByRole("heading", { name: "Design review" })).toBeVisible();
  await expect.element(page.getByRole("textbox", { name: "Event title" })).not.toBeInTheDocument();
  await page.getByRole("button", { name: "Edit event", exact: true }).click();
  await page.getByRole("textbox", { name: "Event title", exact: true }).fill("Updated review");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  expect(input.onSave).toHaveBeenCalledWith(
    expect.objectContaining({ title: "Updated review", eventId: "event", calendarId: "work" }),
  );
});

it("keeps read-only details free of disabled editing fields", async () => {
  const input = { ...props(), event: event({ readOnly: true }), draft: null };
  await using _screen = await render(<EventEditor {...input} />);
  await expect.element(page.getByRole("heading", { name: "Design review" })).toBeVisible();
  await expect.element(page.getByRole("button", { name: "Edit event" })).not.toBeInTheDocument();
  await expect.element(page.getByRole("textbox", { name: "Event title" })).not.toBeInTheDocument();
  await page.getByRole("button", { name: "Close event", exact: true }).click();
  expect(input.onClose).toHaveBeenCalledOnce();
  expect(input.onSave).not.toHaveBeenCalled();
});

it("requires confirmation before deleting an event", async () => {
  const input = { ...props(), event: event(), draft: null };
  await using _screen = await render(<EventEditor {...input} />);
  await page.getByRole("button", { name: "Delete event", exact: true }).click();
  expect(input.onDelete).not.toHaveBeenCalled();
  const confirmation = page.getByRole("group", { name: "Confirm event deletion" });
  await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(input.onDelete).not.toHaveBeenCalled();
  await page.getByRole("button", { name: "Delete event", exact: true }).click();
  await confirmation.getByRole("button", { name: "Delete event", exact: true }).click();
  expect(input.onDelete).toHaveBeenCalledWith("this", "all");
});

it("does not offer RSVP actions for watch-only events", async () => {
  const input = { ...props(), event: event({ canRespond: true, watchOnly: true }), draft: null };
  await using _screen = await render(<EventEditor {...input} />);
  await expect
    .element(page.getByRole("button", { name: "Going", exact: true }))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: "Maybe", exact: true }))
    .not.toBeInTheDocument();
});

it("creates an all-day event with an exclusive end date", async () => {
  const input = props();
  await using _screen = await render(<EventEditor {...input} />);
  await page.getByRole("textbox", { name: "Event title", exact: true }).fill("Day off");
  await page.getByRole("switch", { name: "All day", exact: true }).click();
  await expect
    .element(page.getByRole("textbox", { name: "Start time", exact: true }))
    .not.toBeInTheDocument();
  await page.getByRole("button", { name: "Create event", exact: true }).click();
  expect(input.onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      time: { allDay: true, start: "2026-10-22", end: "2026-10-23" },
    }),
  );
});

it("keeps recurrence locked for one occurrence and unlocks a series edit", async () => {
  const input = {
    ...props(),
    event: event({ seriesId: "series", recurrence: ["RRULE:FREQ=WEEKLY"] }),
    draft: null,
  };
  await using _screen = await render(<EventEditor {...input} />);
  await page.getByRole("button", { name: "Edit event", exact: true }).click();
  await expect.element(page.getByRole("combobox", { name: "Repeats", exact: true })).toBeDisabled();
  await page.getByRole("combobox", { name: "Apply changes to", exact: true }).click();
  await page.getByRole("option", { name: "All events", exact: true }).click();
  await expect.element(page.getByRole("combobox", { name: "Repeats", exact: true })).toBeEnabled();
  await page
    .getByRole("textbox", { name: "Event title", exact: true })
    .fill("Weekly design review");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  expect(input.onSave).toHaveBeenCalledWith(
    expect.objectContaining({ scope: "all", title: "Weekly design review" }),
  );
});

it("keeps an open creation card inside a resized window", async () => {
  await page.viewport(1280, 900);
  await using _viewport = {
    [Symbol.asyncDispose]: () => page.viewport(1280, 900),
  };
  await using _screen = await render(<EventEditor {...props()} />);
  await expect
    .element(page.getByRole("button", { name: "Create event", exact: true }))
    .toBeVisible();
  await page.viewport(390, 844);
  await expect
    .poll(() => {
      const rect = document.querySelector("[data-calendar-editor]")?.getBoundingClientRect();
      return (
        !!rect &&
        rect.left >= 0 &&
        rect.right <= window.innerWidth &&
        rect.top >= 0 &&
        rect.bottom <= window.innerHeight
      );
    })
    .toBe(true);
});
