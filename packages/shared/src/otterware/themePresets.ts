import type { ThemeColors, ThemeDefinition } from "../themePalettes.ts";

export const OTTERWARE_THEME_IDS = ["otter-mail"] as const;
/** Mail's former palette is selectable through the host theme system on every surface. */
export function otterwareThemePresets(
  light: ThemeColors,
  dark: ThemeColors,
): ReadonlyArray<ThemeDefinition> {
  return [
    {
      id: "otter-mail",
      label: "Otter Mail",
      appearance: "light",
      colors: {
        ...light,
        canvas: "#fcfcfc",
        chrome: "#fafafa",
        surface: "#ffffff",
        surfaceRaised: "#ffffff",
        text: "#27272a",
        textMuted: "#71717a",
        accent: "#2563eb",
        border: "#e4e4e7",
      },
      variants: {
        dark: {
          ...dark,
          canvas: "#0a0a0a",
          chrome: "#0a0a0a",
          surface: "#111111",
          surfaceRaised: "#171717",
          text: "#f5f5f5",
          textMuted: "#a3a3a3",
          accent: "#3b82f6",
          border: "#262626",
        },
      },
    },
  ];
}
