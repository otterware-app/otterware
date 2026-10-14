import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

/**
 * Light or dark follows the `dark` class on <html>. Inside the Otterware
 * shell the shell owns it (Settings › Appearance), so Drive only reads it;
 * the standalone app keeps its own choice (`DriveThemeProvider`).
 */

export type ThemeChoice = "system" | "light" | "dark";

interface ThemeControl {
  theme: ThemeChoice;
  setTheme: (theme: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeControl | null>(null);

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

const isDark = () => document.documentElement.classList.contains("dark");

/** `setTheme` is null where the surrounding app owns the theme. */
export function useTheme(): {
  theme: ThemeChoice | undefined;
  resolvedTheme: "light" | "dark";
  setTheme: ((theme: ThemeChoice) => void) | null;
} {
  const control = useContext(ThemeContext);
  const dark = useSyncExternalStore(subscribe, isDark, () => false);
  return {
    theme: control?.theme,
    resolvedTheme: dark ? "dark" : "light",
    setTheme: control?.setTheme ?? null,
  };
}

const STORAGE_KEY = "otterdrive-theme";

function readChoice(): ThemeChoice {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === "light" || saved === "dark" ? saved : "system";
}

/** The standalone app's theme: the saved choice, or the system's. */
export function DriveThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setChoice] = useState(readChoice);
  const control = useMemo(
    (): ThemeControl => ({
      theme,
      setTheme: (next) => {
        localStorage.setItem(STORAGE_KEY, next);
        setChoice(next);
      },
    }),
    [theme],
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      document.documentElement.classList.toggle(
        "dark",
        theme === "dark" || (theme === "system" && media.matches),
      );
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  return <ThemeContext value={control}>{children}</ThemeContext>;
}
