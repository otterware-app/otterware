import { CalendarDaysIcon } from "lucide-react";
import { Children, isValidElement, type ComponentProps } from "react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
} from "~/components/ui/select";

/** Native-shaped options let event fields share the host select. */
export function CalendarSelect({
  children,
  value,
  defaultValue,
  onChange,
  compact = false,
  iconOnly = false,
  ...props
}: ComponentProps<"select"> & { compact?: boolean; iconOnly?: boolean }) {
  const options: Array<{ value: string; label: string }> = [];
  function visit(nodes: React.ReactNode) {
    Children.forEach(nodes, (child) => {
      if (!isValidElement<{ value?: string | number; children?: React.ReactNode }>(child)) return;
      if (child.type === "option")
        options.push({
          value: String(child.props.value ?? ""),
          label: String(child.props.children ?? ""),
        });
      else visit(child.props.children);
    });
  }
  visit(children);
  return (
    <Select
      value={String(value ?? defaultValue ?? "")}
      onValueChange={(next) => {
        if (next !== null)
          onChange?.({
            target: { value: String(next) },
            currentTarget: { value: String(next) },
          } as React.ChangeEvent<HTMLSelectElement>);
      }}
      disabled={props.disabled}
    >
      <SelectTrigger
        aria-label={props["aria-label"] ?? props.name}
        title={
          iconOnly
            ? options.find((option) => option.value === String(value ?? defaultValue ?? ""))?.label
            : undefined
        }
        variant={compact ? "ghost" : "default"}
        size={compact ? "sm" : "default"}
      >
        <SelectValue>
          {iconOnly ? (
            <CalendarDaysIcon />
          ) : (
            options.find((option) => option.value === String(value ?? defaultValue ?? ""))?.label
          )}
        </SelectValue>
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
