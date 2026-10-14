import { ContextMenu as ContextPrimitive } from "@base-ui/react/context-menu";
import { isValidElement, type ComponentProps, type ReactNode } from "react";
import {
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuItem,
  MenuCheckboxItem,
  MenuSeparator,
  MenuGroup,
  MenuGroupLabel,
  MenuSub,
  MenuSubTrigger,
  MenuSubPopup,
  MenuShortcut,
} from "~/components/ui/menu";

export function DropdownMenu(props: ComponentProps<typeof Menu>) {
  return <Menu modal={false} {...props} />;
}
export function DropdownMenuTrigger({
  asChild,
  children,
  ...props
}: ComponentProps<typeof MenuTrigger> & { asChild?: boolean | undefined }) {
  return (
    <MenuTrigger
      {...props}
      {...(asChild && isValidElement(children) ? { render: children } : { children })}
    />
  );
}
export const DropdownMenuContent = MenuPopup;
type ItemProps = Omit<ComponentProps<typeof MenuItem>, "onSelect" | "color"> & {
  onSelect?: (() => void) | undefined;
  icon?: ReactNode;
  accelerator?: string | undefined;
  color?: "red" | undefined;
};
export function DropdownMenuItem({
  onSelect,
  icon,
  accelerator,
  color,
  children,
  className: _className,
  ...props
}: ItemProps) {
  return (
    <MenuItem {...props} variant={color === "red" ? "destructive" : "default"} onClick={onSelect}>
      {typeof icon === "string" ? null : icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {accelerator ? <MenuShortcut>{accelerator}</MenuShortcut> : null}
    </MenuItem>
  );
}
export function DropdownMenuCheckboxItem({
  onSelect,
  checked,
  className: _className,
  ...props
}: Omit<ComponentProps<typeof MenuCheckboxItem>, "checked" | "onSelect"> & {
  checked?: boolean | "indeterminate" | undefined;
  onSelect?: ((event: { preventDefault: () => void }) => void) | undefined;
}) {
  return <MenuCheckboxItem {...props} checked={checked === true} onClick={onSelect} />;
}
export const DropdownMenuSeparator = MenuSeparator;
export function DropdownMenuLabel(props: ComponentProps<typeof MenuGroupLabel>) {
  return (
    <MenuGroup>
      <MenuGroupLabel {...props} />
    </MenuGroup>
  );
}
export function DropdownMenuSub({
  label,
  trigger,
  inset,
  children,
}: {
  label: string;
  trigger?: ReactNode;
  inset?: boolean | undefined;
  children: ReactNode;
}) {
  return (
    <MenuSub>
      <MenuSubTrigger
        inset={inset ?? false}
        {...(isValidElement(trigger) ? { render: trigger } : {})}
      >
        {trigger ? null : label}
      </MenuSubTrigger>
      <MenuSubPopup>{children}</MenuSubPopup>
    </MenuSub>
  );
}
export function ContextMenu(props: ComponentProps<typeof ContextPrimitive.Root>) {
  return <ContextPrimitive.Root {...props} />;
}
export function ContextMenuTrigger({
  asChild,
  children,
  ...props
}: ComponentProps<typeof ContextPrimitive.Trigger> & { asChild?: boolean | undefined }) {
  return (
    <ContextPrimitive.Trigger
      {...props}
      {...(asChild && isValidElement(children) ? { render: children } : { children })}
    />
  );
}
// Base UI context menus share the host's Menu popup, items and submenus.
export const ContextMenuContent = MenuPopup;
export const ContextMenuSeparator = MenuSeparator;
export function ContextMenuSub(
  props: ComponentProps<typeof DropdownMenuSub> & { icon?: string | undefined },
) {
  return <DropdownMenuSub {...props} />;
}
