import { usePanelAnimationSettings } from "~/panelAnimations";
export function usePanelAnimationDurationMs() {
  const { active, durationMs } = usePanelAnimationSettings();
  return active ? durationMs : 0;
}
