import "./RepeatDialog.css";
import { Dialog } from "@base-ui/react/dialog";
import { Menu } from "@base-ui/react/menu";
import { useState, type ReactNode, type RefObject } from "react";
import {
  buildRecurrenceRule,
  repeatOptionsOf,
  type RepeatOptions,
} from "@otterware/calendar-contracts/recurrence";
import {
  DAY_MS,
  civilDate,
  formatDayNumber,
  parseDayNumber,
  toZoned,
  weekday,
} from "@otterware/calendar-contracts/time";
import { repeatChoiceLabel } from "./runtime/eventEditor.logic";

type Anchor = { start: number; allDay: boolean; timeZone: string };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const UNITS = [
  { value: "DAILY", label: "day" },
  { value: "WEEKLY", label: "week" },
  { value: "MONTHLY", label: "month" },
  { value: "YEARLY", label: "year" },
] as const;

/** The custom picker edits a local draft; only its Save changes the event editor. */
export function RepeatDialog({
  anchor,
  surface,
  rule,
  onSave,
  onCancel,
}: {
  anchor: Anchor;
  surface?: RefObject<HTMLElement | null> | undefined;
  rule: string;
  onSave: (rule: string) => void;
  onCancel: () => void;
}) {
  const startDay = anchor.allDay
    ? Math.floor(anchor.start / DAY_MS)
    : toZoned(anchor.start, anchor.timeZone).day;
  const [initial] = useState(() => repeatOptionsOf(rule.split("\n"), anchor));
  const [frequency, setFrequency] = useState<RepeatOptions["freq"]>(initial?.freq ?? "WEEKLY");
  const [interval, setInterval] = useState(String(initial?.interval ?? 1));
  const [weekdays, setWeekdays] = useState<ReadonlyArray<number>>(
    initial?.weekdays ?? [weekday(startDay)],
  );
  const [monthlyByWeekday, setMonthlyByWeekday] = useState(initial?.monthlyByWeekday ?? false);
  const [ending, setEnding] = useState(
    initial?.count !== undefined ? "count" : initial?.untilDay !== undefined ? "until" : "never",
  );
  const [count, setCount] = useState(String(initial?.count ?? 1));
  const [until, setUntil] = useState(formatDayNumber(initial?.untilDay ?? startDay + 30));
  const untilDay = parseDayNumber(until);
  const valid =
    Number.isInteger(Number(interval)) &&
    Number(interval) >= 1 &&
    Number(interval) <= 999 &&
    (frequency !== "WEEKLY" || weekdays.length > 0) &&
    (ending !== "count" ||
      (Number.isInteger(Number(count)) && Number(count) >= 1 && Number(count) <= 10000)) &&
    (ending !== "until" || (untilDay !== null && untilDay >= startDay));
  const save = () => {
    if (!valid) return;
    const next: RepeatOptions = {
      freq: frequency,
      interval: Number(interval),
      ...(frequency === "WEEKLY" ? { weekdays } : {}),
      ...(frequency === "MONTHLY" ? { monthlyByWeekday } : {}),
      ...(ending === "count"
        ? { count: Number(count) }
        : ending === "until" && untilDay !== null
          ? { untilDay }
          : {}),
    };
    onSave(
      [
        buildRecurrenceRule(next, anchor),
        ...rule.split("\n").filter((line) => line && !line.toUpperCase().startsWith("RRULE")),
      ].join("\n"),
    );
  };
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <Dialog.Portal container={surface}>
        <Dialog.Backdrop
          forceRender
          render={
            <div
              className={
                surface
                  ? "absolute inset-0 z-[140] bg-black/40"
                  : "fixed inset-0 z-[140] bg-black/40"
              }
            />
          }
        />
        <div
          className={
            surface
              ? "pointer-events-none absolute inset-0 z-[140] grid place-items-center p-4"
              : "pointer-events-none fixed inset-0 z-[140] grid place-items-center p-4"
          }
        >
          <Dialog.Popup
            data-repeat-dialog=""
            render={
              <div className="pointer-events-auto flex w-110 max-w-[calc(100vw-32px)] max-h-[calc(100dvh-32px)] flex-col overflow-y-auto rounded-xl bg-popover text-popover-foreground shadow-xl outline-none" />
            }
            aria-describedby={undefined}
          >
            <Dialog.Title
              render={<h2 className="px-4 pt-4 pb-4 text-base font-semibold leading-6" />}
            >
              Repeat
            </Dialog.Title>
            <form
              className="min-h-0 overflow-y-auto"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <div className="grid gap-2 px-4 pb-4">
                <RepeatRow label="Every">
                  <div className="flex w-fit items-center overflow-hidden rounded-md bg-foreground/8 dark:bg-white/10">
                    <input
                      aria-label="Repeat interval"
                      type="number"
                      min={1}
                      max={999}
                      autoFocus
                      onFocus={(event) => event.currentTarget.select()}
                      value={interval}
                      onChange={(e) => setInterval(e.target.value)}
                      className="h-8 w-8 min-w-0 rounded-md border-0 bg-transparent p-0 text-center text-base font-medium outline-none focus:bg-accent sm:text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <RepeatMenu
                      label="Repeat unit"
                      value={frequency}
                      options={UNITS}
                      onChange={setFrequency}
                    />
                  </div>
                </RepeatRow>
                {frequency === "WEEKLY" && (
                  <RepeatRow label="On">
                    <div
                      className="grid w-full max-w-84 grid-cols-7 overflow-hidden rounded-md bg-foreground/8 dark:bg-white/10"
                      role="group"
                      aria-label="Repeat on"
                    >
                      {DAYS.map((day, index) => {
                        const value = (index + 1) % 7;
                        return (
                          <button
                            type="button"
                            key={day}
                            aria-pressed={weekdays.includes(value)}
                            onClick={() =>
                              setWeekdays((previous) =>
                                previous.includes(value)
                                  ? previous.filter((d) => d !== value)
                                  : [...previous, value],
                              )
                            }
                            className="h-8 min-w-0 cursor-pointer rounded-md border-0 px-0 text-xs font-medium outline-none hover:bg-accent focus-visible:bg-accent aria-pressed:bg-foreground aria-pressed:text-background sm:text-sm dark:aria-pressed:bg-white/20 dark:aria-pressed:text-foreground"
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </RepeatRow>
                )}
                {frequency === "MONTHLY" && (
                  <RepeatRow label="On">
                    <RepeatMenu
                      label="Monthly pattern"
                      value={monthlyByWeekday ? "weekday" : "date"}
                      onChange={(value) => setMonthlyByWeekday(value === "weekday")}
                      options={[
                        {
                          value: "date",
                          label: `the ${ordinal(civilDate(startDay).day)}`,
                        },
                        {
                          value: "weekday",
                          label: repeatChoiceLabel("monthlyWeekday", anchor).replace(
                            /^Monthly on /,
                            "",
                          ),
                        },
                      ]}
                    />
                  </RepeatRow>
                )}
                <RepeatRow label="Ends">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <RepeatMenu
                      label="Repeat ends"
                      value={ending}
                      onChange={setEnding}
                      options={[
                        { value: "never", label: "never" },
                        { value: "count", label: "after" },
                        { value: "until", label: "on" },
                      ]}
                    />
                    {ending === "count" && (
                      <div className="flex h-8 items-center rounded-md bg-foreground/8 dark:bg-white/10 px-2 text-sm">
                        <input
                          aria-label="Occurrences"
                          type="number"
                          min={1}
                          max={10000}
                          value={count}
                          onChange={(e) => setCount(e.target.value)}
                          className="h-8 w-10 min-w-0 border-0 bg-transparent p-0 text-center text-base outline-none sm:text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                        <span>{Number(count) === 1 ? "time" : "times"}</span>
                      </div>
                    )}
                    {ending === "until" && (
                      <input
                        aria-label="Last date"
                        type="date"
                        value={until}
                        min={formatDayNumber(startDay)}
                        onChange={(e) => setUntil(e.target.value)}
                        className="h-8 min-w-0 max-w-full rounded-md border-0 bg-muted px-2 text-base outline-none focus:bg-accent sm:text-sm"
                      />
                    )}
                  </div>
                </RepeatRow>
              </div>
              <div className="flex justify-end gap-2 border-t border-border p-4">
                <button
                  type="button"
                  onClick={onCancel}
                  className="h-9 cursor-pointer rounded-lg border border-input px-4 text-sm font-semibold outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!valid}
                  className="h-9 cursor-pointer rounded-lg bg-success px-4 text-sm font-semibold text-white outline-none hover:bg-success/90 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default disabled:opacity-50 dark:bg-success dark:hover:bg-success"
                >
                  Save
                </button>
              </div>
            </form>
          </Dialog.Popup>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function RepeatRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-h-8 grid-cols-[4rem_minmax(0,1fr)] items-center text-sm">
      <span>{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function RepeatMenu<Value extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: Value;
  options: ReadonlyArray<{ value: Value; label: string }>;
  onChange: (value: Value) => void;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={label}
        render={
          <button
            type="button"
            className="flex h-8 cursor-pointer items-center rounded-md border-0 bg-muted px-2.5 text-sm font-medium outline-none hover:bg-accent focus-visible:bg-accent"
          />
        }
      >
        {options.find((option) => option.value === value)?.label}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={4} align="start" className="z-[150]">
          <Menu.Popup
            render={
              <div className="min-w-20 rounded-lg bg-popover p-1 text-popover-foreground shadow-lg outline-none" />
            }
          >
            {options.map((option) => (
              <Menu.Item
                key={option.value}
                data-current={value === option.value ? "" : undefined}
                onClick={() => onChange(option.value)}
                render={
                  <div className="flex h-8 cursor-pointer items-center rounded-md px-2 text-sm outline-none data-highlighted:bg-accent data-current:bg-accent" />
                }
              >
                {option.label}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function ordinal(value: number): string {
  const remainder = value % 100;
  const suffix =
    remainder >= 11 && remainder <= 13
      ? "th"
      : (({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[value % 10] ?? "th");
  return `${value}${suffix}`;
}
