import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MapaBrasilClientes } from "@/components/dashboard/MapaBrasilClientes";
import { UF_NOMES } from "@/components/dashboard/brasil-uf-paths";
import {
  Users, Briefcase, AlertTriangle, Clock, DollarSign, CheckCircle2,
  TrendingUp, Calendar, ArrowRight, Cake, Activity, HandCoins, ListTodo,
  AlertOctagon, Sparkles, MapPin, Gavel, FileText, CircleDot,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell,
} from "recharts";

// --------------------------------------------------------------
// Tipos
// --------------------------------------------------------------
interface DashboardCards {
  clientes_ativos: number;
  processos_ativos: number;
  prazos_proximos_7d: number;
  prazos_vencidos: number;
  receita_mes: number;
  a_receber_mes: number;
  em_atraso: number;
  tarefas_abertas: number;
  tarefas_atrasadas: number;
  repasses_pendentes: number;
}

interface AlertaBloqueante {
  tipo: "prazo_vencido" | "prazo_amanha";
  titulo: string;
  subtitulo: string;
  link: string;
  gravidade: "critica" | "alta";
}

interface DesempenhoMembro {
  membro_id: string;
  nome: string;
  cargo: string;
  atingimento_pct: number;
}

const AREA_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--navy))",
  "hsl(var(--champagne))",
  "hsl(217 70% 62%)",
  "hsl(152 45% 45%)",
  "hsl(280 40% 60%)",
  "hsl(38 70% 58%)",
  "hsl(195 55% 52%)",
];

const TOOLTIP_STYLE = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 12,
  fontSize: 12,
  boxShadow: "0 4px 16px -8px hsl(215 30% 20% / 0.25)",
};

// --------------------------------------------------------------
// Página
// --------------------------------------------------------------
export default function Dashboard() {
  const { profile, isGestor, hasPermission, user, roles } = useAuth();
  // Redireciona estagiárias direto para o painel operacional
  if (!isGestor && roles.includes("estagiario")) {
    return <Navigate to="/painel-operacional" replace />;
  }
  const verFinanceiro = hasPermission("financeiro", "visualizar");
  const verEquipe = hasPermission("equipe", "visualizar");

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
  }, []);

  const primeiroNome = profile?.nome?.split(" ")[0] ?? "";

  return (
    <div className="space-y-8">
      {/* Cabeçalho editorial */}
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-champagne">
            {new Date().toLocaleDateString("pt-BR", {
              weekday: "long", day: "2-digit", month: "long", year: "numeric",
            })}
          </p>
          <h1 className="font-display text-3xl tracking-tight text-foreground sm:text-4xl">
            {greeting}, {primeiroNome}!
          </h1>
          <p className="text-sm text-muted-foreground">
            {isGestor
              ? "Aqui está o resumo do seu escritório hoje."
              : "Sua agenda e seus processos de hoje."}
          </p>
        </div>
        <div className="hidden h-px w-24 bg-gradient-to-r from-champagne to-transparent sm:block" />
      </header>

      {isGestor ? (
        <DashboardGestor verFinanceiro={verFinanceiro} verEquipe={verEquipe} />
      ) : (
        <DashboardOperacional userId={user?.id ?? ""} />
      )}
    </div>
  );
}

