import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Button, type ButtonSize as HostButtonSize } from "~/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipPopup } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import type { KeybindingCommand } from "../keybindings/commands";
import { useShortcutLabel } from "../keybindings/store";
export { cn };
export type ButtonVariant = "primary" | "outline" | "ghost" | "ghost-muted" | "destructive";
export type ButtonSize = HostButtonSize;
export function restoreFocusForKeyboardOnly(_event: Event): void {}
export const Btn = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant | undefined;
    size?: ButtonSize | undefined;
  }
>(function Btn({ variant = "outline", size = "default", className: _className, ...props }, ref) {
  return (
    <Button
      ref={ref}
      variant={variant === "primary" ? "default" : variant}
      size={size}
      {...props}
    />
  );
});
export const IconBtn = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean | undefined }
>(function IconBtn({ label, active, className: _className, ...props }, ref) {
  return (
    <Button
      ref={ref}
      aria-label={label}
      variant={active ? "secondary" : "ghost-muted"}
      size="icon-sm"
      {...props}
    />
  );
});
export function HintTooltip({
  label = "",
  hint,
  shortcut,
  side = "top",
  children,
}: {
  label?: string | undefined;
  hint?: string | undefined;
  shortcut?: KeybindingCommand | undefined;
  side?: ("top" | "bottom" | "right") | undefined;
  children: ReactNode;
}) {
  const binding = useShortcutLabel(shortcut);
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="contents" />}>{children}</TooltipTrigger>
      <TooltipPopup side={side}>
        {label}
        {(hint ?? binding) ? ` · ${hint ?? binding}` : ""}
      </TooltipPopup>
    </Tooltip>
  );
}
function Kbd({ children, className }: { children: ReactNode; className?: string | undefined }) {
  return (
    <kbd
      className={cn(
        "pointer-events-none inline-flex h-5 min-w-5 select-none items-center justify-center gap-1 rounded-md bg-muted px-1 font-sans text-xs text-muted-foreground",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/** Unread count: a quiet tabular numeral, brightening on the selected row. */
function UnreadPill({ count, selected }: { count: number; selected?: boolean | undefined }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "ml-auto shrink-0 text-xs tabular-nums",
        selected ? "text-sidebar-foreground" : "text-muted-foreground/70",
      )}
    >
      {count > 999 ? "999+" : count}
    </span>
  );
}
