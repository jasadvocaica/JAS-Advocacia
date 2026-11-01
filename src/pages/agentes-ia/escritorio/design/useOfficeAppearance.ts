import { useLayoutEffect, useState } from "react";
export type OfficeTheme = "light" | "dark";
export function readPreference(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
export function savePreference(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Preferência continua na sessão se o navegador bloquear armazenamento. */
  }
}
export function useOfficeAppearance() {
  const [theme, setTheme] = useState<OfficeTheme>(() =>
    readPreference("jas-office-theme", "light") === "dark" ? "dark" : "light",
  );
  const [reduceMotion, setReduceMotion] = useState(
    () => readPreference("jas-office-reduce-motion", "false") === "true",
  );
  useLayoutEffect(() => {
    const root = document.documentElement;
    const before = root.getAttribute("data-office-theme"),
      motion = root.getAttribute("data-office-reduce-motion"),
      dark = root.classList.contains("dark");
    return () => {
      if (before === null) root.removeAttribute("data-office-theme");
      else root.setAttribute("data-office-theme", before);
      if (motion === null) root.removeAttribute("data-office-reduce-motion");
      else root.setAttribute("data-office-reduce-motion", motion);
      root.classList.toggle("dark", dark);
    };
  }, []);
  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-office-theme", theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
    savePreference("jas-office-theme", theme);
  }, [theme]);
  useLayoutEffect(() => {
    document.documentElement.setAttribute(
      "data-office-reduce-motion",
      String(reduceMotion),
    );
    savePreference("jas-office-reduce-motion", String(reduceMotion));
  }, [reduceMotion]);
  return {
    theme,
    toggleTheme: () => setTheme((t) => (t === "light" ? "dark" : "light")),
    reduceMotion,
    setReduceMotion,
  };
}
