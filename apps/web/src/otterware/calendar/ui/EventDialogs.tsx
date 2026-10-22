import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { useState, type ReactNode, type RefObject } from "react";
import type { CalendarChangeScope } from "@otterware/calendar-contracts";
import { isValidTimeZone } from "@otterware/calendar-contracts/time";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";

export function RecurringSaveDialog({
  surface,
  scope,
  onScope,
  scheduleChanged,
  busy,
  onCancel,
  onConfirm,
}: {
  surface: RefObject<HTMLElement | null> | undefined;
  scope: CalendarChangeScope;
  onScope: (scope: CalendarChangeScope) => void;
  scheduleChanged: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) onCancel();
      }}
    >
      <DialogPrimitive.Portal container={surface}>
        <div
          className={
            surface
              ? "absolute inset-0 z-[140] grid place-items-center p-4"
              : "fixed inset-0 z-[140] grid place-items-center p-4"
          }
        >
          <DialogPrimitive.Backdrop
            forceRender
            render={<div className="absolute inset-0 bg-black/30" />}
          />
          <DialogPrimitive.Popup
            render={
              <div className="relative grid w-80 max-w-full gap-4 rounded-xl bg-popover p-4 text-popover-foreground shadow-xl outline-none" />
            }
          >
            <DialogPrimitive.Title render={<h2 className="text-base font-semibold" />}>
              Edit recurring event
            </DialogPrimitive.Title>
            <DialogPrimitive.Description render={<p className="text-sm text-muted-foreground" />}>
              Apply changes to:
            </DialogPrimitive.Description>
            <fieldset className="grid gap-1" disabled={busy} aria-label="Apply changes to">
              {(
                [
                  ["this", "This event"],
                  ["following", "This and following events"],
                  ["all", "All events"],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className="flex min-h-8 items-center gap-2 text-sm has-disabled:text-muted-foreground"
                >
                  <input
                    type="radio"
                    name="recurring-save-scope"
                    value={value}
                    checked={scope === value}
                    disabled={value === "this" && scheduleChanged}
                    onChange={() => onScope(value)}
                    className="size-4 accent-primary"
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            {scheduleChanged && (
              <p className="text-xs text-muted-foreground">
                A repeating schedule change applies to future events or the whole series.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
                Cancel
              </Button>
              <Button type="button" size="sm" disabled={busy} onClick={onConfirm}>
                Save
              </Button>
            </div>
          </DialogPrimitive.Popup>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function EventActionDialog({
  surface,
  title,
  children,
  onCancel,
  busy = false,
}: {
  surface?: RefObject<HTMLElement | null> | undefined;
  title: string;
  children: ReactNode;
  onCancel: () => void;
  busy?: boolean;
}) {
  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) onCancel();
      }}
    >
      <DialogPrimitive.Portal container={surface}>
        <div
          className={
            surface
              ? "absolute inset-0 z-[140] grid place-items-center p-4"
              : "fixed inset-0 z-[140] grid place-items-center p-4"
          }
        >
          <DialogPrimitive.Backdrop render={<div className="absolute inset-0 bg-black/30" />} />
          <DialogPrimitive.Popup
            aria-describedby={undefined}
            render={
              <div className="relative grid w-80 max-w-full gap-4 rounded-xl bg-popover p-4 text-popover-foreground shadow-xl outline-none" />
            }
          >
            <DialogPrimitive.Title render={<h2 className="text-base font-semibold" />}>
              {title}
            </DialogPrimitive.Title>
            {children}
          </DialogPrimitive.Popup>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
export function ScopeChoices({
  scope,
  onChange,
  disabled,
}: {
  scope: CalendarChangeScope;
  onChange: (scope: CalendarChangeScope) => void;
  disabled: boolean;
}) {
  return (
    <fieldset className="grid gap-1" disabled={disabled} aria-label="Delete occurrences">
      {(
        [
          ["this", "This event"],
          ["following", "This and following events"],
          ["all", "All events"],
        ] as const
      ).map(([value, label]) => (
        <label key={value} className="flex min-h-8 items-center gap-2 text-sm">
          <input
            type="radio"
            name="delete-scope"
            checked={scope === value}
            onChange={() => onChange(value)}
            className="size-4 accent-primary"
          />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

export function EventTimeZone({
  value,
  onSave,
}: {
  value: string;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <>
      <Input
        aria-label="Event time zone"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        aria-invalid={!isValidTimeZone(draft)}
      />
      <Button
        type="button"
        size="sm"
        disabled={!isValidTimeZone(draft)}
        onClick={() => onSave(draft)}
      >
        Done
      </Button>
    </>
  );
}
