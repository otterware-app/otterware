import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { CalendarSelect } from "./CalendarSelect";
import type { CalendarEventReminders } from "@otterware/calendar-contracts";
export function ReminderFields({
  value,
  onChange,
  disabled,
  creating,
}: {
  value: CalendarEventReminders | undefined;
  onChange: (value: CalendarEventReminders | undefined) => void;
  disabled: boolean;
  creating: boolean;
}) {
  return (
    <>
      <label className="grid gap-1 text-sm has-[[role=checkbox]]:flex has-[[role=checkbox]]:items-center">
        Reminders
        <CalendarSelect
          value={
            value === undefined
              ? "account"
              : value.useDefault
                ? "provider"
                : value.overrides?.length
                  ? "custom"
                  : "none"
          }
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
      </label>
      {value?.useDefault === false && (value.overrides?.length ?? 0) > 0 && (
        <fieldset disabled={disabled}>
          <legend>Reminder overrides</legend>
          {value.overrides?.map((rule, index) => (
            <div className="grid grid-cols-2 gap-3" key={index}>
              <label className="grid gap-1 text-sm has-[[role=checkbox]]:flex has-[[role=checkbox]]:items-center">
                Method
                <CalendarSelect
                  value={rule.method}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      overrides: value.overrides?.map((item, i) =>
                        i === index
                          ? { ...item, method: event.target.value as "popup" | "email" }
                          : item,
                      ),
                    })
                  }
                >
                  <option value="popup">Popup</option>
                  <option value="email">Email</option>
                </CalendarSelect>
              </label>
              <label className="grid gap-1 text-sm has-[[role=checkbox]]:flex has-[[role=checkbox]]:items-center">
                Minutes before
                <Input
                  type="number"
                  required
                  min={0}
                  max={40320}
                  value={rule.minutes}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      overrides: value.overrides?.map((item, i) =>
                        i === index ? { ...item, minutes: Number(event.target.value) } : item,
                      ),
                    })
                  }
                />
              </label>
              <Button
                type="button"
                onClick={() =>
                  onChange({ ...value, overrides: value.overrides?.filter((_, i) => i !== index) })
                }
              >
                Remove reminder
              </Button>
            </div>
          ))}
          <Button
            type="button"
            disabled={(value.overrides?.length ?? 0) >= 5}
            onClick={() =>
              onChange({
                ...value,
                overrides: [...(value.overrides ?? []), { method: "popup", minutes: 30 }],
              })
            }
          >
            Add reminder
          </Button>
        </fieldset>
      )}
    </>
  );
}
