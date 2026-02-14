import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light" | "system";

interface ThemeProviderContext {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  actualTheme: "dark" | "light";
}

const ThemeProviderContext = createContext<ThemeProviderContext | undefined>(
  undefined
);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}

// Safe localStorage helpers that never throw (WKWebView can restrict storage)
function safeGetItem(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSetItem(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* ignored */ }
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "dmi-theme",
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (safeGetItem(storageKey) as Theme) || defaultTheme
  );

  const [actualTheme, setActualTheme] = useState<"dark" | "light">("light");

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");

    let systemTheme = "light";
    if (theme === "system") {
      systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    } else {
      systemTheme = theme;
    }

    root.classList.add(systemTheme);
    setActualTheme(systemTheme as "dark" | "light");

    // Store theme preference
    safeSetItem(storageKey, theme);
  }, [theme, storageKey]);

  // Listen for system theme changes
  useEffect(() => {
    if (theme !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      const systemTheme = mediaQuery.matches ? "dark" : "light";
      const root = window.document.documentElement;
      root.classList.remove("light", "dark");
      root.classList.add(systemTheme);
      setActualTheme(systemTheme);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  const value = {
    theme,
    setTheme,
    actualTheme,
  };

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");

  return context;
};