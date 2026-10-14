import type { ReactNode } from "react";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
export function HintTooltip({
  label,
  hint,
  side = "top",
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  side?: "top" | "bottom" | "right" | "left";
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="contents" />}>{children}</TooltipTrigger>
      <TooltipPopup side={side}>
        {label}
        {hint ? <> · {hint}</> : null}
      </TooltipPopup>
    </Tooltip>
  );
}
export { Kbd } from "~/components/ui/kbd";
