import type { CSSProperties } from "react";

/**
 * A range with its value in a pill beside it, as Appearance's Motion slider
 * draws it (the `settings-slider` styles). Give it a row's `control`.
 */
export function SettingsSlider({
  id,
  ariaLabel,
  value,
  valueLabel,
  min,
  max,
  step,
  onValueChange,
  disabled,
}: {
  readonly id: string;
  readonly ariaLabel: string;
  readonly value: number;
  readonly valueLabel: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly onValueChange: (value: number) => void;
  readonly disabled?: boolean | undefined;
}) {
  const ratio = max === min ? 0 : (value - min) / (max - min);
  const style = {
    "--settings-slider-progress": `${ratio * 100}%`,
    "--settings-slider-fill-offset": `${0.5 - ratio}rem`,
  } as CSSProperties;
  return (
    <div className="flex w-full items-center gap-3 sm:w-52">
      <output
        className="min-w-16 rounded-md bg-muted px-2 py-1 text-center font-mono text-xs font-medium tabular-nums text-foreground"
        htmlFor={id}
      >
        {valueLabel}
      </output>
      <input
        aria-label={ariaLabel}
        className="settings-slider min-w-0 flex-1"
        id={id}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={style}
        type="range"
        onChange={(event) => {
          const next = Number(event.currentTarget.value);
          if (Number.isFinite(next)) onValueChange(next);
        }}
      />
    </div>
  );
}
