import type { ComponentProps, ReactNode } from "react";
import { ContextMenu as ContextPrimitive } from "@base-ui/react/context-menu";
import {
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuGroup,
  MenuItem,
  MenuCheckboxItem,
  MenuSeparator,
  MenuSub,
  MenuSubTrigger,
  MenuSubPopup,
} from "~/components/ui/menu";
export {
  Menu as DropdownMenu,
  MenuTrigger as DropdownMenuTrigger,
  MenuPopup as DropdownMenuContent,
  MenuGroup as DropdownMenuGroup,
  MenuSeparator as DropdownMenuSeparator,
};
type Extras = { icon?: ReactNode; accelerator?: string };
export function DropdownMenuItem({
  icon,
  accelerator,
  children,
  ...props
}: ComponentProps<typeof MenuItem> & Extras) {
  return (
    <MenuItem {...props}>
      {icon}
      {children}
      {accelerator ? <kbd className="ml-auto text-xs">{accelerator}</kbd> : null}
    </MenuItem>
  );
}
export function DropdownMenuCheckItem({
  icon,
  accelerator,
  children,
  ...props
}: ComponentProps<typeof MenuCheckboxItem> & Extras) {
  return (
    <MenuCheckboxItem {...props}>
      {icon}
      {children}
      {accelerator ? <kbd className="ml-auto text-xs">{accelerator}</kbd> : null}
    </MenuCheckboxItem>
  );
}
export function DropdownMenuLinkItem({
  href,
  target,
  rel,
  icon,
  accelerator,
  children,
  ...props
}: ComponentProps<typeof MenuItem> & Extras & { href: string; target?: string; rel?: string }) {
  return (
    <MenuItem render={<a href={href} target={target} rel={rel} />} {...props}>
      {icon}
      {children}
      {accelerator}
    </MenuItem>
  );
}
export function DropdownMenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-2 py-1 text-xs text-muted-foreground">{children}</div>;
}
export function DropdownMenuSub({
  label,
  icon,
  children,
}: {
  label: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <MenuSub>
      <MenuSubTrigger>
        {icon}
        {label}
      </MenuSubTrigger>
      <MenuSubPopup>{children}</MenuSubPopup>
    </MenuSub>
  );
}
export const ContextMenu = ContextPrimitive.Root;
export function ContextMenuTrigger(props: ComponentProps<typeof ContextPrimitive.Trigger>) {
  return <ContextPrimitive.Trigger {...props} />;
}
export const ContextMenuContent = MenuPopup;
