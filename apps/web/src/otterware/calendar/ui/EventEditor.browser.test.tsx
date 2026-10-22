import "../../../index.css";
import { Calendar, CalendarId, type CalendarEventDetails } from "@otterware/calendar-contracts";
import * as Schema from "effect/Schema";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
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
  await page.getByRole("button", { name: "Send event", exact: true }).click();
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

it("opens writable events directly in the floating editor without saving", async () => {
  const input = { ...props(), event: event(), draft: null };
  await using _screen = await render(<EventEditor {...input} />);
  await expect
    .element(page.getByRole("textbox", { name: "Event title", exact: true }))
    .toHaveValue("Design review");
  expect(input.onSave).not.toHaveBeenCalled();
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
  await page.getByRole("button", { name: "More event options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete event", exact: true }).click();
  expect(input.onDelete).not.toHaveBeenCalled();
  const confirmation = page.getByRole("dialog", { name: "Delete event?", exact: true });
  await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(input.onDelete).not.toHaveBeenCalled();
  await page.getByRole("button", { name: "More event options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete event", exact: true }).click();
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
    .element(page.getByRole("combobox", { name: "Start time", exact: true }))
    .not.toBeInTheDocument();
  await page.getByRole("button", { name: "Create event", exact: true }).click();
  expect(input.onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      time: { allDay: true, start: "2026-10-22", end: "2026-10-23" },
    }),
  );
});

