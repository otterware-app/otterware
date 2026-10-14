import { expect, it } from "vite-plus/test";
import { CalendarId } from "@otterware/calendar-contracts";
import { createWrite, fieldPatch, previousFieldsAndTime, seriesCopy } from "./changes.ts";
it("keeps personal reminder overrides through creation, undo and series splitting", () => {
  const previous = {
    id: "event",
    reminders: { useDefault: false, overrides: [{ method: "email" as const, minutes: 30 }] },
  };
  const reminders = { useDefault: false, overrides: [{ method: "popup" as const, minutes: 10 }] };
  expect(fieldPatch({ reminders }, previous, () => "request").reminders).toEqual(reminders);
  expect(previousFieldsAndTime({ reminders }, previous, "UTC").reminders).toEqual(
    previous.reminders,
  );
  expect(seriesCopy(previous, () => "request").reminders).toEqual(previous.reminders);
  expect(
    createWrite(
      {
        calendarId: CalendarId.make("calendar"),
        time: { allDay: true, start: "2026-10-13", end: "2026-10-14" },
        reminders,
      },
      () => "request",
    ).reminders,
  ).toEqual(reminders);
  expect(previousFieldsAndTime({ reminders }, { id: "event" }, "UTC").reminders).toEqual({
    useDefault: true,
  });
});
