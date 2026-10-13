import type { ReactNode } from "react";
import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "../../lib/theme";
import { IconButton } from "../../components/ui/button";
import { HintTooltip } from "../../components/ui/tooltip";
import { DriveMark, Wordmark } from "../top-bar";

/**
 * The pages before and around signing in (Otter Mail's setup): the window's
 * grain frame with the wordmark, and one inset panel around a centered
 * step.
 */
export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Under the step: a way back, a way elsewhere. */
  footer?: ReactNode;
}) {
  return (
    <div className="drive-surface-grain flex h-full flex-col bg-sidebar-surface text-foreground">
      <div className="flex h-(--drive-workspace-topbar-height) shrink-0 items-center justify-between px-4">
        <Wordmark />
        <ThemeToggle />
      </div>
      <div className="relative isolate mx-1 mb-1 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-(--drive-panel-edge) bg-canvas">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center px-6 py-10">
            <div className="flex w-full max-w-[22rem] flex-col items-center motion-safe:animate-[onboarding-in_360ms_var(--drive-ease-drawer)]">
              <DriveMark className="mb-6 size-14 rounded-[23%] shadow-[0_12px_32px_-12px_rgb(0_0_0/0.5)]" />
              <div className="mb-7 flex flex-col items-center gap-2 text-center text-balance">
                <h1 className="text-[28px] leading-9 font-medium tracking-[-0.015em] text-foreground">
                  {title}
                </h1>
                {description ? (
                  <p className="text-[15px] leading-6 text-muted-foreground">{description}</p>
                ) : null}
              </div>
              <div className="w-full">{children}</div>
              {footer ? (
                <div className="mt-6 text-center text-[13px] text-muted-foreground">{footer}</div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  if (!setTheme) return null;
  const dark = resolvedTheme === "dark";
  return (
    <HintTooltip label={dark ? "Light appearance" : "Dark appearance"} side="bottom">
      <IconButton
        label={dark ? "Use light theme" : "Use dark theme"}
        onClick={() => setTheme(dark ? "light" : "dark")}
      >
        {dark ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
      </IconButton>
    </HintTooltip>
  );
}
