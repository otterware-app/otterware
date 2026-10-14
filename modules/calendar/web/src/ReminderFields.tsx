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
      <label>
        Reminders
        <select
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
        </select>
      </label>
      {value?.useDefault === false && (value.overrides?.length ?? 0) > 0 && (
        <fieldset disabled={disabled}>
          <legend>Reminder overrides</legend>
          {value.overrides?.map((rule, index) => (
            <div className="calendar-field-pair" key={index}>
              <label>
                Method
                <select
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
                </select>
              </label>
              <label>
                Minutes before
                <input
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
              <button
                type="button"
                onClick={() =>
                  onChange({ ...value, overrides: value.overrides?.filter((_, i) => i !== index) })
                }
              >
                Remove reminder
              </button>
            </div>
          ))}
          <button
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
          </button>
        </fieldset>
      )}
    </>
  );
}
