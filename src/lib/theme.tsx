import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";

/**
 * Theme system.
 * - Default: dark.
 * - Stored in localStorage("vitalis.theme") as "dark" | "light" | "system".
 * - The actual `.dark` / `.light` class is set on <html> by an inline
 *   script in index.html BEFORE React mounts so there is zero flicker.
 */

export type ThemeChoice = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

const STORAGE_KEY = "vitalis.theme";

function readStored(): ThemeChoice {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "dark" || v === "light" || v === "system") return v;
  } catch {
    /* ignore */
  }
  return "dark";
}

function resolve(choice: ThemeChoice): ResolvedTheme {
  if (choice === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return choice;
}

function apply(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.classList.toggle("light", resolved === "light");
  root.style.colorScheme = resolved;
}

type ThemeCtx = {
  theme: ThemeChoice;
  resolved: ResolvedTheme;
  setTheme: (t: ThemeChoice) => void;
  toggle: () => void;
};

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>(() => readStored());
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolve(readStored()));

  // Apply on change.
  useEffect(() => {
    const r = resolve(theme);
    setResolved(r);
    apply(r);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  // Track system changes only when the user picked "system".
  useEffect(() => {
    if (theme !== "system") return;
    const m = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const r: ResolvedTheme = m.matches ? "dark" : "light";
      setResolved(r);
      apply(r);
    };
    m.addEventListener("change", onChange);
    return () => m.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((t: ThemeChoice) => setThemeState(t), []);
  const toggle = useCallback(
    () => setThemeState((prev) => (resolve(prev) === "dark" ? "light" : "dark")),
    [],
  );

  return <Ctx.Provider value={{ theme, resolved, setTheme, toggle }}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTheme must be used inside <ThemeProvider>");
  return v;
}