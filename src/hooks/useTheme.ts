import { useEffect, useState, useCallback } from "react";

export type Tema = "light";
const KEY = "app:tema";

function aplicar(t: Tema) {
  const root = document.documentElement;
  root.classList.remove("dark");
}

function inicial(): Tema {\n  return "light";\n}

/**
 * Gerencia o tema claro/escuro. Persiste em localStorage e respeita
 * a preferência do sistema na primeira visita.
 */
export function useTheme() {
  const [tema, setTemaState] = useState<Tema>(() => {
    if (typeof window === "undefined") return "light";
    const t = inicial();
    aplicar(t);
    return t;
  });

  const setTema = useCallback((t: Tema) => {
    setTemaState(t);
    aplicar(t);
    try { localStorage.setItem(KEY, t); } catch {}
  }, []);

  const toggle = useCallback(() => {
    setTema(tema === "dark" ? "light" : "dark");
  }, [tema, setTema]);

  useEffect(() => { aplicar(tema); }, [tema]);

  return { tema, setTema, toggle };
}
