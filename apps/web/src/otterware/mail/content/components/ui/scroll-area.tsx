import { ScrollArea as HostScrollArea } from "~/components/ui/scroll-area";
import type { ScrollArea as Primitive } from "@base-ui/react/scroll-area";
export function ScrollArea({
  className,
  viewportClassName,
  contentClassName,
  children,
  ...props
}: Omit<Primitive.Viewport.Props, "className"> & {
  className?: string | undefined;
  viewportClassName?: string | undefined;
  contentClassName?: string | undefined;
}) {
  return (
    <HostScrollArea
      className={className}
      viewportProps={{ ...props, className: viewportClassName }}
    >
      {contentClassName ? <div className={contentClassName}>{children}</div> : children}
    </HostScrollArea>
  );
}
