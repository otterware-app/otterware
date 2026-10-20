import { useState, type ReactNode } from "react";
import { Button } from "~/components/ui/button";
import {
  Dialog as Root,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  DialogFooter,
} from "~/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
} from "~/components/ui/select";
import { toastManager } from "~/components/ui/toast";
export { Button } from "~/components/ui/button";
export { Input } from "~/components/ui/input";
export const toast = {
  success: (title: string, options?: { description?: string }) =>
    toastManager.add({ type: "success", title, ...options }),
  error: (title: string, options?: { description?: string }) =>
    toastManager.add({ type: "error", title, ...options }),
};
export function Field({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {description ? <span className="text-xs text-muted-foreground">{description}</span> : null}
    </label>
  );
}
export function RowSelect({
  value,
  options,
  onValueChange,
  ariaLabel,
}: {
  value: string;
  options: readonly { value: string; label: string }[];
  onValueChange: (value: string) => void;
  ariaLabel?: string;
  variant?: string;
}) {
  return (
    <Select
      value={value}
      items={options}
      onValueChange={(next) => {
        if (typeof next === "string") onValueChange(next);
      }}
    >
      <SelectTrigger aria-label={ariaLabel} size="sm">
        <SelectValue />
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
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  onConfirm,
  confirmLabel,
  confirmDisabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  onConfirm: () => Promise<void>;
  confirmLabel: ReactNode;
  confirmDisabled?: boolean;
  size?: string;
}) {
  const [pending, setPending] = useState(false);
  const confirm = async () => {
    if (pending || confirmDisabled) return;
    setPending(true);
    const result = await onConfirm().then(
      () => true,
      () => false,
    );
    setPending(false);
    if (result) onOpenChange(false);
  };
  return (
    <Root
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogPanel>{children}</DialogPanel>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={pending || confirmDisabled} onClick={() => void confirm()}>
            {pending ? "Checking…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Root>
  );
}
