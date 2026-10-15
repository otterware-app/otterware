import type { ComponentProps } from "react";
import {
  Select as HostSelect,
  SelectTrigger as HostTrigger,
  SelectPopup,
  SelectValue,
  SelectItem,
} from "~/components/ui/select";

/** Compatibility at the content boundary; the host owns select behavior and appearance. */
export function Select({
  onValueChange,
  ...props
}: Omit<ComponentProps<typeof HostSelect<string>>, "onValueChange"> & {
  onValueChange?: ((value: string) => void) | undefined;
}) {
  return (
    <HostSelect
      {...props}
      onValueChange={(value) => {
        if (value !== null) onValueChange?.(value);
      }}
    />
  );
}
export function SelectTrigger({
  size,
  variant,
  className,
  ...props
}: Omit<ComponentProps<typeof HostTrigger>, "size" | "variant"> & {
  size?: string | undefined;
  variant?: "pill" | undefined;
}) {
  return (
    <span className={typeof className === "string" ? className : undefined}>
      <HostTrigger {...props} size={size === "small" || variant === "pill" ? "sm" : "default"} />
    </span>
  );
}
export { SelectValue, SelectItem };
export const SelectContent = SelectPopup;
