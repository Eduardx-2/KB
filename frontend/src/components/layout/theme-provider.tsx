"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

const ThemeContext = createContext<{
  theme: Theme;
  toggle: () => void;
}>({ theme: "light", toggle: () => {} });

function applyTheme(t: Theme) {
  document.documentElement.classList.toggle("dark", t === "dark");
  try { localStorage.setItem("kb-theme", t); } catch {}
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    try {
      const stored = localStorage.getItem("kb-theme") as Theme | null;
      const preferred = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      const initial = stored ?? preferred;
      setTheme(initial);
      applyTheme(initial);
    } catch {}
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      applyTheme(next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
