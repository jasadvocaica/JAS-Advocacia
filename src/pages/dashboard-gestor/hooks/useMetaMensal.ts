import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const SECAO = "dashboard_gestor";
const CHAVE = "meta_mensal_valor";
const DEFAULT_META = 18000;

export function useMetaMensal() {
  const [meta, setMeta] = useState<number>(DEFAULT_META);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("configuracoes_sistema")
      .select("valor")
      .eq("secao", SECAO)
      .eq("chave", CHAVE)
      .maybeSingle();
    const num = data?.valor ? Number(data.valor) : NaN;
    setMeta(Number.isFinite(num) && num > 0 ? num : DEFAULT_META);
    setLoading(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const salvar = useCallback(
    async (novo: number) => {
      const { error } = await supabase
        .from("configuracoes_sistema")
        .upsert(
          {
            secao: SECAO,
            chave: CHAVE,
            valor: String(novo),
            tipo: "numero",
            editavel_por: "gestor",
            publica: false,
            descricao: "Meta mensal de receita do escritório (R$)",
          },
          { onConflict: "secao,chave" },
        );
      if (error) {
        toast({ title: "Erro ao salvar meta", description: error.message, variant: "destructive" });
        return false;
      }
      setMeta(novo);
      toast({ title: "Meta mensal atualizada" });
      return true;
    },
    [],
  );

  return { meta, loading, salvar, recarregar: carregar };
}
