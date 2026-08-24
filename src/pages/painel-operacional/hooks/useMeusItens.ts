import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePreviewMode } from "@/contexts/PreviewModeContext";

export interface MeuItem {
  id: string;
  titulo: string;
  tipo: string;
  prioridade: string;
  status: string;
  data_vencimento: string;
  descricao: string | null;
  local: string | null;
  link_virtual: string | null;
  criado_por: string | null;
  criador_nome?: string | null;
  cliente: { id: string; nome: string } | null;
  processo: { id: string; numero_cnj: string | null; area_direito: string | null } | null;
}

export function ordenarPorUrgencia<T extends { data_vencimento: string }>(itens: T[]): T[] {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return [...itens].sort((a, b) => {
    const da = new Date(a.data_vencimento);
    const db = new Date(b.data_vencimento);
    const aA = da < hoje;
    const aB = db < hoje;
    if (aA && !aB) return -1;
    if (!aA && aB) return 1;
    return da.getTime() - db.getTime();
  });
}

export function useMeusItens() {
  const { profile, isGestor } = useAuth();
  const { preview } = usePreviewMode();
  // Em modo preview de estagiária, o gestor enxerga os itens daquela usuária.
  const userId = useMemo(() => {
    if (isGestor && preview?.tipo === "estagiaria" && preview.id) return preview.id;
    return profile?.id;
  }, [isGestor, preview, profile?.id]);
  const [itens, setItens] = useState<MeuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ultimaCarga, setUltimaCarga] = useState<Date | null>(null);

  const carregar = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    const selectItens = `id, titulo, tipo, prioridade, status, data_vencimento, descricao, local, link_virtual, criado_por,
         processo:processos(id, numero_cnj, area_direito),
         cliente:clientes(id, nome)`;

    const { data: responsaveis } = await supabase
      .from("controladoria_responsaveis")
      .select("item_id")
      .eq("user_id", userId);
    const itemIdsApoio = Array.from(new Set(((responsaveis ?? []) as any[]).map((r) => r.item_id).filter(Boolean)));

    const { data: principais, error: err } = await supabase
      .from("controladoria_itens")
      .select(selectItens)
      .eq("responsavel_id", userId)
      .not("status", "in", "(concluido,cancelado)")
      .order("data_vencimento", { ascending: true });

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    let apoio: any[] = [];
    if (itemIdsApoio.length) {
      const { data: itensApoio, error: apoioErr } = await supabase
        .from("controladoria_itens")
        .select(selectItens)
        .in("id", itemIdsApoio)
        .not("status", "in", "(concluido,cancelado)")
        .order("data_vencimento", { ascending: true });
      if (apoioErr) {
        setError(apoioErr.message);
        setLoading(false);
        return;
      }
      apoio = itensApoio ?? [];
    }

    const porId = new Map<string, MeuItem>();
    ([...(principais ?? []), ...apoio] as any[]).forEach((i) => porId.set(i.id, i as MeuItem));
    const lista = Array.from(porId.values());

    const criadoresIds = Array.from(
      new Set(lista.map((i) => i.criado_por).filter(Boolean) as string[])
    );
    if (criadoresIds.length) {
      const { data: membros } = await supabase
        .from("equipe_membros")
        .select("user_id, nome")
        .in("user_id", criadoresIds);
      const mapa = new Map((membros ?? []).map((m: any) => [m.user_id, m.nome]));
      lista.forEach((i) => {
        i.criador_nome = i.criado_por ? mapa.get(i.criado_por) ?? null : null;
      });
    }

    setItens(ordenarPorUrgencia(lista));
    setUltimaCarga(new Date());
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`painel-op-${userId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "controladoria_itens", filter: `responsavel_id=eq.${userId}` },
        () => void carregar()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [userId, carregar]);

  return { itens, loading, error, ultimaCarga, recarregar: carregar };
}
