import { isValidElement, type ComponentProps, type ReactNode } from "react";
import {
  Popover as Root,
  PopoverTrigger as HostTrigger,
  PopoverPopup,
} from "~/components/ui/popover";
function Trigger({
  asChild,
  children,
  ...props
}: ComponentProps<typeof HostTrigger> & { asChild?: boolean | undefined }) {
  return (
    <HostTrigger
      {...props}
      {...(asChild && isValidElement(children) ? { render: children } : { children })}
    />
  );
}
function Portal({ children }: { children: ReactNode; container?: HTMLElement | undefined }) {
  return children;
}
function Content({
  children,
  className: _className,
  collisionPadding: _collisionPadding,
  onCloseAutoFocus: _onCloseAutoFocus,
  ...props
}: ComponentProps<typeof PopoverPopup> & {
  collisionPadding?: number | undefined;
  onCloseAutoFocus?: ((event: Event) => void) | undefined;
}) {
  return (
    <PopoverPopup {...props} padding="compact">
      {children}
    </PopoverPopup>
  );
}
export const Popover = { Root, Trigger, Portal, Content };
