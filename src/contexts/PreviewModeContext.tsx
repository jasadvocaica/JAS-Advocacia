// PreviewMode: permite ao gestor visualizar os portais (parceiro/cliente)
// como se fosse o usuário daquele perfil, sem fazer logout.
// O modo fica salvo em sessionStorage para sobreviver a reloads/navegação,
// mas é local à aba — fechar a aba encerra o preview.
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";

export type PreviewTipo = "parceiro" | "cliente" | "estagiaria";

interface PreviewState {
  tipo: PreviewTipo;
  id: string;
  nome: string;
  /** Email do usuário simulado (usado no preview de estagiária para selecionar a view). */
  email?: string;
}

interface PreviewModeCtx {
  preview: PreviewState | null;
  iniciarPreview: (tipo: PreviewTipo, id: string, nome: string, email?: string) => void;
  sairPreview: () => void;
}

const STORAGE_KEY = "lovable:preview-portal";

const Ctx = createContext<PreviewModeCtx | null>(null);

export function PreviewModeProvider({ children }: { children: ReactNode }) {
  const [preview, setPreview] = useState<PreviewState | null>(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as PreviewState) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      if (preview) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(preview));
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, [preview]);

  const iniciarPreview = useCallback((tipo: PreviewTipo, id: string, nome: string, email?: string) => {
    setPreview({ tipo, id, nome, email });
  }, []);

  const sairPreview = useCallback(() => setPreview(null), []);

  return (
    <Ctx.Provider value={{ preview, iniciarPreview, sairPreview }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePreviewMode() {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePreviewMode deve ser usado dentro de PreviewModeProvider");
  return v;
}
