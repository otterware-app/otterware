import type { CalendarEventReminders } from "@otterware/calendar-contracts";
import { PlusIcon, XIcon } from "lucide-react";
import { CalendarSelect } from "./CalendarSelect";
import { Button } from "~/components/ui/button";

/** A small event-local menu; account defaults remain separate from provider defaults. */
export function EventReminders({
  value,
  onChange,
  disabled,
  creating,
  defaults,
}: {
  value: CalendarEventReminders | undefined;
  onChange: (value: CalendarEventReminders | undefined) => void;
  disabled: boolean;
  creating: boolean;
  defaults: ReadonlyArray<{ method: string; minutes: number }> | undefined;
}) {
  const mode =
    value === undefined
      ? "account"
      : value.useDefault
        ? "provider"
        : value.overrides?.length
          ? "custom"
          : "none";
  return (
    <fieldset disabled={disabled} className="grid w-64 max-w-full gap-2">
      <legend className="mb-2 text-sm font-medium">Reminders</legend>
      <CalendarSelect
        aria-label="Reminder defaults"
        value={mode}
        disabled={disabled}
        onChange={(event) =>
          onChange(
            event.target.value === "account"
              ? undefined
              : event.target.value === "provider"
                ? { useDefault: true }
                : {
                    useDefault: false,
                    overrides:
                      event.target.value === "custom" ? [{ method: "popup", minutes: 10 }] : [],
                  },
          )
        }
      >
        {creating && <option value="account">Account defaults</option>}
        <option value="provider">Calendar defaults</option>
        <option value="none">No reminders</option>
        <option value="custom">Custom reminders</option>
      </CalendarSelect>
      {mode === "provider" && defaults && (
        <p className="text-xs text-muted-foreground">
          {defaults.map((rule) => `${rule.method}, ${rule.minutes} minutes before`).join("; ") ||
            "No calendar reminders"}
        </p>
      )}
      {mode === "custom" && (
        <>
          {value?.overrides?.map((rule, index) => (
            // eslint-disable-next-line react/no-array-index-key -- Provider reminders have no IDs; keep the numeric editor focused as its value changes.
            <div className="flex items-center gap-1.5" key={index}>
              <div className="min-w-0 flex-1">
                <CalendarSelect
                  compact
                  aria-label={`Reminder ${index + 1} method`}
                  value={rule.method}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange({
                      useDefault: false,
                      overrides: value.overrides?.map((item, i) =>
                        i === index
                          ? { ...item, method: event.target.value as "popup" | "email" }
                          : item,
                      ),
                    })
                  }
                >
                  <option value="popup">Notification</option>
                  <option value="email">Email</option>
                </CalendarSelect>
              </div>
              <input
                type="number"
                aria-label={`Reminder ${index + 1} minutes before`}
                min={0}
                max={40320}
                required
                value={rule.minutes}
                disabled={disabled}
                onChange={(event) => {
                  const minutes = event.target.valueAsNumber;
                  if (Number.isInteger(minutes) && minutes >= 0 && minutes <= 40320)
                    onChange({
                      useDefault: false,
                      overrides: value.overrides?.map((item, i) =>
                        i === index ? { ...item, minutes } : item,
                      ),
                    });
                }}
                className="h-7 w-14 rounded bg-muted px-1.5 text-base outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40 sm:text-sm"
              />
              <span className="text-xs text-muted-foreground">min</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove reminder ${index + 1}`}
                disabled={disabled}
                onClick={() =>
                  onChange({
                    useDefault: false,
                    overrides: value.overrides?.filter((_, i) => i !== index),
                  })
                }
              >
                <XIcon />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || (value?.overrides?.length ?? 0) >= 5}
            onClick={() =>
              onChange({
                useDefault: false,
                overrides: [...(value?.overrides ?? []), { method: "popup", minutes: 30 }],
              })
            }
          >
            <PlusIcon />
            Add reminder
          </Button>
        </>
      )}
    </fieldset>
  );
}
