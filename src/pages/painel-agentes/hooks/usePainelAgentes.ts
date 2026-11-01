import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AgentePainel, ItemAgente, StatusAgente } from "./types";
import type { CargoEquipe } from "@/pages/equipe/types";

/** Limite a partir do qual consideramos a carga de trabalho crítica. */
export const LIMITE_SOBRECARGA = 10;
/** Limite a partir do qual consideramos a pessoa com boa ocupação. */
export const LIMITE_ATIVO = 4;

function inicioDoDia(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function diasAte(iso: string, hoje: Date): number {
  const d = inicioDoDia(new Date(iso));
  return Math.round((d.getTime() - hoje.getTime()) / 86_400_000);
}

export function calcularStatus(params: {
  total: number;
  atrasados: number;
  altaPrioridade: number;
  statusMembro: AgentePainel["statusMembro"];
}): StatusAgente {
  const { total, atrasados, altaPrioridade, statusMembro } = params;
  if (statusMembro === "inativo" || statusMembro === "afastado") return "ausente";
  if (total === 0) return "ocioso";
  if (total >= LIMITE_SOBRECARGA || atrasados >= 3 || (atrasados >= 1 && altaPrioridade >= 3)) {
    return "sobrecarregado";
  }
  if (total >= LIMITE_ATIVO || atrasados > 0) return "ativo";
  return "tranquilo";
}

interface MembroRow {
  user_id: string | null;
  nome: string;
  cargo: CargoEquipe | null;
  status: AgentePainel["statusMembro"];
}

interface ProfileRow {
  id: string;
  nome: string | null;
  email: string | null;
  avatar_url: string | null;
  ativo: boolean | null;
}

/**
 * Consolida a carga de trabalho de toda a equipe a partir dos itens da
 * controladoria (tabela `controladoria_itens` + `controladoria_responsaveis`).
 */
export function usePainelAgentes() {
  const [agentes, setAgentes] = useState<AgentePainel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ultimaCarga, setUltimaCarga] = useState<Date | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [membrosRes, profilesRes, itensRes, respRes] = await Promise.all([
        supabase.from("equipe_membros").select("user_id, nome, cargo, status"),
        supabase.from("profiles").select("id, nome, email, avatar_url, ativo"),
        supabase
          .from("controladoria_itens")
          .select(
            `id, titulo, tipo, prioridade, status, data_vencimento,
             cliente:clientes(id, nome),
             processo:processos(id, numero_cnj)`,
          )
          .not("status", "in", "(concluido,cancelado)"),
        supabase.from("controladoria_responsaveis").select("item_id, user_id"),
      ]);

      const primeiroErro = membrosRes.error || profilesRes.error || itensRes.error || respRes.error;
      if (primeiroErro) throw new Error(primeiroErro.message);

      const membros = (membrosRes.data ?? []) as MembroRow[];
      const profiles = (profilesRes.data ?? []) as ProfileRow[];
      const itens = (itensRes.data ?? []) as unknown as ItemAgente[];
      const responsaveis = (respRes.data ?? []) as { item_id: string; user_id: string }[];

      const itemPorId = new Map(itens.map((i) => [i.id, i]));
      const itensPorUsuario = new Map<string, ItemAgente[]>();
      for (const r of responsaveis) {
        // Só conta itens que continuam em aberto.
        const item = itemPorId.get(r.item_id);
        if (!item) continue;
        const lista = itensPorUsuario.get(r.user_id) ?? [];
        // Evita duplicar caso a pessoa seja responsável por dois papéis no mesmo item.
        if (!lista.some((x) => x.id === item.id)) lista.push(item);
        itensPorUsuario.set(r.user_id, lista);
      }

      const membroPorUser = new Map<string, MembroRow>();
      for (const m of membros) if (m.user_id) membroPorUser.set(m.user_id, m);

      const hoje = inicioDoDia();
      const resultado: AgentePainel[] = [];

      for (const p of profiles) {
        const membro = membroPorUser.get(p.id);
        const meus = itensPorUsuario.get(p.id) ?? [];
        // Mostra a pessoa se está no quadro de equipe ou se tem demanda em aberto.
        if (!membro && meus.length === 0) continue;

        let atrasados = 0;
        let doDia = 0;
        let proximos7 = 0;
        let altaPrioridade = 0;
        let ultimo: string | null = null;

        for (const it of meus) {
          const dias = diasAte(it.data_vencimento, hoje);
          if (dias < 0) atrasados++;
          else if (dias === 0) doDia++;
          else if (dias <= 7) proximos7++;
          if (it.prioridade === "alta" || it.prioridade === "urgente") altaPrioridade++;
          if (!ultimo || new Date(it.data_vencimento) < new Date(ultimo)) ultimo = it.data_vencimento;
        }

        const statusMembro = membro?.status ?? (p.ativo === false ? "inativo" : "ativo");
        const carga = atrasados * 3 + doDia * 2 + meus.length;

        resultado.push({
          userId: p.id,
          nome: membro?.nome ?? p.nome ?? p.email ?? "Sem nome",
          email: p.email,
          cargo: membro?.cargo ?? null,
          avatarUrl: p.avatar_url,
          statusMembro,
          itens: meus.sort(
            (a, b) =>
              new Date(a.data_vencimento).getTime() - new Date(b.data_vencimento).getTime(),
          ),
          totalItens: meus.length,
          atrasados,
          hoje: doDia,
          proximos7,
          altaPrioridade,
          carga,
          status: calcularStatus({
            total: meus.length,
            atrasados,
            altaPrioridade,
            statusMembro,
          }),
          ultimoVencimento: ultimo,
        });
      }

      const ordem: Record<StatusAgente, number> = {
        sobrecarregado: 0,
        ativo: 1,
        tranquilo: 2,
        ocioso: 3,
        ausente: 4,
      };

      resultado.sort((a, b) => {
        const d = ordem[a.status] - ordem[b.status];
        if (d !== 0) return d;
        if (b.carga !== a.carga) return b.carga - a.carga;
        return a.nome.localeCompare(b.nome, "pt-BR");
      });

      setAgentes(resultado);
      setUltimaCarga(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar o painel.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const resumo = useMemo(() => {
    return {
      totalPessoas: agentes.filter((a) => a.status !== "ausente").length,
      totalItens: agentes.reduce((s, a) => s + a.totalItens, 0),
      atrasados: agentes.reduce((s, a) => s + a.atrasados, 0),
      hoje: agentes.reduce((s, a) => s + a.hoje, 0),
      proximos7: agentes.reduce((s, a) => s + a.proximos7, 0),
      sobrecarregados: agentes.filter((a) => a.status === "sobrecarregado").length,
      ociosos: agentes.filter((a) => a.status === "ocioso").length,
    };
  }, [agentes]);

  return { agentes, resumo, loading, error, ultimaCarga, recarregar: carregar };
}