it.each([
  ["this", "This event"],
  ["following", "This and following events"],
  ["all", "All events"],
])("asks for recurrence scope only after Save, then saves %s", async (scope, label) => {
  const input = {
    ...props(),
    event: event({ seriesId: "series", recurrence: ["RRULE:FREQ=WEEKLY"] }),
    draft: null,
  };
  await using _screen = await render(<EventEditor {...input} />);
  await expect
    .element(page.getByRole("radio", { name: "This event", exact: true }))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByRole("combobox", { name: "Apply changes to", exact: true }))
    .not.toBeInTheDocument();
  await page
    .getByRole("textbox", { name: "Event title", exact: true })
    .fill("Weekly design review");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  expect(input.onSave).not.toHaveBeenCalled();
  await expect
    .element(page.getByRole("dialog", { name: "Edit recurring event", exact: true }))
    .toBeVisible();
  await page.getByRole("radio", { name: label, exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect(input.onSave).toHaveBeenCalledOnce();
  expect(input.onSave).toHaveBeenCalledWith(
    expect.objectContaining({ scope, title: "Weekly design review" }),
  );
});

it("cancels recurrence confirmation without saving or discarding the edited draft", async () => {
  const input = {
    ...props(),
    event: event({ seriesId: "series", recurrence: ["RRULE:FREQ=WEEKLY"] }),
    draft: null,
  };
  await using _screen = await render(<EventEditor {...input} />);
  await page.getByRole("textbox", { name: "Event title", exact: true }).fill("Unsent change");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(input.onSave).not.toHaveBeenCalled();
  expect(input.onClose).not.toHaveBeenCalled();
  await expect
    .element(page.getByRole("textbox", { name: "Event title", exact: true }))
    .toHaveValue("Unsent change");
});

it("requires a series scope when the repeating schedule changes", async () => {
  const input = {
    ...props(),
    event: event({ seriesId: "series", recurrence: ["RRULE:FREQ=WEEKLY"] }),
    draft: null,
  };
  await using _screen = await render(<EventEditor {...input} />);
  await page.getByRole("button", { name: "Repeats", exact: true }).click();
  await page.getByRole("menuitem", { name: "Daily", exact: true }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  expect(input.onSave).not.toHaveBeenCalled();
  await expect.element(page.getByRole("radio", { name: "This event", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect(input.onSave).toHaveBeenCalledWith(
    expect.objectContaining({ scope: "following", recurrence: ["RRULE:FREQ=DAILY"] }),
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

it("opens existing event details at the bottom center, independently of the event block", async () => {
  await page.viewport(1280, 900);
  const anchor = document.createElement("button");
  anchor.dataset.eventKey = "work/event";
  anchor.style.cssText = "position:fixed;left:10px;top:10px;width:80px;height:30px";
  document.body.append(anchor);
  using _anchor = { [Symbol.dispose]: () => anchor.remove() };
  await using _screen = await render(<EventEditor {...props()} event={event()} draft={null} />);
  await expect
    .element(page.getByRole("textbox", { name: "Event title", exact: true }))
    .toHaveValue("Design review");
  await expect
    .poll(() => {
      const rect = document.querySelector("[data-calendar-editor]")!.getBoundingClientRect();
      return (
        Math.abs(rect.left + rect.width / 2 - window.innerWidth / 2) < 2 &&
        Math.abs(rect.bottom - (window.innerHeight - 24)) < 2
      );
    })
    .toBe(true);
});

it("centers within the calendar surface and follows sidebar width changes", async () => {
  await page.viewport(1280, 900);
  const surface = document.createElement("div");
  surface.style.cssText = "position:relative;margin-left:300px;width:900px;height:800px";
  document.body.append(surface);
  using _surface = { [Symbol.dispose]: () => surface.remove() };
  await using _screen = await render(<EventEditor {...props()} surface={{ current: surface }} />);
  const centered = () => {
    const card = document
      .querySelector("[data-calendar-editor]")!
      .closest('[role="dialog"]')!
      .getBoundingClientRect();
    const bounds = surface.getBoundingClientRect();
    return (
      Math.abs(card.left + card.width / 2 - (bounds.left + bounds.width / 2)) < 1 &&
      Math.abs(card.bottom - (bounds.bottom - 24)) < 1
    );
  };
  await expect.poll(centered).toBe(true);
  surface.style.marginLeft = "80px";
  surface.style.width = "1100px";
  await expect.poll(centered).toBe(true);
  await page.getByRole("button", { name: "Repeats", exact: true }).click();
  await page.getByRole("menuitem", { name: "Custom", exact: true }).click();
  const repeat = document.querySelector("[data-repeat-dialog]")!.getBoundingClientRect();
  const bounds = surface.getBoundingClientRect();
  expect(Math.abs(repeat.left + repeat.width / 2 - (bounds.left + bounds.width / 2))).toBeLessThan(
    1,
  );
  expect(Math.abs(repeat.top + repeat.height / 2 - (bounds.top + bounds.height / 2))).toBeLessThan(
    1,
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(document.activeElement?.getAttribute("aria-label")).toBe("Repeats");
});

it.each([1280, 390, 320])(
  "aligns inline fields and avoids control overlap at %spx",
  async (width) => {
    await page.viewport(width, 900);
    await using _viewport = { [Symbol.asyncDispose]: () => page.viewport(1280, 900) };
    await using _screen = await render(<EventEditor {...props()} />);
    await expect
      .element(page.getByRole("textbox", { name: "Event title", exact: true }))
      .toBeVisible();
    const form = document.querySelector<HTMLElement>("[data-calendar-editor]")!;
    const fields = ["Event title", "Guests", "Location", "Start time"].map((name) =>
      form.querySelector<HTMLInputElement>(`input[aria-label="${name}"]`)!,
    );
    for (const field of fields) {
      expect(field.getBoundingClientRect().left).toBeCloseTo(
        fields[0]!.getBoundingClientRect().left,
        0,
      );
      expect(getComputedStyle(field).paddingLeft).toBe("0px");
      expect(field.getBoundingClientRect().height).toBe(24);
    }
    expect(form.scrollWidth).toBeLessThanOrEqual(form.clientWidth);
    const controls = [
      ...form.querySelectorAll<HTMLElement>('input[aria-label],button,[role="combobox"]'),
    ].filter((e) => e.getBoundingClientRect().width > 2);
    for (const [index, first] of controls.entries()) {
      for (const second of controls.slice(index + 1)) {
        if (first.contains(second) || second.contains(first)) continue;
        const a = first.getBoundingClientRect(),
          b = second.getBoundingClientRect();
        const overlaps =
          Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
          Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
        expect(
          overlaps,
          `${first.getAttribute("aria-label") || first.textContent} overlaps ${second.getAttribute("aria-label") || second.textContent}`,
        ).toBe(false);
      }
    }
  },
);

it("opens Custom as a separate draft dialog and applies its result only after Save", async () => {
  const input = props();
  await using _screen = await render(<EventEditor {...input} />);
  await page.getByRole("button", { name: "Repeats", exact: true }).click();
  await page.getByRole("menuitem", { name: "Custom", exact: true }).click();
  await expect.element(page.getByRole("dialog", { name: "Repeat", exact: true })).toBeVisible();
  await expect.element(page.getByText("Custom schedule", { exact: true })).not.toBeInTheDocument();
  await expect.element(page.getByText("Recurrence rules", { exact: true })).not.toBeInTheDocument();
  await page.getByRole("spinbutton", { name: "Repeat interval" }).fill("2");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(input.onSave).not.toHaveBeenCalled();
  await expect
    .element(page.getByRole("button", { name: "Repeats", exact: true }))
    .toHaveTextContent("Repeat");
  await page.getByRole("button", { name: "Repeats", exact: true }).click();
  await page.getByRole("menuitem", { name: "Custom", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Repeat interval" }).fill("2");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect(input.onSave).not.toHaveBeenCalled();
  await page.getByRole("button", { name: "Create event", exact: true }).click();
  expect(input.onSave).toHaveBeenCalledWith(
    expect.objectContaining({ recurrence: ["RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TH"] }),
  );
});

it("commits guest chips with Enter without saving and removes them independently", async () => {
  const input = props();
  await using _screen = await render(<EventEditor {...input} />);
  const guests = page.getByRole("textbox", { name: "Guests", exact: true });
  await guests.fill("first@example.test");
  await userEvent.keyboard("{Enter}");
  expect(input.onSave).not.toHaveBeenCalled();
  await expect.element(guests).toHaveValue("");
  await expect
    .element(page.getByRole("button", { name: "Remove first@example.test", exact: true }))
    .toBeVisible();
  await guests.fill("second@example.test");
  await userEvent.keyboard("{Enter}");
  await page.getByRole("button", { name: "Remove first@example.test", exact: true }).click();
  await page.getByRole("button", { name: "Send event", exact: true }).click();
  expect(input.onSave).toHaveBeenCalledWith(
    expect.objectContaining({ attendees: ["second@example.test"] }),
  );
});

it("chooses quarter-hour times and preserves duration before explicitly saving", async () => {
  const input = props();
  await using _screen = await render(<EventEditor {...input} hourFormat="12" />);
  const startField = page.getByRole("combobox", { name: "Start time", exact: true });
  await startField.click();
  await page.getByRole("option", { name: "3:15 PM", exact: true }).click();
  await expect.element(startField).toHaveValue("3:15 PM");
  await expect
    .element(page.getByRole("combobox", { name: "End time", exact: true }))
    .toHaveValue("3:45 PM");
  expect(input.onSave).not.toHaveBeenCalled();
  await page.getByRole("button", { name: "Create event", exact: true }).click();
  expect(input.onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      time: {
        allDay: false,
        start: "2026-10-22T15:15:00+02:00",
        end: "2026-10-22T15:45:00+02:00",
        timeZone: "Europe/Berlin",
      },
    }),
  );
});

it("dismisses time suggestions with Escape without closing the card or saving", async () => {
  const input = props();
  await using _screen = await render(<EventEditor {...input} />);
  await page.getByRole("combobox", { name: "Start time", exact: true }).click();
  await expect.element(page.getByRole("listbox")).toBeVisible();
  await userEvent.keyboard("{Escape}");
  await expect.element(page.getByRole("listbox")).not.toBeInTheDocument();
  await expect
    .element(page.getByRole("textbox", { name: "Event title", exact: true }))
    .toBeVisible();
  expect(input.onClose).not.toHaveBeenCalled();
  expect(input.onSave).not.toHaveBeenCalled();
});

it("uses a date popover and keeps an all-day range's inclusive last day", async () => {
  const input = props();
  await using _screen = await render(<EventEditor {...input} />);
  await page.getByRole("switch", { name: "All day", exact: true }).click();
  await page.getByRole("button", { name: "Last day", exact: true }).click();
  await page.getByRole("textbox", { name: "Type last day", exact: true }).fill("2026-10-24");
  await userEvent.keyboard("{Enter}");
  expect(input.onSave).not.toHaveBeenCalled();
  await expect
    .element(page.getByRole("dialog", { name: "Last day", exact: true }))
    .not.toBeInTheDocument();
  await page.getByRole("button", { name: "Create event", exact: true }).click();
  expect(input.onSave).toHaveBeenCalledWith(
    expect.objectContaining({ time: { allDay: true, start: "2026-10-22", end: "2026-10-25" } }),
  );
});

it("edits description in its own view and returns to the same unsaved event", async () => {
  const input = props();
  await using _screen = await render(<EventEditor {...input} />);
  await page.getByRole("textbox", { name: "Event title", exact: true }).fill("Review");
  await page.getByRole("button", { name: "Add description", exact: true }).click();
  await expect
    .element(page.getByRole("textbox", { name: "Guests", exact: true }))
    .not.toBeInTheDocument();
  await page.getByRole("textbox", { name: "Description", exact: true }).fill("Notes for review");
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect
    .element(page.getByRole("textbox", { name: "Event title", exact: true }))
    .toHaveValue("Review");
  expect(input.onSave).not.toHaveBeenCalled();
  await page.getByRole("button", { name: "Create event", exact: true }).click();
  expect(input.onSave).toHaveBeenCalledWith(
    expect.objectContaining({ description: "<p>Notes for review</p>" }),
  );
});

it("renders read-only provider description markup as inert content", async () => {
  const description =
    '<p>Review <strong>notes</strong><img src="x" onerror="window.__calendarInjected=true"></p>';
  const input = { ...props(), event: event({ description, readOnly: true }), draft: null };
  await using _screen = await render(<EventEditor {...input} />);
  const form = document.querySelector("[data-calendar-editor]")!;
  expect(form.querySelector("strong")?.textContent).toBe("notes");
  expect(form.querySelector("img")).toBeNull();
});

it("keeps privacy and reminder choices separate and saves both with the draft", async () => {
  const input = props();
  await using _screen = await render(<EventEditor {...input} />);
  await page.getByRole("button", { name: "Visibility", exact: true }).click();
  await page.getByRole("menuitem", { name: "Private", exact: true }).click();
  await page.getByRole("button", { name: "Reminders", exact: true }).click();
  await expect.element(page.getByRole("dialog", { name: "Reminders", exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Reminder defaults", exact: true }).click();
  await page.getByRole("option", { name: "No reminders", exact: true }).click();
  await userEvent.keyboard("{Escape}");
  expect(input.onSave).not.toHaveBeenCalled();
  await page.getByRole("button", { name: "Create event", exact: true }).click();
  expect(input.onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      visibility: "private",
      reminders: { useDefault: false, overrides: [] },
    }),
  );
});

it("toggles availability in one click and preserves provider HTML on unrelated edits", async () => {
  const input = {
    ...props(),
    event: event({ description: "<p>Existing <strong>notes</strong></p>" }),
    draft: null,
  };
  await using _screen = await render(<EventEditor {...input} />);
  await page.getByRole("button", { name: "Availability", exact: true }).click();
  await expect
    .element(page.getByRole("button", { name: "Availability", exact: true }))
    .toHaveTextContent("Free");
  expect(input.onSave).not.toHaveBeenCalled();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  expect(input.onSave).toHaveBeenCalledWith(expect.objectContaining({ free: true }));
  expect(input.onSave).toHaveBeenCalledWith(
    expect.not.objectContaining({ description: expect.anything() }),
  );
});

it("uses arrows and Enter for time suggestions without submitting the event", async () => {
  const input = props();
  await using _screen = await render(<EventEditor {...input} hourFormat="12" />);
  const field = page.getByRole("combobox", { name: "Start time", exact: true });
  await field.click();
  await userEvent.keyboard("{ArrowDown}{Enter}");
  await expect.element(field).toHaveValue("2:15 PM");
  await expect
    .element(page.getByRole("combobox", { name: "End time", exact: true }))
    .toHaveValue("2:45 PM");
  await expect.element(page.getByRole("listbox")).not.toBeInTheDocument();
  await field.fill("16:15");
  await userEvent.keyboard("{Enter}");
  await expect.element(field).toHaveValue("4:15 PM");
  await expect
    .element(page.getByRole("combobox", { name: "End time", exact: true }))
    .toHaveValue("4:45 PM");
  expect(input.onSave).not.toHaveBeenCalled();
});

it("does not send an unchanged event or a cancelled timezone draft", async () => {
  const input = { ...props(), event: event(), draft: null };
  await using _screen = await render(<EventEditor {...input} />);
  await expect
    .element(page.getByRole("button", { name: "Save changes", exact: true }))
    .toBeDisabled();
  await page.getByRole("button", { name: "More event options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Event time zone…", exact: true }).click();
  await page.getByRole("textbox", { name: "Event time zone", exact: true }).fill("Invalid/Zone");
  await expect.element(page.getByRole("button", { name: "Done", exact: true })).toBeDisabled();
  await userEvent.keyboard("{Escape}");
  await expect
    .element(page.getByRole("button", { name: "Save changes", exact: true }))
    .toBeDisabled();
  expect(input.onSave).not.toHaveBeenCalled();
});

it("can move one recurring occurrence without rewriting the series", async () => {
  const input = {
    ...props(),
    event: event({ seriesId: "series", recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=TH"] }),
    draft: null,
  };
  await using _screen = await render(<EventEditor {...input} hourFormat="12" />);
  await page.getByRole("combobox", { name: "Start time", exact: true }).fill("3 PM");
  await userEvent.keyboard("{Enter}");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect
    .element(page.getByRole("radio", { name: "This event", exact: true }))
    .not.toBeDisabled();
  expect(input.onSave).not.toHaveBeenCalled();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect(input.onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      scope: "this",
      time: expect.objectContaining({ start: "2026-10-22T15:00:00+02:00" }),
    }),
  );
  expect(input.onSave).toHaveBeenCalledWith(
    expect.not.objectContaining({ recurrence: expect.anything() }),
  );
});

it("asks for scope immediately after a recurring drag and cancels without saving", async () => {
  const input = {
    ...props(),
    event: event({ seriesId: "series", recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=TH"] }),
    draft: { start: start + 3_600_000, end: end + 3_600_000, allDay: false },
  };
  await using _screen = await render(<EventEditor {...input} />);
  await expect
    .element(page.getByRole("dialog", { name: "Edit recurring event", exact: true }))
    .toBeVisible();
  expect(input.onSave).not.toHaveBeenCalled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(input.onSave).not.toHaveBeenCalled();
  expect(input.onClose).toHaveBeenCalledOnce();
});

it("keeps dates readable when a long recurrence label wraps in a narrow card", async () => {
  await page.viewport(320, 844);
  await using _viewport = { [Symbol.asyncDispose]: () => page.viewport(1280, 900) };
  await using _screen = await render(
    <EventEditor
      {...props()}
      event={event({ seriesId: "series", recurrence: ["RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TH"] })}
      draft={null}
    />,
  );
  const form = document.querySelector<HTMLElement>("[data-calendar-editor]")!;
  const start = form.querySelector('[aria-label="Start date"]')!.getBoundingClientRect();
  const end = form.querySelector('[aria-label="End date"]')!.getBoundingClientRect();
  const repeat = form.querySelector('[aria-label="Repeats"]')!.getBoundingClientRect();
  expect(start.width).toBeGreaterThanOrEqual(80);
  expect(end.width).toBeGreaterThanOrEqual(80);
  expect(repeat.top).toBeGreaterThanOrEqual(start.bottom);
  expect(form.scrollWidth).toBeLessThanOrEqual(form.clientWidth);
});