// =================================================================
// DASHBOARD GESTOR
// =================================================================
function DashboardGestor({ verFinanceiro, verEquipe }: { verFinanceiro: boolean; verEquipe: boolean }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cards, setCards] = useState<DashboardCards>({
    clientes_ativos: 0, processos_ativos: 0, prazos_proximos_7d: 0, prazos_vencidos: 0,
    receita_mes: 0, a_receber_mes: 0, em_atraso: 0,
    tarefas_abertas: 0, tarefas_atrasadas: 0, repasses_pendentes: 0,
  });
  const [alertas, setAlertas] = useState<AlertaBloqueante[]>([]);
  const [prazosSemana, setPrazosSemana] = useState<any[]>([]);
  const [tarefasAtrasadas, setTarefasAtrasadas] = useState<any[]>([]);
  const [agendaHoje, setAgendaHoje] = useState<any[]>([]);
  const [receitaHist, setReceitaHist] = useState<{ mes: string; realizado: number; previsto: number }[]>([]);
  const [areaData, setAreaData] = useState<{ area: string; total: number }[]>([]);
  const [desempenho, setDesempenho] = useState<DesempenhoMembro[]>([]);
  const [datajudHoje, setDatajudHoje] = useState<any[]>([]);
  const [aniversariantes, setAniversariantes] = useState<any[]>([]);
  const [repasses, setRepasses] = useState<{ parceiro: string; total: number }[]>([]);
  const [estadoData, setEstadoData] = useState<{ estado: string; total: number }[]>([]);

  useEffect(() => {
    let ativo = true;
    (async () => {
      const hoje = new Date();
      const hojeIso = hoje.toISOString().split("T")[0];
      const em7dias = new Date(hoje); em7dias.setDate(em7dias.getDate() + 7);
      const em7Iso = em7dias.toISOString().split("T")[0];
      const amanha = new Date(hoje); amanha.setDate(amanha.getDate() + 1);
      const amanhaIso = amanha.toISOString().split("T")[0];
      const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split("T")[0];
      const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split("T")[0];

      const queries: any[] = [
        // 0: processos ativos
        supabase.from("processos").select("id", { count: "exact", head: true })
          .not("status", "in", '("encerrado","arquivado")'),
        // 1: prazos próximos 7d
        supabase.from("controladoria_itens")
          .select("id, titulo, tipo, data_vencimento, prioridade, status, processos(numero_cnj), clientes(nome)")
          .in("tipo", ["prazo_fatal", "prazo_processual"])
          .neq("status", "concluido")
          .gte("data_vencimento", hojeIso)
          .lte("data_vencimento", em7Iso)
          .order("data_vencimento"),
        // 2: prazos vencidos
        supabase.from("controladoria_itens")
          .select("id, titulo, tipo, data_vencimento, prioridade, status, processos(numero_cnj), clientes(nome)")
          .in("tipo", ["prazo_fatal", "prazo_processual"])
          .neq("status", "concluido")
          .lt("data_vencimento", hojeIso)
          .order("data_vencimento"),
        // 3: tarefas abertas
        supabase.from("controladoria_itens").select("id", { count: "exact", head: true })
          .in("status", ["pendente", "em_andamento"]),
        // 4: tarefas atrasadas (qualquer tipo)
        supabase.from("controladoria_itens")
          .select("id, titulo, tipo, data_vencimento, prioridade, processos(numero_cnj), clientes(nome)")
          .in("status", ["pendente", "em_andamento"])
          .lt("data_vencimento", hojeIso)
          .order("data_vencimento")
          .limit(8),
        // 5: pagamentos do ano para gráfico
        verFinanceiro
          ? supabase.from("honorarios_pagamentos").select("valor_recebido, data_pagamento")
          : Promise.resolve({ data: [] }),
        // 6: parcelas do mês (a receber)
        verFinanceiro
          ? supabase.from("honorarios_parcelas").select("valor, status, data_vencimento")
          : Promise.resolve({ data: [] }),
        // 7: repasses pendentes
        verFinanceiro
          ? supabase.from("honorarios_repasses")
              .select("valor_repasse, parceiros(nome)")
              .eq("status", "pendente")
          : Promise.resolve({ data: [] }),
        // 8: processos por área
        supabase.from("processos").select("area_direito")
          .not("status", "in", '("encerrado","arquivado")'),
        // 9: desempenho equipe (mês atual)
        verEquipe
          ? supabase.from("equipe_desempenho")
              .select("membro_id, atingimento_geral_pct, equipe_membros(nome,cargo)")
              .eq("mes", hoje.getMonth() + 1)
              .eq("ano", hoje.getFullYear())
          : Promise.resolve({ data: [] }),
        // 10: andamentos DataJud hoje
        supabase.from("andamentos")
          .select("id, descricao, data, criado_em, processos(numero_cnj, clientes(nome))")
          .eq("fonte", "datajud")
          .gte("criado_em", hojeIso)
          .order("criado_em", { ascending: false })
          .limit(8),
        // 11: aniversariantes — buscamos clientes ativos (filtramos no cliente)
        supabase.from("clientes").select("id, nome, nascimento, estado").eq("ativo", true),
        // 12: agenda de hoje (compromissos reais da controladoria)
        supabase.from("controladoria_itens")
          .select("id, titulo, tipo, data_vencimento, status, prioridade, processos(numero_cnj), clientes(nome)")
          .neq("status", "concluido")
          .gte("data_vencimento", hojeIso)
          .lt("data_vencimento", amanhaIso)
          .order("data_vencimento")
          .limit(10),
      ];

      const [
        rProcAtivos, rPrazos7, rPrazosVenc, rTarefasAbertas, rTarefasAtrasadas,
        rPagamentos, rParcelas, rRepasses, rArea, rDesempenho, rDataJud, rClientes,
        rAgendaHoje,
      ] = await Promise.all(queries);

      if (!ativo) return;

      const resultados = [
        rProcAtivos, rPrazos7, rPrazosVenc, rTarefasAbertas, rTarefasAtrasadas,
        rPagamentos, rParcelas, rRepasses, rArea, rDesempenho, rDataJud, rClientes,
        rAgendaHoje,
      ];
      const falha = resultados.find((resultado) => resultado?.error)?.error;
      if (falha) {
        setLoadError(falha.message ?? "Não foi possível carregar o painel.");
        setLoading(false);
        return;
      }
      setLoadError(null);

      const pagamentos = (rPagamentos.data ?? []) as any[];
      const parcelas = (rParcelas.data ?? []) as any[];
      const repassesData = (rRepasses.data ?? []) as any[];

      const receitaMes = pagamentos
        .filter((p) => p.data_pagamento >= inicioMes && p.data_pagamento <= fimMes)
        .reduce((a, p) => a + Number(p.valor_recebido || 0), 0);

      const aReceberMes = parcelas
        .filter((p) => p.status === "pendente" && p.data_vencimento >= inicioMes && p.data_vencimento <= fimMes)
        .reduce((a, p) => a + Number(p.valor || 0), 0);

      const emAtraso = parcelas
        .filter((p) => p.status === "atrasado")
        .reduce((a, p) => a + Number(p.valor || 0), 0);

      const repassesTotal = repassesData.reduce((a, r) => a + Number(r.valor_repasse || 0), 0);

      setCards({
        clientes_ativos: (rClientes.data ?? []).length,
        processos_ativos: rProcAtivos.count ?? 0,
        prazos_proximos_7d: rPrazos7.data?.length ?? 0,
        prazos_vencidos: rPrazosVenc.data?.length ?? 0,
        receita_mes: receitaMes,
        a_receber_mes: aReceberMes,
        em_atraso: emAtraso,
        tarefas_abertas: rTarefasAbertas.count ?? 0,
        tarefas_atrasadas: (rTarefasAtrasadas.data ?? []).length,
        repasses_pendentes: repassesTotal,
      });

      // Alertas bloqueantes
      const alertasList: AlertaBloqueante[] = [];
      (rPrazosVenc.data ?? []).forEach((p: any) => {
        alertasList.push({
          tipo: "prazo_vencido",
          titulo: `Prazo vencido — ${p.processos?.numero_cnj ?? p.titulo}`,
          subtitulo: `${p.clientes?.nome ?? "Sem cliente"} • Venceu ${formatDate(p.data_vencimento)}`,
          link: `/controladoria`,
          gravidade: "critica",
        });
      });
      (rPrazos7.data ?? [])
        .filter((p: any) => p.data_vencimento <= amanhaIso)
        .forEach((p: any) => {
          alertasList.push({
            tipo: "prazo_amanha",
            titulo: `Prazo fatal próximo — ${p.processos?.numero_cnj ?? p.titulo}`,
            subtitulo: `${p.clientes?.nome ?? "Sem cliente"} • ${formatDate(p.data_vencimento)}`,
            link: `/controladoria`,
            gravidade: "alta",
          });
        });
      setAlertas(alertasList.slice(0, 5));

      setPrazosSemana((rPrazos7.data ?? []).slice(0, 8));
      setTarefasAtrasadas(rTarefasAtrasadas.data ?? []);
      setAgendaHoje(rAgendaHoje?.data ?? []);

      // Histórico receita 6 meses + 3 previstos
      const hist: { mes: string; realizado: number; previsto: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        const ini = d.toISOString().split("T")[0];
        const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split("T")[0];
        const realizado = pagamentos
          .filter((p) => p.data_pagamento >= ini && p.data_pagamento <= fim)
          .reduce((a, p) => a + Number(p.valor_recebido || 0), 0);
        hist.push({ mes: d.toLocaleDateString("pt-BR", { month: "short" }), realizado, previsto: 0 });
      }
      for (let i = 1; i <= 3; i++) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
        const ini = d.toISOString().split("T")[0];
        const fim = new Date(d.getFullYear(), d.getMonth() + i + 1, 0).toISOString().split("T")[0];
        const previsto = parcelas
          .filter((p) => p.status === "pendente" && p.data_vencimento >= ini && p.data_vencimento <= fim)
          .reduce((a, p) => a + Number(p.valor || 0), 0);
        hist.push({ mes: d.toLocaleDateString("pt-BR", { month: "short" }), realizado: 0, previsto });
      }
      setReceitaHist(hist);

      // Áreas
      const areaMap = new Map<string, number>();
      (rArea.data ?? []).forEach((p: any) => {
        const k = p.area_direito || "Não definido";
        areaMap.set(k, (areaMap.get(k) ?? 0) + 1);
      });
      setAreaData(Array.from(areaMap.entries())
        .map(([area, total]) => ({ area, total }))
        .sort((a, b) => b.total - a.total));

      // Desempenho
      setDesempenho((rDesempenho.data ?? []).map((d: any) => ({
        membro_id: d.membro_id,
        nome: d.equipe_membros?.nome ?? "—",
        cargo: d.equipe_membros?.cargo ?? "",
        atingimento_pct: Number(d.atingimento_geral_pct ?? 0),
      })));

      setDatajudHoje(rDataJud.data ?? []);

      // Aniversariantes da semana
      const semanaIni = new Date(hoje); semanaIni.setHours(0, 0, 0, 0);
      const semanaFim = new Date(hoje); semanaFim.setDate(semanaFim.getDate() + 7);
      const aniv = (rClientes.data ?? []).filter((c: any) => {
        if (!c.nascimento) return false;
        const [, mm, dd] = c.nascimento.split("-").map(Number);
        const aniversarioEsteAno = new Date(hoje.getFullYear(), mm - 1, dd);
        return aniversarioEsteAno >= semanaIni && aniversarioEsteAno <= semanaFim;
      });
      setAniversariantes(aniv.slice(0, 8));

      // Estados atendidos
      const estadoMap = new Map<string, number>();
      (rClientes.data ?? []).forEach((c: any) => {
        const uf = (c.estado || "").trim().toUpperCase();
        if (!uf) return;
        estadoMap.set(uf, (estadoMap.get(uf) ?? 0) + 1);
      });
      setEstadoData(Array.from(estadoMap.entries())
        .map(([estado, total]) => ({ estado, total }))
        .sort((a, b) => b.total - a.total));

      // Repasses agrupados por parceiro
      const grupos = new Map<string, number>();
      repassesData.forEach((r: any) => {
        const nome = r.parceiros?.nome ?? "Parceiro";
        grupos.set(nome, (grupos.get(nome) ?? 0) + Number(r.valor_repasse || 0));
      });
      setRepasses(Array.from(grupos.entries())
        .map(([parceiro, total]) => ({ parceiro, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 6));

      setLoading(false);
    })();
    return () => { ativo = false; };
  }, [verFinanceiro, verEquipe]);

  const totalArea = useMemo(() => areaData.reduce((s, a) => s + a.total, 0), [areaData]);
  const totalClientesUf = useMemo(() => estadoData.reduce((s, e) => s + e.total, 0), [estadoData]);

  if (loading) return <DashboardSkeleton />;

  if (loadError) {
    return (
      <Card className="border-destructive/30 bg-destructive/5 p-6 text-center shadow-none">
        <AlertTriangle className="mx-auto mb-3 h-7 w-7 text-destructive" />
        <h2 className="font-display text-lg text-foreground">Não foi possível carregar o painel</h2>
        <p className="mt-1 text-sm text-muted-foreground">{loadError}</p>
        <Button className="mt-4" variant="outline" onClick={() => window.location.reload()}>
          Tentar novamente
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {/* Alertas bloqueantes */}
      {alertas.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5 p-5 shadow-none">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertOctagon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <h3 className="font-display text-base text-destructive">
                {alertas.length} alerta{alertas.length > 1 ? "s" : ""} {alertas.length > 1 ? "exigem" : "exige"} sua atenção
              </h3>
              <div className="space-y-1">
                {alertas.map((a, i) => (
                  <Link key={i} to={a.link} className="group block">
                    <div className="flex items-center justify-between gap-3 rounded-xl p-2 transition-colors hover:bg-destructive/10">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium group-hover:text-destructive">{a.titulo}</p>
                        <p className="truncate text-xs text-muted-foreground">{a.subtitulo}</p>
                      </div>
                      <Badge variant={a.gravidade === "critica" ? "destructive" : "outline"} className="shrink-0">
                        {a.gravidade === "critica" ? "Crítico" : "Urgente"}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Faixa de KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          icon={Users} accent="primary" label="Clientes ativos"
          value={cards.clientes_ativos}
          hint={`${estadoData.length} UF${estadoData.length === 1 ? "" : "s"} atendidas`}
          to="/clientes"
        />
        <KpiCard
          icon={Briefcase} accent="navy" label="Processos ativos"
          value={cards.processos_ativos}
          hint={`${areaData.length} área${areaData.length === 1 ? "" : "s"} do direito`}
          to="/processos"
        />
        <KpiCard
          icon={ListTodo} accent={cards.tarefas_atrasadas > 0 ? "warning" : "primary"} label="Tarefas abertas"
          value={cards.tarefas_abertas}
          hint={cards.tarefas_atrasadas > 0 ? `${cards.tarefas_atrasadas} atrasada${cards.tarefas_atrasadas > 1 ? "s" : ""}` : "nenhuma atrasada"}
          tone={cards.tarefas_atrasadas > 0 ? "warning" : undefined}
          to="/controladoria"
        />
        <KpiCard
          icon={Clock} accent={cards.prazos_vencidos > 0 ? "destructive" : "warning"} label="Prazos próximos"
          value={cards.prazos_proximos_7d}
          hint={cards.prazos_vencidos > 0 ? `${cards.prazos_vencidos} vencido${cards.prazos_vencidos > 1 ? "s" : ""}` : "vencem em 7 dias"}
          tone={cards.prazos_vencidos > 0 ? "destructive" : undefined}
          to="/controladoria"
        />
        {verFinanceiro ? (
          <KpiCard
            icon={DollarSign} accent="success" label="Honorários a receber"
            value={formatBRL(cards.a_receber_mes)}
            hint={cards.em_atraso > 0 ? `${formatBRL(cards.em_atraso)} em atraso` : "sem valores em atraso"}
            tone={cards.em_atraso > 0 ? "destructive" : undefined}
            to="/financeiro"
          />
        ) : (
          <KpiCard
            icon={Calendar} accent="champagne" label="Compromissos hoje"
            value={agendaHoje.length}
            hint="itens da controladoria"
            to="/controladoria"
          />
        )}
      </div>

      {/* Bloco central: evolução • áreas • mapa */}
      <div className="grid gap-4 xl:grid-cols-12">
        {/* Evolução */}
        <Card className="p-5 shadow-none xl:col-span-5">
          <SectionTitle
            title={verFinanceiro ? "Evolução do faturamento" : "Volume por área"}
            subtitle={verFinanceiro ? "Realizado dos últimos 6 meses e previsto dos próximos 3" : "Processos ativos por área do direito"}
          />
          {verFinanceiro ? (
            <>
              <div className="mb-3 flex items-center gap-4 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-primary" /> Realizado
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-champagne" /> Previsto
                </span>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={receitaHist} barGap={3}>
                  <CartesianGrid strokeDasharray="2 6" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="mes" tickLine={false} axisLine={false} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis
                    tickLine={false} axisLine={false} width={52}
                    stroke="hsl(var(--muted-foreground))" fontSize={11}
                    tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted) / 0.5)" }}
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v: any, n: any) => [formatBRL(Number(v)), n === "realizado" ? "Realizado" : "Previsto"]}
                  />
                  <Bar dataKey="realizado" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} maxBarSize={26} />
                  <Bar dataKey="previsto" fill="hsl(var(--champagne))" radius={[6, 6, 0, 0]} maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>
            </>
          ) : areaData.length === 0 ? (
            <EmptyState message="Sem processos cadastrados." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={areaData.slice(0, 6)} layout="vertical" margin={{ left: 4, right: 16 }}>
                <CartesianGrid strokeDasharray="2 6" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis type="category" dataKey="area" width={96} tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <Tooltip cursor={{ fill: "hsl(var(--muted) / 0.5)" }} contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="total" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Donut por área */}
        <Card className="p-5 shadow-none xl:col-span-4">
          <SectionTitle title="Demandas por área" subtitle="Processos ativos" />
          {areaData.length === 0 ? (
            <EmptyState message="Sem processos cadastrados." />
          ) : (
            <>
              <div className="relative">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={areaData} dataKey="total" nameKey="area"
                      innerRadius={62} outerRadius={86} paddingAngle={2} stroke="none"
                    >
                      {areaData.map((_, i) => (
                        <Cell key={i} fill={AREA_COLORS[i % AREA_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-display text-3xl tabular-nums text-foreground">{totalArea}</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">processos</span>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {areaData.slice(0, 5).map((a, i) => {
                  const pct = totalArea > 0 ? Math.round((a.total / totalArea) * 100) : 0;
                  return (
                    <Link
                      key={a.area}
                      to={`/processos?area=${encodeURIComponent(a.area)}`}
                      className="flex items-center gap-2 rounded-lg px-1 py-1 text-xs transition-colors hover:bg-muted/60"
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: AREA_COLORS[i % AREA_COLORS.length] }} />
                      <span className="flex-1 truncate capitalize">{a.area}</span>
                      <span className="tabular-nums text-muted-foreground">{a.total} · {pct}%</span>
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </Card>

        {/* Mapa do Brasil */}
        <Card className="p-5 shadow-none xl:col-span-3">
          <SectionTitle title="Clientes pelo Brasil" subtitle="Distribuição por UF" />
          {estadoData.length === 0 ? (
            <EmptyState message="Nenhum cliente com UF cadastrada." />
          ) : (
            <>
              <MapaBrasilClientes
                dados={estadoData}
                onSelectUf={(uf) => navigate(`/clientes?uf=${uf}`)}
                className="mx-auto max-w-[320px]"
              />
              <div className="mt-4 space-y-2">
                {estadoData.slice(0, 5).map((e) => {
                  const pct = totalClientesUf > 0 ? Math.round((e.total / totalClientesUf) * 100) : 0;
                  return (
                    <div key={e.estado} className="flex items-center gap-2 text-xs">
                      <MapPin className="h-3 w-3 shrink-0 text-champagne" />
                      <span className="flex-1 truncate">{UF_NOMES[e.estado] ?? e.estado}</span>
                      <span className="tabular-nums text-muted-foreground">{e.total} · {pct}%</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Operação do dia: agenda • tarefas prioritárias • movimentações */}
      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="p-5 shadow-none xl:col-span-4">
          <SectionTitle title="Agenda de hoje" subtitle="Compromissos e prazos com vencimento hoje" link="/controladoria" />
          {agendaHoje.length === 0 ? (
            <EmptyState message="Nenhum compromisso para hoje." />
          ) : (
            <div className="relative space-y-3 pl-4">
              <span className="absolute bottom-2 left-1 top-2 w-px bg-border" />
              {agendaHoje.map((a: any) => (
                <Link key={a.id} to="/controladoria" className="group block">
                  <span className="absolute -ml-[19px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" />
                  <div className="rounded-xl px-2 py-1.5 transition-colors group-hover:bg-muted/60">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{a.titulo}</p>
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                        {new Date(a.data_vencimento).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      <span className="capitalize">{String(a.tipo).replace(/_/g, " ")}</span>
                      {a.clientes?.nome ? ` • ${a.clientes.nome}` : ""}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5 shadow-none xl:col-span-4">
          <SectionTitle title="Tarefas prioritárias" subtitle="Pendências com vencimento passado" link="/controladoria" />
          {tarefasAtrasadas.length === 0 ? (
            <EmptyState message="Nenhuma tarefa atrasada. Tudo em dia." />
          ) : (
            <div className="space-y-1.5">
              {tarefasAtrasadas.map((p: any) => {
                const diff = Math.floor((Date.now() - new Date(p.data_vencimento).getTime()) / 86400000);
                const grave = diff >= 3 || p.prioridade === "urgente";
                return (
                  <Link
                    key={p.id}
                    to="/controladoria"
                    className="flex items-center gap-3 rounded-xl border border-border/70 px-3 py-2.5 transition-colors hover:bg-muted/50"
                  >
                    <CircleDot className={cn("h-4 w-4 shrink-0", grave ? "text-destructive" : "text-warning")} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.titulo}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {p.clientes?.nome ?? "—"} • {p.processos?.numero_cnj ?? "—"}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "shrink-0 text-[10px]",
                        grave ? "border-destructive/40 text-destructive" : "border-warning/40 text-warning",
                      )}
                    >
                      {diff <= 0 ? "hoje" : `${diff}d`}
                    </Badge>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-5 shadow-none xl:col-span-4">
          <SectionTitle title="Prazos da semana" subtitle="Próximos 7 dias" link="/controladoria" />
          {prazosSemana.length === 0 ? (
            <EmptyState message="Nenhum prazo nos próximos 7 dias." />
          ) : (
            <div className="space-y-1.5">
              {prazosSemana.map((p: any) => {
                const diff = Math.ceil((new Date(p.data_vencimento).getTime() - Date.now()) / 86400000);
                return (
                  <Link
                    key={p.id}
                    to="/controladoria"
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted/60"
                  >
                    <span
                      className={cn(
                        "h-8 w-1 shrink-0 rounded-full",
                        diff <= 1 ? "bg-destructive" : diff <= 3 ? "bg-warning" : "bg-primary/50",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.titulo}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {p.clientes?.nome ?? "—"} • {p.processos?.numero_cnj ?? "—"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[11px] tabular-nums text-muted-foreground">{formatDate(p.data_vencimento)}</p>
                      <span className={cn("text-[10px] font-medium", diff <= 1 ? "text-destructive" : "text-muted-foreground")}>
                        {diff <= 0 ? "hoje" : `D-${diff}`}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Financeiro amplo */}
      {verFinanceiro && (
        <Card className="p-5 shadow-none">
          <SectionTitle title="Financeiro do mês" subtitle="Valores reais registrados no sistema" link="/financeiro" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MiniStat label="Recebido no mês" value={formatBRL(cards.receita_mes)} tone="success" icon={TrendingUp} />
            <MiniStat label="A receber" value={formatBRL(cards.a_receber_mes)} tone="neutral" icon={DollarSign} />
            <MiniStat label="Em atraso" value={formatBRL(cards.em_atraso)} tone={cards.em_atraso > 0 ? "destructive" : "neutral"} icon={AlertTriangle} />
            <MiniStat label="Repasses pendentes" value={formatBRL(cards.repasses_pendentes)} tone="champagne" icon={HandCoins} />
          </div>
        </Card>
      )}

      {/* Movimentações recentes */}
      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="p-5 shadow-none xl:col-span-8">
          <SectionTitle title="Movimentações recentes" subtitle="Andamentos DataJud detectados hoje" />
          {datajudHoje.length === 0 ? (
            <EmptyState message="Nenhum andamento novo hoje." />
          ) : (
            <ScrollArea className="h-[260px]">
              <div className="space-y-1 pr-3">
                {datajudHoje.map((a: any) => (
                  <div key={a.id} className="flex gap-3 rounded-xl p-2.5 transition-colors hover:bg-muted/50">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Gavel className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{a.descricao}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {a.processos?.numero_cnj ?? "—"} • {a.processos?.clientes?.nome ?? "—"}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {new Date(a.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </Card>

        <Card className="p-5 shadow-none xl:col-span-4">
          <SectionTitle title="Aniversariantes" subtitle="Clientes nesta semana" />
          {aniversariantes.length === 0 ? (
            <EmptyState message="Nenhum nesta semana." />
          ) : (
            <div className="space-y-1">
              {aniversariantes.map((c: any) => {
                const [, mm, dd] = c.nascimento.split("-").map(Number);
                return (
                  <Link key={c.id} to={`/clientes/${c.id}`} className="flex items-center gap-3 rounded-xl p-2 hover:bg-muted/60">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-champagne-soft text-[11px] font-semibold text-champagne">
                        {c.nome.split(" ").map((n: string) => n[0]).slice(0, 2).join("")}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1 truncate text-sm">{c.nome}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      <Cake className="mr-1 inline h-3 w-3 text-champagne" />
                      {String(dd).padStart(2, "0")}/{String(mm).padStart(2, "0")}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Seção secundária: equipe + repasses */}
      {(verEquipe || (verFinanceiro && repasses.length > 0)) && (
        <section className="space-y-4 border-t border-border pt-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Visão complementar
          </p>
          <div className="grid gap-4 xl:grid-cols-12">
            {verEquipe && (
              <Card className="p-5 shadow-none xl:col-span-8">
                <SectionTitle title="Desempenho da equipe" subtitle="Atingimento de metas — mês atual" link="/equipe" />
                {desempenho.length === 0 ? (
                  <EmptyState message="Sem dados de desempenho deste mês." />
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {desempenho.map((d) => (
                      <div key={d.membro_id} className="rounded-xl border border-border/70 p-3">
                        <div className="mb-2 flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                              {d.nome.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{d.nome}</p>
                            <p className="text-[10px] capitalize text-muted-foreground">{d.cargo}</p>
                          </div>
                        </div>
                        <Progress value={Math.min(d.atingimento_pct, 100)} className="h-1.5" />
                        <div className="mt-1.5 flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground">Atingimento</span>
                          <span
                            className={cn(
                              "text-xs font-semibold tabular-nums",
                              d.atingimento_pct >= 90 ? "text-success" :
                              d.atingimento_pct >= 70 ? "text-warning" : "text-destructive",
                            )}
                          >
                            {d.atingimento_pct.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {verFinanceiro && repasses.length > 0 && (
              <Card className="p-5 shadow-none xl:col-span-4">
                <SectionTitle title="Repasses pendentes" subtitle="Por parceiro" link="/financeiro/repasses" />
                <div className="space-y-1">
                  {repasses.map((r) => (
                    <div key={r.parceiro} className="flex items-center justify-between rounded-xl px-2 py-2 hover:bg-muted/60">
                      <span className="min-w-0 truncate text-sm">{r.parceiro}</span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">{formatBRL(r.total)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

// =================================================================
// DASHBOARD OPERACIONAL
// =================================================================
function DashboardOperacional({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true);
  const [tarefasHoje, setTarefasHoje] = useState<any[]>([]);
  const [prazosSemana, setPrazosSemana] = useState<any[]>([]);
  const [meusProcessos, setMeusProcessos] = useState<any[]>([]);

  useEffect(() => {
    if (!userId) return;
    let ativo = true;
    (async () => {
      const hoje = new Date();
      const hojeIso = hoje.toISOString().split("T")[0];
      const em7dias = new Date(hoje); em7dias.setDate(em7dias.getDate() + 7);
      const em7Iso = em7dias.toISOString().split("T")[0];

      // Itens onde sou responsável (controladoria_responsaveis) ou criador
      const respRes = await supabase.from("controladoria_responsaveis")
        .select("item_id")
        .eq("user_id", userId);
      const itemIds = (respRes.data ?? []).map((r) => r.item_id);

      const baseQuery = supabase.from("controladoria_itens")
        .select("id, titulo, tipo, data_vencimento, prioridade, status, processos(numero_cnj), clientes(nome)")
        .in("status", ["pendente", "em_andamento"]);

      const [hojeRes, semanaRes, processosRes] = await Promise.all([
        // Tarefas hoje (minhas)
        itemIds.length > 0
          ? baseQuery.in("id", itemIds).lte("data_vencimento", hojeIso + "T23:59:59").order("prioridade")
          : Promise.resolve({ data: [] }),
        // Prazos da semana (meus prazos fatais/processuais)
        itemIds.length > 0
          ? supabase.from("controladoria_itens")
              .select("id, titulo, tipo, data_vencimento, prioridade, status, processos(numero_cnj), clientes(nome)")
              .in("id", itemIds)
              .in("tipo", ["prazo_fatal", "prazo_processual"])
              .neq("status", "concluido")
              .gte("data_vencimento", hojeIso)
              .lte("data_vencimento", em7Iso)
              .order("data_vencimento")
          : Promise.resolve({ data: [] }),
        // Meus processos
        supabase.from("processos")
          .select("id, numero_cnj, area_direito, status, atualizado_em, clientes(nome)")
          .eq("responsavel_id", userId)
          .not("status", "in", '("encerrado","arquivado")')
          .order("atualizado_em", { ascending: false })
          .limit(10),
      ]);

      if (!ativo) return;
      setTarefasHoje(hojeRes.data ?? []);
      setPrazosSemana(semanaRes.data ?? []);
      setMeusProcessos(processosRes.data ?? []);
      setLoading(false);
    })();
    return () => { ativo = false; };
  }, [userId]);

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-primary/5 p-4 shadow-none">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-champagne-soft text-champagne">
            <Sparkles className="h-4 w-4" />
          </span>
          <p className="text-sm">
            Você tem <strong className="text-primary">{tarefasHoje.length}</strong> tarefa{tarefasHoje.length !== 1 ? "s" : ""} para hoje
            {prazosSemana.length > 0 && (
              <> e <strong className="text-warning">{prazosSemana.length}</strong> prazo{prazosSemana.length > 1 ? "s" : ""} esta semana</>
            )}.
          </p>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5 shadow-none">
          <SectionTitle
            title="Minhas tarefas de hoje"
            subtitle={`${tarefasHoje.length} pendente${tarefasHoje.length !== 1 ? "s" : ""}`}
            link="/controladoria"
          />
          {tarefasHoje.length === 0 ? (
            <EmptyState message="Tudo em dia! Nenhuma tarefa para hoje." />
          ) : (
            <div className="space-y-1.5">
              {tarefasHoje.map((t: any) => (
                <Link
                  key={t.id}
                  to="/controladoria"
                  className="flex items-center gap-3 rounded-xl border border-border/70 px-3 py-2.5 transition-colors hover:bg-muted/50"
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.titulo}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t.clientes?.nome ?? "—"} • {t.processos?.numero_cnj ?? "—"}
                    </p>
                  </div>
                  <Badge
                    variant={t.prioridade === "alta" || t.prioridade === "urgente" ? "destructive" : "outline"}
                    className="text-[10px]"
                  >
                    {t.prioridade}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5 shadow-none">
          <SectionTitle title="Meus prazos da semana" subtitle="Próximos 7 dias" link="/controladoria" />
          {prazosSemana.length === 0 ? (
            <EmptyState message="Sem prazos esta semana." />
          ) : (
            <div className="space-y-1.5">
              {prazosSemana.map((p: any) => {
                const diff = Math.ceil((new Date(p.data_vencimento).getTime() - Date.now()) / 86400000);
                return (
                  <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 hover:bg-muted/60">
                    <div className="flex min-w-0 items-center gap-3">
                      <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{p.titulo}</p>
                        <p className="truncate text-xs text-muted-foreground">{p.processos?.numero_cnj ?? "—"}</p>
                      </div>
                    </div>
                    <span className={cn("shrink-0 text-[11px] font-medium", diff <= 1 ? "text-destructive" : "text-muted-foreground")}>
                      {diff <= 0 ? "hoje" : `D-${diff}`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-5 shadow-none">
        <SectionTitle title="Meus processos ativos" subtitle="Últimos atualizados" link="/processos" />
        {meusProcessos.length === 0 ? (
          <EmptyState message="Você ainda não é responsável por processos." />
        ) : (
          <div className="space-y-1">
            {meusProcessos.map((p: any) => (
              <Link
                key={p.id}
                to={`/processos/${p.id}`}
                className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted/60"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.numero_cnj ?? "Sem CNJ"}</p>
                    <p className="truncate text-xs text-muted-foreground">{p.clientes?.nome ?? "—"}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {p.area_direito && <Badge variant="outline" className="text-[10px] capitalize">{p.area_direito}</Badge>}
                  <Badge variant="secondary" className="text-[10px]">{p.status}</Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// =================================================================
// HELPERS
// =================================================================
function SectionTitle({ title, subtitle, link }: { title: string; subtitle?: string; link?: string }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="font-display text-base tracking-tight text-foreground">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {link && (
        <Button variant="ghost" size="sm" asChild className="h-7 shrink-0 px-2 text-xs text-muted-foreground">
          <Link to={link}>Ver todos <ArrowRight className="ml-1 h-3 w-3" /></Link>
        </Button>
      )}
    </div>
  );
}

const KPI_ACCENT: Record<string, string> = {
  primary: "bg-primary/10 text-primary",
  navy: "bg-navy-soft text-navy",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
  success: "bg-success/10 text-success",
  champagne: "bg-champagne-soft text-champagne",
};

function KpiCard({
  icon: Icon, label, value, hint, accent, tone, to,
}: {
  icon: any; label: string; value: React.ReactNode; hint?: string;
  accent: string; tone?: "warning" | "destructive"; to?: string;
}) {
  const conteudo = (
    <Card className="h-full border-border/80 p-4 shadow-none transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 truncate font-display text-2xl tabular-nums tracking-tight text-foreground">{value}</p>
          {hint && (
            <p
              className={cn(
                "mt-1 truncate text-[11px]",
                tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-warning" : "text-muted-foreground",
              )}
            >
              {hint}
            </p>
          )}
        </div>
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", KPI_ACCENT[accent] ?? "bg-muted")}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </Card>
  );
  return to ? <Link to={to} className="block h-full">{conteudo}</Link> : conteudo;
}

function MiniStat({
  label, value, tone, icon: Icon,
}: { label: string; value: string; tone: "success" | "destructive" | "champagne" | "neutral"; icon: any }) {
  const toneClass = {
    success: "text-success",
    destructive: "text-destructive",
    champagne: "text-champagne",
    neutral: "text-foreground",
  }[tone];
  return (
    <div className="rounded-xl border border-border/70 p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className={cn("mt-1.5 font-display text-xl tabular-nums tracking-tight", toneClass)}>{value}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-10 text-center">
      <CheckCircle2 className="mb-2 h-7 w-7 text-muted-foreground/40" />
      <p className="max-w-[220px] text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <div className="grid gap-4 xl:grid-cols-12">
        <Skeleton className="h-80 rounded-xl xl:col-span-5" />
        <Skeleton className="h-80 rounded-xl xl:col-span-4" />
        <Skeleton className="h-80 rounded-xl xl:col-span-3" />
      </div>
      <div className="grid gap-4 xl:grid-cols-12">
        <Skeleton className="h-64 rounded-xl xl:col-span-4" />
        <Skeleton className="h-64 rounded-xl xl:col-span-4" />
        <Skeleton className="h-64 rounded-xl xl:col-span-4" />
      </div>
      <Skeleton className="h-36 rounded-xl" />
    </div>
  );
}
