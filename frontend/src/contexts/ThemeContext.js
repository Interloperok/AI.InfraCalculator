import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * Light / dark / system theme provider.
 *
 * Persists the user's preference to localStorage under THEME_STORAGE_KEY and
 * applies `class="dark"` to <html> when the resolved theme is dark, so
 * Tailwind's `darkMode: "class"` strategy and our CSS variables both work.
 *
 * Three values:
 *   - "light"  — force light
 *   - "dark"   — force dark
 *   - "system" — follow `prefers-color-scheme` (default for first-time users)
 */
const THEME_STORAGE_KEY = "ai-calc:theme";
const VALID_THEMES = ["light", "dark", "system"];

const ThemeContext = createContext({
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => {},
});

const readStored = () => {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return VALID_THEMES.includes(stored) ? stored : "system";
  } catch {
    return "system";
  }
};

const systemPrefersDark = () => {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
};

const resolve = (theme) =>
  theme === "system" ? (systemPrefersDark() ? "dark" : "light") : theme;

export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState(() => readStored());
  const [resolvedTheme, setResolvedTheme] = useState(() => resolve(readStored()));

  // Apply class to <html> whenever resolved theme changes.
  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [resolvedTheme]);

  // React to system theme changes when user has chosen "system".
  useEffect(() => {
    if (theme !== "system" || !window.matchMedia) return undefined;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setResolvedTheme(systemPrefersDark() ? "dark" : "light");
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = useCallback((next) => {
    if (!VALID_THEMES.includes(next)) return;
    setThemeState(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* storage may be disabled — ignore */
    }
    setResolvedTheme(resolve(next));
  }, []);

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);
