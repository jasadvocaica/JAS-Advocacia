import { useQuery } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { montarEquipe, type PessoaEscritorio } from "./logic";

/**
 * Equipe ativa, ponto de hoje e itens da Controladoria até 7 dias.
 * Só leitura — a página é exclusiva do gestor e respeita o RLS.
 */
export function useEscritorioData(gestor: { id: string; nome: string } | null) {
  return useQuery<PessoaEscritorio[]>({
    queryKey: ["escritorio-virtual", gestor?.id],
    enabled: !!gestor,
    refetchInterval: 60 * 1000,
    queryFn: async () => {
      const agora = new Date();
      const hojeISO = format(agora, "yyyy-MM-dd");
      const [rMembros, rPonto, rItens] = await Promise.all([
        supabase.from("equipe_membros").select("id, nome, cargo, user_id").eq("status", "ativo"),
        supabase
          .from("gp_ponto_registros")
          .select("membro_id, entrada, saida_almoco, retorno_almoco, saida")
          .eq("data", hojeISO),
        supabase
          .from("controladoria_itens")
          .select("id, titulo, tipo, data_vencimento, responsavel_id")
          .not("status", "in", "(concluido,cancelado)")
          .lt("data_vencimento", format(addDays(agora, 8), "yyyy-MM-dd"))
          .order("data_vencimento", { ascending: true }),
      ]);
      const erro = rMembros.error ?? rPonto.error ?? rItens.error;
      if (erro) throw new Error(erro.message);

      const membros = (rMembros.data ?? []) as any[];
      const userIds = Array.from(new Set([...membros.map((m) => m.user_id), gestor?.id].filter(Boolean))) as string[];
      const emails: Record<string, string> = {};
      if (userIds.length) {
        const { data: perfis } = await supabase.from("profiles").select("id, email").in("id", userIds);
        (perfis ?? []).forEach((p: any) => { if (p.email) emails[p.id] = p.email; });
      }

      return montarEquipe({
        membros,
        ponto: (rPonto.data ?? []) as any[],
        itens: (rItens.data ?? []) as any[],
        emails,
        gestor,
        hojeISO,
      });
    },
  });
}
