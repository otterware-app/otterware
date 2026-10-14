import type { ComponentProps } from "react";
import { Button as HostButton } from "~/components/ui/button";
type ButtonProps = Omit<ComponentProps<typeof HostButton>, "variant"> & {
  variant?: ComponentProps<typeof HostButton>["variant"] | "accent";
};
export function Button({ variant = "outline", ...props }: ButtonProps) {
  return <HostButton variant={variant === "accent" ? "default" : variant} {...props} />;
}
export function IconButton({
  label,
  active,
  ...props
}: ComponentProps<"button"> & { label: string; active?: boolean }) {
  return (
    <HostButton
      aria-label={label}
      variant={active ? "secondary" : "ghost-muted"}
      size="icon-sm"
      {...props}
    />
  );
}
export type { ButtonProps };
