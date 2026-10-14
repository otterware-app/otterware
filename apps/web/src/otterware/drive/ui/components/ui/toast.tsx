import type { ReactNode } from "react";
import { toastManager } from "~/components/ui/toast";
type ToastOptions = {
  description?: ReactNode;
  timeout?: number;
  action?: { label: ReactNode; onClick: () => void };
  onClose?: () => void;
  onRemove?: () => void;
};
export type ToastId = ReturnType<typeof toastManager.add>;
type ToastType = "success" | "error" | "info" | "warning" | "loading";
const input = (type: ToastType | undefined, title: ReactNode, options: ToastOptions = {}) => ({
  type,
  title,
  description: options.description,
  timeout: options.timeout,
  data: { onClose: options.onClose },
  onRemove: options.onRemove,
  actionProps: options.action
    ? { children: options.action.label, onClick: options.action.onClick }
    : { children: null },
});
export const toast = Object.assign(
  (title: ReactNode, options?: ToastOptions) => toastManager.add(input(undefined, title, options)),
  {
    success: (title: ReactNode, options?: ToastOptions) =>
      toastManager.add(input("success", title, options)),
    error: (title: ReactNode, options?: ToastOptions) =>
      toastManager.add(input("error", title, options)),
    info: (title: ReactNode, options?: ToastOptions) =>
      toastManager.add(input("info", title, options)),
    warning: (title: ReactNode, options?: ToastOptions) =>
      toastManager.add(input("warning", title, options)),
    loading: (title: ReactNode, options?: ToastOptions) =>
      toastManager.add(input("loading", title, { timeout: 0, ...options })),
    update: (id: ToastId, type: ToastType | undefined, title: ReactNode, options?: ToastOptions) =>
      toastManager.update(id, input(type, title, options)),
    close: (id?: ToastId) => toastManager.close(id),
  },
);
export function ToastProvider({ children }: { children: ReactNode; visible?: boolean }) {
  return children;
}
