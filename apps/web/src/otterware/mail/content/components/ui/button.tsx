import { Button as HostButton, type ButtonSize, type ButtonVariant } from "~/components/ui/button";
import type { ComponentProps } from "react";
export function Button({
  variant,
  size,
  ...props
}: Omit<ComponentProps<typeof HostButton>, "variant" | "size"> & {
  variant?: (ButtonVariant | "accent" | "plain") | undefined;
  size?: ButtonSize | "small" | undefined;
}) {
  return (
    <HostButton
      {...props}
      variant={
        variant === "accent" ? "default" : variant === "plain" ? "ghost" : (variant ?? "default")
      }
      size={size === "small" ? "sm" : (size ?? "default")}
    />
  );
}
