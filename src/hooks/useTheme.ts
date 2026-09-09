import { useEffect, useState, useCallback } from "react";

export type Tema = "light";
const KEY = "app:tema";

function aplicar() {
  document.documentElement.classList.remove("dark");
}

function inicial(): Tema {
  return "light";
}

/**
 * Mantém a identidade visual oficial exclusivamente no modo claro.
 * A API do hook é preservada para compatibilidade com componentes existentes.
 */
export function useTheme() {
  const [tema, setTemaState] = useState<Tema>(() => {
    const t = inicial();
    if (typeof document !== "undefined") aplicar();
    return t;
  });

  const setTema = useCallback((_t: Tema) => {
    setTemaState("light");
    aplicar();
    try { localStorage.setItem(KEY, "light"); } catch {}
  }, []);

  const toggle = useCallback(() => setTema("light"), [setTema]);

  useEffect(() => {
    aplicar();
    try { localStorage.setItem(KEY, "light"); } catch {}
  }, [tema]);

  return { tema, setTema, toggle };
}
