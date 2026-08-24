import { useEffect, useRef } from "react";
import { toast } from "sonner";

interface Options<T> {
  /** Quando false, não persiste nem restaura. Útil para diálogos fechados. */
  enabled?: boolean;
  /** Callback chamada uma vez ao montar se houver rascunho salvo. */
  onRestore?: (draft: T) => void;
  /** Predicado para decidir se vale a pena salvar (ex.: algum campo preenchido). */
  hasContent?: (values: T) => boolean;
  /** Mostrar toast "Rascunho recuperado". Default true. */
  showRestoreToast?: boolean;
}

/**
 * Auto-salva o objeto `values` em localStorage sob `key`, com:
 *  - debounce de 500ms para digitação
 *  - flush imediato em visibilitychange/blur/pagehide/beforeunload
 *  - restauração automática ao montar (chama onRestore)
 *  - função `clear()` para apagar após salvar com sucesso
 */
export function useFormDraft<T>(key: string, values: T, opts: Options<T> = {}) {
  const { enabled = true, onRestore, hasContent, showRestoreToast = true } = opts;
  const restoredRef = useRef(false);
  const valuesRef = useRef(values);
  valuesRef.current = values;

  // Restauração ao montar / quando enabled vira true
  useEffect(() => {
    if (!enabled || restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const draft = JSON.parse(raw) as T;
        onRestore?.(draft);
        if (showRestoreToast) {
          toast.info("Rascunho recuperado", {
            description: "Continuamos de onde você parou.",
          });
        }
      }
    } catch {
      // ignora rascunho corrompido
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);

  // Persistência (debounce + flush em eventos do navegador)
  useEffect(() => {
    if (!enabled) return;

    const persist = () => {
      try {
        const v = valuesRef.current;
        if (hasContent && !hasContent(v)) return;
        localStorage.setItem(key, JSON.stringify(v));
      } catch {
        // quota exceeded ou serialização falhou — ignora
      }
    };

    const t = setTimeout(persist, 500);

    const onVisibility = () => {
      if (document.visibilityState === "hidden") persist();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", persist);
    window.addEventListener("pagehide", persist);
    window.addEventListener("beforeunload", persist);

    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", persist);
      window.removeEventListener("pagehide", persist);
      window.removeEventListener("beforeunload", persist);
    };
  }, [enabled, key, values, hasContent]);

  const clear = () => {
    try {
      localStorage.removeItem(key);
    } catch {}
  };

  return { clear };
}
