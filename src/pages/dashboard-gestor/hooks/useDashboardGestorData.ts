import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// ---------- Tipos ----------

export interface ItemAtrasado {
  id: string;
  titulo: string;
  data_vencimento: string;
  status: string;
  cliente_nome: string | null;
  processo_cnj: string | null;
}

export interface MetricasGerais {
  casosAtivos: number;
  recebidoMes: number;
  qtdPagamentosMes: number;
  pendenteMes: number;
}

export interface FaturamentoMes {
  mes: string; // "2026-05"
  rotulo: string; // "Mai"
  valor: number;
  ehAtual: boolean;
}

export interface CarteiraArea {
  area: string;
  total: number;
  percentual: number;
}

export interface DesempenhoMembro {
  user_id: string;
  nome: string;
  concluidos: number;
  emAndamento: number;
  atrasadas: number;
  total: number;
  taxaCumprimento: number; // 0-100
}

export interface RevisaoItem {
  id: string;
  titulo: string;
  responsavel_nome: string | null;
  desde: string;
}

export interface ProtocoloItem {
  id: string;
  titulo: string;
  processo_cnj: string | null;
  responsavel_nome: string | null;
}

export interface SaudeEscritorio {
  score: number;
  componentes: {
    processosComTarefa: number;
    processosComArea: number;
    parcelasEmDia: number;
    prazosCumpridos: number;
  };
}

export interface HonorarioPendente {
  id: string;
  cliente: string;
  valor: number;
  data_vencimento: string;
}

export interface ParceiroAtivo {
  id: string;
  nome: string;
  oab: string | null;
  estado: string | null;
  tipo: string;
}

export interface DashboardGestorDados {
  itensAtrasados: ItemAtrasado[];
  metricas: MetricasGerais;
  faturamento6m: FaturamentoMes[];
  carteiraPorArea: CarteiraArea[];
  totalProcessosAtivos: number;
  equipe: DesempenhoMembro[];
  revisoesPendentes: RevisaoItem[];
  filaProtocolo: ProtocoloItem[];
  saude: SaudeEscritorio;
  honorariosPendentes: HonorarioPendente[];
  totalPendenteMes: number;
  parceiros: ParceiroAtivo[];
  totalEstadosParceiros: number;
}

// ---------- Helpers ----------

const STATUS_NAO_ATIVOS = ["Encerrado", "Arquivado", "encerrado", "arquivado"];

function ehAtivo(status: string | null | undefined) {
  if (!status) return true;
  return !STATUS_NAO_ATIVOS.some((s) => status.startsWith(s));
}

