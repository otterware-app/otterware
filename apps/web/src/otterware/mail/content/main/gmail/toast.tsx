import { toastManager } from "~/components/ui/toast";
import type { ReactNode } from "react";
export type ToastId = ReturnType<typeof toastManager.add>;
type ToastType = "success" | "error" | "info" | "warning" | "loading";
export type ToastOptions = {
  description?: ReactNode | undefined;
  /** Auto-dismiss after this many ms; 0 keeps it until closed. */
  timeout?: number | undefined;
  /** A button on the toast (e.g. Undo). The toast closes when it's clicked. */
  action?: { label: ReactNode; onClick: () => void } | undefined;
  /** Runs when the toast is dismissed with its × button. */
  onClose?: (() => void) | undefined;
  /** Runs once the toast is gone, however it closed. */
  onRemove?: (() => void) | undefined;
};

/** The toast's button: closes the toast, then runs the action. Updates skip
    undefined keys, so "no action" is an explicit empty one. */
function actionPropsFor(id: () => ToastId, action: ToastOptions["action"]) {
  if (!action) return { children: null };
  return {
    children: action.label,
    onClick: () => {
      toastManager.close(id());
      action.onClick();
    },
  };
}

function show(type: ToastType | undefined, title: ReactNode, options: ToastOptions = {}): ToastId {
  const id: ToastId = toastManager.add({
    type,
    title,
    description: options.description,
    timeout: options.timeout,
    onClose: options.onClose,
    onRemove: options.onRemove,
    actionProps: actionPropsFor(() => id, options.action),
  });
  return id;
}

export const toast = Object.assign(
  (title: ReactNode, options?: ToastOptions) => show(undefined, title, options),
  {
    success: (title: ReactNode, options?: ToastOptions) => show("success", title, options),
    error: (title: ReactNode, options?: ToastOptions) => show("error", title, options),
    info: (title: ReactNode, options?: ToastOptions) => show("info", title, options),
    warning: (title: ReactNode, options?: ToastOptions) => show("warning", title, options),
    loading: (title: ReactNode, options?: ToastOptions) =>
      show("loading", title, { timeout: 0, ...options }),
    /** Replaces a toast's content in place (e.g. "Sending…" → "Sent"). */
    update: (
      id: ToastId,
      type: ToastType | undefined,
      title: ReactNode,
      options: ToastOptions = {},
    ) =>
      toastManager.update(id, {
        type,
        title,
        description: options.description,
        timeout: options.timeout ?? 5000,
        onClose: options.onClose,
        actionProps: actionPropsFor(() => id, options.action),
      }),
    close: (id?: ToastId) => toastManager.close(id),
  },
);
