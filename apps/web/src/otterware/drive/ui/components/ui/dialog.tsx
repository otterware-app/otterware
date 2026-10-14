import * as React from "react";
import {
  Dialog as HostDialog,
  DialogPopup as HostDialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "~/components/ui/dialog";

import { cn } from "../../lib/utils";
import { Button } from "./button";

/**
 * Host modal dialog with a convenience API for Drive's confirmation flows. Two
 * ways to use it:
 *
 *  - Props mode: pass `title` (plus `onConfirm`, `confirmLabel`, …) and the
 *    body as children; the header and a Cancel / Confirm footer are built for
 *    you. A successful `onConfirm` closes the dialog; a Promise disables the
 *    buttons until it settles, and a rejection keeps the dialog open. Enter
 *    confirms (Cmd+Enter inside multi-line fields).
 *  - Composition: `<Dialog open onOpenChange>` + `<DialogContent>` with
 *    `DialogHeader` / `DialogTitle` / `DialogFooter` parts.
 */

type DialogSize = "small" | "medium" | "large" | "xl";

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  onConfirm?: () => void | Promise<void>;
  confirmLabel?: React.ReactNode;
  confirmVariant?: "accent" | "destructive";
  confirmDisabled?: boolean;
  /** While true, Cancel, Escape and outside clicks don't close it. */
  busy?: boolean;
  size?: DialogSize;
  children?: React.ReactNode;
};

function Dialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmLabel,
  confirmVariant = "accent",
  confirmDisabled,
  busy = false,
  size = "medium",
  children,
}: DialogProps) {
  const propsMode = title !== undefined || description !== undefined || onConfirm !== undefined;
  const [pending, setPending] = React.useState(false);
  const popupRef = React.useRef<HTMLDivElement>(null);
  const locked = busy || pending;

  if (!propsMode) {
    return (
      <HostDialog open={open} onOpenChange={onOpenChange}>
        {children}
      </HostDialog>
    );
  }

  const hasBody = children !== undefined && children !== null && children !== false;
  const canConfirm = onConfirm !== undefined && !confirmDisabled && !locked;

  const confirm = async () => {
    if (!onConfirm || !canConfirm) return;
    setPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // Stay open: the handler surfaces its own error.
    } finally {
      setPending(false);
    }
  };

  // Enter confirms, like the default button of a macOS sheet. Multi-line
  // fields keep Enter for newlines and confirm on Cmd/Ctrl+Enter instead;
  // other buttons keep Enter for themselves.
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" || event.defaultPrevented) return;
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    const target = event.target as HTMLElement;
    const multiline = target.closest('textarea, [contenteditable="true"]');
    const otherControl = target.closest("button, a[href], [role='button'], [role='option']");
    const modifier = event.metaKey || event.ctrlKey;
    if ((multiline || otherControl) && !modifier) return;
    event.preventDefault();
    void confirm();
  };

  return (
    <HostDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && locked) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        ref={popupRef}
        size={size}
        initialFocus={(): HTMLElement | boolean => {
          // A body with its own controls focuses the first one; a plain
          // confirmation focuses the default button, so Enter acts on it.
          const content = popupRef.current;
          const bodyControl = content?.querySelector<HTMLElement>(
            "[data-dialog-body] :is(input:not([hidden]), textarea, select, button, [tabindex]:not([tabindex='-1'])):not(:disabled)",
          );
          if (bodyControl) return bodyControl;
          return (
            content?.querySelector<HTMLElement>("[data-dialog-confirm]:not(:disabled)") ?? true
          );
        }}
      >
        <div className="flex min-h-0 flex-col" onKeyDown={onKeyDown}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          {hasBody ? (
            <div
              data-dialog-body=""
              className={cn(
                "flex max-h-[60vh] min-h-0 flex-col gap-3 overflow-y-auto px-6 text-sm leading-5 text-foreground",
                onConfirm ? "pb-1" : "pb-5",
              )}
            >
              {children}
            </div>
          ) : null}
          {onConfirm ? (
            <DialogFooter>
              <Button variant="outline" disabled={locked} onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                data-dialog-confirm=""
                variant={confirmVariant}
                disabled={!canConfirm}
                onClick={() => void confirm()}
              >
                {confirmLabel ?? "Done"}
              </Button>
            </DialogFooter>
          ) : null}
        </div>
      </DialogContent>
    </HostDialog>
  );
}

function DialogContent({
  size: _size,
  backdropClassName: _backdrop,
  ...props
}: React.ComponentProps<typeof HostDialogPopup> & {
  size?: DialogSize;
  backdropClassName?: string;
}) {
  return <HostDialogPopup {...props} />;
}
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  type DialogProps,
};