function inicioMes(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function fimMes(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
}
function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

// ---------- Hook ----------

const TTL_MS = 5 * 60 * 1000;

export function useDashboardGestorData() {
  const [dados, setDados] = useState<DashboardGestorDados | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ultimaCarga, setUltimaCarga] = useState<Date | null>(null);
  const cacheRef = useRef<{ ts: number; data: DashboardGestorDados } | null>(null);

  const carregar = useCallback(async (force = false) => {
    if (!force && cacheRef.current && Date.now() - cacheRef.current.ts < TTL_MS) {
      setDados(cacheRef.current.data);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const hoje = new Date();
      const ini = inicioMes(hoje);
      const fim = fimMes(hoje);

      // janela de 6 meses para faturamento
      const inicio6m = new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1);

      const [
        itensAtrasadosRes,
        processosRes,
        pagamentosMesRes,
        parcelasMesRes,
        pagamentos6mRes,
        controladoriaItensRes,
        equipeRes,
        revisoesRes,
        protocoloRes,
        parcelasEmDiaRes,
        topPendentesRes,
        parceirosRes,
      ] = await Promise.all([
        supabase
          .from("controladoria_itens")
          .select("id, titulo, data_vencimento, status, processo:processos(numero_cnj), cliente:clientes(nome)")
          .neq("status", "concluido")
          .or(`status.eq.atrasado,data_vencimento.lt.${hoje.toISOString()}`)
          .order("data_vencimento", { ascending: true })
          .limit(20),
        supabase
          .from("processos")
          .select("id, status, area_direito"),
        supabase
          .from("honorarios_pagamentos")
          .select("valor_recebido, data_pagamento")
          .gte("data_pagamento", isoDate(ini))
          .lte("data_pagamento", isoDate(fim)),
        supabase
          .from("honorarios_parcelas")
          .select("valor, data_vencimento, status")
          .eq("status", "pendente")
          .gte("data_vencimento", isoDate(ini))
          .lte("data_vencimento", isoDate(fim)),
        supabase
          .from("honorarios_pagamentos")
          .select("valor_recebido, data_pagamento")
          .gte("data_pagamento", isoDate(inicio6m)),
        supabase
          .from("controladoria_itens")
          .select("id, status, responsavel_id, processo_id, criado_em, data_vencimento, concluido_em")
          .gte("criado_em", inicioMes(hoje).toISOString()),
        supabase
          .from("equipe_membros")
          .select("user_id, nome, cargo, status")
          .eq("status", "ativo"),
        // Revisões: itens em coluna_kanban "revisao"
        supabase
          .from("controladoria_itens")
          .select("id, titulo, atualizado_em, responsavel_id")
          .in("coluna_kanban", ["revisao", "aguardando_revisao"])
          .order("atualizado_em", { ascending: true })
          .limit(10),
        // Protocolo: itens em coluna_kanban "protocolo"
        supabase
          .from("controladoria_itens")
          .select("id, titulo, responsavel_id, processo:processos(numero_cnj)")
          .in("coluna_kanban", ["protocolo", "aprovado_aguardando_protocolo"])
          .order("atualizado_em", { ascending: true })
          .limit(10),
        supabase
          .from("honorarios_parcelas")
          .select("status, data_vencimento")
          .lte("data_vencimento", isoDate(hoje)),
        supabase
          .from("honorarios_parcelas")
          .select("id, valor, data_vencimento, contrato:honorarios_contratos(cliente:clientes(nome))")
          .eq("status", "pendente")
          .gte("data_vencimento", isoDate(ini))
          .lte("data_vencimento", isoDate(fim))
          .order("valor", { ascending: false })
          .limit(5),
        supabase
          .from("parceiros")
          .select("id, nome, oab, oab_seccional, estado, tipo, ativo")
          .eq("ativo", true)
          .order("nome"),
      ]);

      const consultas = [
        itensAtrasadosRes,
        processosRes,
        pagamentosMesRes,
        parcelasMesRes,
        pagamentos6mRes,
        controladoriaItensRes,
        equipeRes,
        revisoesRes,
        protocoloRes,
        parcelasEmDiaRes,
        topPendentesRes,
        parceirosRes,
      ];
      const falha = consultas.find((resultado) => resultado.error)?.error;
      if (falha) {
        throw new Error(falha.message);
      }

      // ---------- Itens atrasados ----------
      const itensAtrasados: ItemAtrasado[] = (itensAtrasadosRes.data ?? []).map((i: any) => ({
        id: i.id,
        titulo: i.titulo,
        data_vencimento: i.data_vencimento,
        status: i.status,
        cliente_nome: i.cliente?.nome ?? null,
        processo_cnj: i.processo?.numero_cnj ?? null,
      })).slice(0, 5);

      // ---------- Processos ----------
      const processos = (processosRes.data ?? []) as Array<{ status: string; area_direito: string | null }>;
      const processosAtivos = processos.filter((p) => ehAtivo(p.status));
      const totalProcessosAtivos = processosAtivos.length;

      // Carteira por área
      const mapaArea = new Map<string, number>();
      for (const p of processosAtivos) {
        const a = p.area_direito?.trim() || "Não definido";
        mapaArea.set(a, (mapaArea.get(a) ?? 0) + 1);
      }
      const carteiraPorArea: CarteiraArea[] = Array.from(mapaArea.entries())
        .map(([area, total]) => ({
          area,
          total,
          percentual: totalProcessosAtivos ? (total / totalProcessosAtivos) * 100 : 0,
        }))
        .sort((a, b) => b.total - a.total);

      // ---------- Pagamentos do mês ----------
      const pagamentos = (pagamentosMesRes.data ?? []) as Array<{ valor_recebido: number; data_pagamento: string }>;
      const recebidoMes = pagamentos.reduce((s, p) => s + Number(p.valor_recebido || 0), 0);
      const qtdPagamentosMes = pagamentos.length;

      // Pendente do mês
      const parcelasMes = (parcelasMesRes.data ?? []) as Array<{ valor: number }>;
      const pendenteMes = parcelasMes.reduce((s, p) => s + Number(p.valor || 0), 0);

      // ---------- Faturamento 6 meses ----------
      const meses6: FaturamentoMes[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const rotulo = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
        meses6.push({ mes: chave, rotulo: rotulo[0].toUpperCase() + rotulo.slice(1), valor: 0, ehAtual: i === 0 });
      }
      for (const p of (pagamentos6mRes.data ?? []) as Array<{ valor_recebido: number; data_pagamento: string }>) {
        const k = p.data_pagamento.slice(0, 7);
        const m = meses6.find((x) => x.mes === k);
        if (m) m.valor += Number(p.valor_recebido || 0);
      }

      // ---------- Equipe ----------
      const ctrItens = (controladoriaItensRes.data ?? []) as Array<{
        responsavel_id: string | null;
        status: string;
        data_vencimento: string;
        concluido_em: string | null;
        processo_id: string | null;
      }>;
      const equipeMembros = (equipeRes.data ?? []) as Array<{ user_id: string; nome: string; cargo: string }>;
      const estagiarias = equipeMembros.filter((m) => m.cargo === "estagiario");
      const equipe: DesempenhoMembro[] = estagiarias.map((m) => {
        const itens = ctrItens.filter((i) => i.responsavel_id === m.user_id);
        const concluidos = itens.filter((i) => i.status === "concluido").length;
        const emAndamento = itens.filter((i) => i.status !== "concluido" && new Date(i.data_vencimento) >= hoje).length;
        const atrasadas = itens.filter((i) => i.status !== "concluido" && new Date(i.data_vencimento) < hoje).length;
        const total = itens.length;
        return {
          user_id: m.user_id,
          nome: m.nome,
          concluidos,
          emAndamento,
          atrasadas,
          total,
          taxaCumprimento: total ? Math.round((concluidos / total) * 100) : 0,
        };
      });

      // ---------- Revisões e Protocolo ----------
      const mapaNomeUser = new Map(equipeMembros.map((m) => [m.user_id, m.nome]));
      const revisoesPendentes: RevisaoItem[] = ((revisoesRes.data ?? []) as any[]).map((r) => ({
        id: r.id,
        titulo: r.titulo,
        responsavel_nome: r.responsavel_id ? mapaNomeUser.get(r.responsavel_id) ?? null : null,
        desde: r.atualizado_em,
      }));
      const filaProtocolo: ProtocoloItem[] = ((protocoloRes.data ?? []) as any[]).map((r) => ({
        id: r.id,
        titulo: r.titulo,
        processo_cnj: r.processo?.numero_cnj ?? null,
        responsavel_nome: r.responsavel_id ? mapaNomeUser.get(r.responsavel_id) ?? null : null,
      }));

      // ---------- Saúde ----------
      const totalProcessos = totalProcessosAtivos || 1;
      // Processos com pelo menos 1 item ativo na controladoria
      const processosComItens = new Set(
        ctrItens
          .filter((i) => i.status !== "concluido")
          .map((i) => i.processo_id)
          .filter(Boolean),
      );
      const processosComTarefa = Math.min(processosComItens.size, totalProcessos) / totalProcessos;
      const processosComArea = processosAtivos.filter((p) => p.area_direito && p.area_direito.trim()).length / totalProcessos;
      const parcelasVencidas = (parcelasEmDiaRes.data ?? []) as Array<{ status: string }>;
      const parcelasEmDia = parcelasVencidas.length
        ? parcelasVencidas.filter((p) => p.status === "pago").length / parcelasVencidas.length
        : 1;
      const prazosMes = ctrItens.filter((i) => i.status === "concluido");
      const prazosCumpridos = prazosMes.length
        ? prazosMes.filter((i) => i.concluido_em && new Date(i.concluido_em) <= new Date(i.data_vencimento)).length /
          prazosMes.length
        : 1;
      const score = Math.round(
        processosComTarefa * 25 + processosComArea * 25 + parcelasEmDia * 25 + prazosCumpridos * 25,
      );
      const saude: SaudeEscritorio = {
        score,
        componentes: {
          processosComTarefa: Math.round(processosComTarefa * 100),
          processosComArea: Math.round(processosComArea * 100),
          parcelasEmDia: Math.round(parcelasEmDia * 100),
          prazosCumpridos: Math.round(prazosCumpridos * 100),
        },
      };

      // ---------- Honorários pendentes top 5 ----------
      const honorariosPendentes: HonorarioPendente[] = ((topPendentesRes.data ?? []) as any[]).map((p) => ({
        id: p.id,
        cliente: p.contrato?.cliente?.nome ?? "—",
        valor: Number(p.valor),
        data_vencimento: p.data_vencimento,
      }));
      const totalPendenteMes = pendenteMes;

      // ---------- Parceiros ----------
      const parceiros: ParceiroAtivo[] = ((parceirosRes.data ?? []) as any[]).map((p) => ({
        id: p.id,
        nome: p.nome,
        oab: p.oab ?? (p.oab_seccional ? p.oab_seccional : null),
        estado: p.estado,
        tipo: p.tipo,
      }));
      const estadosUnicos = new Set(parceiros.map((p) => p.estado).filter(Boolean));

      const novo: DashboardGestorDados = {
        itensAtrasados,
        metricas: { casosAtivos: totalProcessosAtivos, recebidoMes, qtdPagamentosMes, pendenteMes },
        faturamento6m: meses6,
        carteiraPorArea,
        totalProcessosAtivos,
        equipe,
        revisoesPendentes,
        filaProtocolo,
        saude,
        honorariosPendentes,
        totalPendenteMes,
        parceiros,
        totalEstadosParceiros: estadosUnicos.size,
      };

      cacheRef.current = { ts: Date.now(), data: novo };
      setDados(novo);
      setUltimaCarga(new Date());
    } catch (e: any) {
      setError(e?.message ?? "Falha ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Realtime: atualiza alertas quando controladoria muda
  useEffect(() => {
    const ch = supabase
      .channel("dashboard-gestor-controladoria")
      .on("postgres_changes", { event: "*", schema: "public", table: "controladoria_itens" }, () => {
        carregar(true);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [carregar]);

  return { dados, loading, error, ultimaCarga, recarregar: () => carregar(true) };
}
