import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

export interface SettingsTileOption<Value extends string> {
  readonly value: Value;
  readonly label: string;
  readonly description?: string;
  /** A miniature of the choice, drawn above its label. */
  readonly preview: ReactNode;
}

/**
 * Pick one of a few choices by its picture, with the look of Appearance's
 * light/dark/system tiles. Place it in a plain `SettingsSection` whose title
 * names the setting.
 */
export function SettingsTilePicker<Value extends string>({
  ariaLabel,
  options,
  value,
  onValueChange,
  disabled,
}: {
  readonly ariaLabel: string;
  readonly options: ReadonlyArray<SettingsTileOption<Value>>;
  readonly value: Value;
  readonly onValueChange: (value: Value) => void;
  readonly disabled?: boolean | undefined;
}) {
  return (
    <div className="@container">
      <div
        aria-label={ariaLabel}
        role="group"
        className={cn(
          "grid grid-cols-1 gap-3",
          options.length === 2 ? "@min-[24rem]:grid-cols-2" : "@min-[30rem]:grid-cols-3",
        )}
      >
        {options.map((option) => {
          const isActive = option.value === value;
          const descriptionId = `${ariaLabel}-${option.value}-description`
            .toLowerCase()
            .replaceAll(" ", "-");
          return (
            <button
              key={option.value}
              type="button"
              aria-label={option.label}
              aria-pressed={isActive}
              aria-describedby={option.description ? descriptionId : undefined}
              disabled={disabled}
              onClick={() => onValueChange(option.value)}
              className={cn(
                "flex cursor-pointer flex-col items-stretch gap-1 rounded-xl border p-2 text-left outline-none transition-colors focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-64",
                isActive
                  ? "border-transparent bg-accent/30"
                  : "border-border/70 bg-card/60 hover:bg-accent/10",
              )}
              style={isActive ? { boxShadow: "inset 0 0 0 1px var(--ring)" } : undefined}
            >
              <span
                aria-hidden="true"
                className="relative block h-28 w-full overflow-hidden rounded-lg border border-border/60 bg-background"
              >
                {option.preview}
              </span>
              <span
                className={cn(
                  "mt-1 px-1 text-sm font-medium",
                  isActive ? "text-foreground" : "text-foreground/80",
                )}
              >
                {option.label}
              </span>
              {option.description ? (
                <span
                  id={descriptionId}
                  className="mb-0.5 px-1 text-xs leading-relaxed text-muted-foreground"
                >
                  {option.description}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
