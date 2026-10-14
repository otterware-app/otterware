import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
} from "~/components/ui/select";
export type SelectOption = { value: string; label: string };
export function RowSelect({
  value,
  onValueChange,
  options,
  placeholder,
  ariaLabel,
  id,
  disabled,
}: {
  value: string | undefined;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  ariaLabel?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
  variant?: "pill" | "field";
}) {
  return (
    <Select
      value={value ?? null}
      items={options}
      disabled={disabled}
      onValueChange={(value) => {
        if (typeof value === "string") onValueChange(value);
      }}
    >
      <SelectTrigger id={id} aria-label={ariaLabel} size="sm">
        <SelectValue placeholder={placeholder ?? "Select…"} />
      </SelectTrigger>
      <SelectPopup>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}
