import { useState, type ComponentProps, type ReactNode, type ReactElement } from "react";
import {
  Dialog as HostDialog,
  DialogPopup,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogClose,
  DialogPortal,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";

export { DialogHeader, DialogFooter, DialogTitle, DialogDescription, DialogClose };
type DialogProps = Omit<ComponentProps<typeof HostDialog>, "onOpenChange" | "children"> & {
  children?: ReactNode;
  onOpenChange?: ((open: boolean) => void) | undefined;
  trigger?: ReactElement | undefined;
  title?: ReactNode;
  hideTitle?: boolean | undefined;
  description?: ReactNode;
  onConfirm?: (() => void | Promise<void>) | undefined;
  confirmLabel?: ReactNode;
  confirmVariant?: "accent" | "destructive" | undefined;
  confirmDisabled?: boolean | undefined;
  destructiveAction?: { label: ReactNode; onClick: () => void | Promise<void> } | undefined;
  secondaryAction?: { label: ReactNode; onClick: () => void | Promise<void> } | undefined;
  size?: "small" | "medium" | "large" | "xl" | undefined;
};
/** Mail's confirm workflow composes the host dialog and controls. */
export function Dialog({
  open: controlled,
  defaultOpen,
  onOpenChange,
  trigger,
  title,
  hideTitle,
  description,
  onConfirm,
  confirmLabel,
  confirmVariant,
  confirmDisabled,
  destructiveAction,
  secondaryAction,
  size,
  children,
  ...props
}: DialogProps) {
  const [local, setLocal] = useState(defaultOpen ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = controlled ?? local;
  const change = (next: boolean) => {
    setLocal(next);
    onOpenChange?.(next);
  };
  const act = async (action: () => void | Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      change(false);
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  };
  const composed = title !== undefined || trigger !== undefined || onConfirm !== undefined;
  return (
    <HostDialog {...props} open={open} onOpenChange={change}>
      {trigger ? <DialogTrigger render={trigger} /> : null}
      {composed ? (
        <DialogContent size={size}>
          <DialogHeader>
            {title ? (
              <DialogTitle className={hideTitle ? "sr-only" : undefined}>{title}</DialogTitle>
            ) : null}
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <div className="space-y-4 px-6 py-4">
            {children}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            {destructiveAction ? (
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() => void act(destructiveAction.onClick)}
              >
                {destructiveAction.label}
              </Button>
            ) : null}
            {secondaryAction ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void act(secondaryAction.onClick)}
              >
                {secondaryAction.label}
              </Button>
            ) : null}
            <Button variant="outline" disabled={busy} onClick={() => change(false)}>
              Cancel
            </Button>
            {onConfirm ? (
              <Button
                variant={confirmVariant === "destructive" ? "destructive" : "default"}
                disabled={busy || confirmDisabled}
                onClick={() => void act(onConfirm)}
              >
                {confirmLabel ?? "Confirm"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      ) : (
        children
      )}
    </HostDialog>
  );
}
export function DialogContent({
  size: _size,
  showCloseButton: _showCloseButton,
  onOpenAutoFocus: _onOpen,
  onCloseAutoFocus: _onClose,
  ...props
}: ComponentProps<typeof DialogPopup> & {
  size?: string | undefined;
  showCloseButton?: boolean | undefined;
  onOpenAutoFocus?: ((event: Event) => void) | undefined;
  onCloseAutoFocus?: ((event: Event) => void) | undefined;
}) {
  return <DialogPopup {...props} />;
}
