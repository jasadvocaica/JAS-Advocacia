import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePreviewMode } from "@/contexts/PreviewModeContext";

interface ParceiroInfo {
  id: string;
  nome: string;
  oab_completo: string | null;
  email: string | null;
  whatsapp: string | null;
  cidade: string | null;
  estado: string | null;
  especialidades: string[] | null;
}

export function usePortalParceiro() {
  const { user, loading: authLoading, isGestor } = useAuth();
  const { preview } = usePreviewMode();
  const [parceiro, setParceiro] = useState<ParceiroInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const previewAtivo = isGestor && preview?.tipo === "parceiro";
  const previewId = previewAtivo ? preview!.id : null;

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }

    (async () => {
      setLoading(true);
      const colunas = "id, nome, oab_completo, email, whatsapp, cidade, estado, especialidades";
      let query = supabase.from("parceiros").select(colunas);

      if (previewId) {
        // Gestor em modo visualização: busca o parceiro escolhido
        query = query.eq("id", previewId);
      } else {
        query = query.eq("email", user.email!).eq("portal_ativo", true).eq("ativo", true);
      }

      const { data, error } = await query.maybeSingle();
      if (error) setErro(error.message);
      setParceiro((data as ParceiroInfo | null) ?? null);
      setLoading(false);
    })();
  }, [user, authLoading, previewId]);

  return { parceiro, loading: loading || authLoading, erro };
}
