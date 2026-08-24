import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL, formatDate } from "@/lib/format";
import { MapaBrasilClientes, ClienteEstadoData } from "@/components/dashboard/MapaBrasilClientes";
import {
  Users, Briefcase, AlertTriangle, Clock, DollarSign, CheckCircle2,
  TrendingUp, Calendar, ArrowRight, Cake, Activity, HandCoins, ListTodo,
  AlertOctagon, Sparkles,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";

// --------------------------------------------------------------
// Tipos
// --------------------------------------------------------------
interface DashboardCards {
  processos_ativos: number;
  prazos_proximos_7d: number;
  prazos_vencidos: number;
  receita_mes: number;
  a_receber_mes: number;
  em_atraso: number;
  tarefas_abertas: number;
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
  "hsl(var(--gold))",
  "hsl(217 70% 55%)",
  "hsl(142 60% 45%)",
  "hsl(35 90% 55%)",
  "hsl(280 60% 55%)",
  "hsl(0 70% 60%)",
  "hsl(195 70% 50%)",
];

// --------------------------------------------------------------
// Página
// --------------------------------------------------------------
export default function Dashboard() {
  const { profile, isGestor, hasPermission, user, roles } = useAuth();
  const verFinanceiro = hasPermission("financeiro", "visualizar");
  const verEquipe = hasPermission("equipe", "visualizar");

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
  }, []);

  // Redireciona estagiárias direto para o painel operacional
  if (!isGestor && roles.includes("estagiario")) {
    return <Navigate to="/painel-operacional" replace />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting}, ${profile?.nome?.split(" ")[0] ?? ""}`}
        description={`${isGestor ? "Visão completa do escritório" : "Sua agenda e seus processos"} • ${formatDate(new Date())}`}
      />

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
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<DashboardCards>({
    processos_ativos: 0, prazos_proximos_7d: 0, prazos_vencidos: 0,
    receita_mes: 0, a_receber_mes: 0, em_atraso: 0,
    tarefas_abertas: 0, repasses_pendentes: 0,
  });
  const [alertas, setAlertas] = useState<AlertaBloqueante[]>([]);
  const [prazosSemana, setPrazosSemana] = useState<any[]>([]);
  const [tarefasAtrasadas, setTarefasAtrasadas] = useState<any[]>([]);
  const [receitaHist, setReceitaHist] = useState<{ mes: string; realizado: number; previsto: number }[]>([]);
  const [areaData, setAreaData] = useState<{ area: string; total: number }[]>([]);
  const [desempenho, setDesempenho] = useState<DesempenhoMembro[]>([]);
  const [datajudHoje, setDatajudHoje] = useState<any[]>([]);
  const [aniversariantes, setAniversariantes] = useState<any[]>([]);
  const [repasses, setRepasses] = useState<{ parceiro: string; total: number }[]>([]);
  const [estadoData, setEstadoData] = useState<{ estado: string; total: number }[]>([]);
  const [dadosMapaEstados, setDadosMapaEstados] = useState<ClienteEstadoData[]>([]);
  const [totalClientesGeral, setTotalClientesGeral] = useState<number>(0);

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
      ];

      const [
        rProcAtivos, rPrazos7, rPrazosVenc, rTarefasAbertas, rTarefasAtrasadas,
        rPagamentos, rParcelas, rRepasses, rArea, rDesempenho, rDataJud, rClientes,
      ] = await Promise.all(queries);

      if (!ativo) return;

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
        processos_ativos: rProcAtivos.count ?? 0,
        prazos_proximos_7d: rPrazos7.data?.length ?? 0,
        prazos_vencidos: rPrazosVenc.data?.length ?? 0,
        receita_mes: receitaMes,
        a_receber_mes: aReceberMes,
        em_atraso: emAtraso,
        tarefas_abertas: rTarefasAbertas.count ?? 0,
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

      // Estados atendidos & dados do mapa
      const totalCli = (rClientes.data ?? []).length;
      setTotalClientesGeral(totalCli);

      const estadoMap = new Map<string, number>();
      (rClientes.data ?? []).forEach((c: any) => {
        let uf = (c.estado || "").trim().toUpperCase();
        // Normaliza se veio nome de estado por extenso
        if (uf.length > 2) {
          const ufsMap: Record<string, string> = {
            "SÃO PAULO": "SP", "SAO PAULO": "SP", "RIO DE JANEIRO": "RJ", "MINAS GERAIS": "MG",
            "BAHIA": "BA", "PARANÁ": "PR", "PARANA": "PR", "RIO GRANDE DO SUL": "RS",
            "SANTA CATARINA": "SC", "PERNAMBUCO": "PE", "CEARÁ": "CE", "CEARA": "CE",
            "GOIÁS": "GO", "GOIAS": "GO", "MARANHÃO": "MA", "MARANHAO": "MA", "PARA": "PA",
            "PARÁ": "PA", "AMAZONAS": "AM", "ESPÍRITO SANTO": "ES", "ESPIRITO SANTO": "ES",
            "PIAUÍ": "PI", "PIAUI": "PI", "ALAGOAS": "AL", "DISTRITO FEDERAL": "DF",
            "MATO GROSSO": "MT", "MATO GROSSO DO SUL": "MS", "SERGIPE": "SE", "RONDÔNIA": "RO",
            "RONDONIA": "RO", "TOCANTINS": "TO", "ACRE": "AC", "AMAPÁ": "AP", "AMAPA": "AP",
            "RORAIMA": "RR", "PARAÍBA": "PB", "PARAIBA": "PB", "RIO GRANDE DO NORTE": "RN",
          };
          uf = ufsMap[uf] || uf.slice(0, 2);
        }
        if (!uf) return;
        estadoMap.set(uf, (estadoMap.get(uf) ?? 0) + 1);
      });

      const listEstados = Array.from(estadoMap.entries())
        .map(([estado, total]) => ({ estado, total }))
        .sort((a, b) => b.total - a.total);

      setEstadoData(listEstados);
      setDadosMapaEstados(
        listEstados.map((e) => ({
          uf: e.estado,
          totalClientes: e.total,
        }))
      );

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

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-6">
      {/* Alertas bloqueantes */}
      {alertas.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5 p-5">
          <div className="flex items-start gap-3">
            <AlertOctagon className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2 min-w-0">
              <h3 className="font-display text-lg text-destructive">
                {alertas.length} alerta{alertas.length > 1 ? "s" : ""} {alertas.length > 1 ? "exigem" : "exige"} atenção
              </h3>
              <div className="space-y-1.5">
                {alertas.map((a, i) => (
                  <Link key={i} to={a.link} className="block group">
                    <div className="flex items-center justify-between gap-3 p-2 rounded-md hover:bg-destructive/10 transition-colors">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate group-hover:text-destructive">{a.titulo}</p>
                        <p className="text-xs text-muted-foreground truncate">{a.subtitulo}</p>
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

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8 gap-3">
        <KpiCard icon={Briefcase} label="Processos ativos" value={cards.processos_ativos} accent="primary" />
        <KpiCard icon={Clock} label="Prazos 7 dias" value={cards.prazos_proximos_7d} accent="warning" />
        <KpiCard icon={AlertTriangle} label="Prazos vencidos" value={cards.prazos_vencidos} accent="destructive" />
        <KpiCard icon={ListTodo} label="Tarefas abertas" value={cards.tarefas_abertas} accent="primary" />
        {verFinanceiro && (
          <>
            <KpiCard icon={DollarSign} label="Receita do mês" value={formatBRL(cards.receita_mes)} accent="success" />
            <KpiCard icon={TrendingUp} label="A receber" value={formatBRL(cards.a_receber_mes)} accent="gold" />
            <KpiCard icon={AlertTriangle} label="Em atraso" value={formatBRL(cards.em_atraso)} accent="destructive" />
            <KpiCard icon={HandCoins} label="Repasses pend." value={formatBRL(cards.repasses_pendentes)} accent="gold" />
          </>
        )}
      </div>

      {/* Gráficos */}
      <div className="grid lg:grid-cols-3 gap-6">
        {verFinanceiro && (
          <Card className="lg:col-span-2 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display text-2xl">Receita</h3>
                <p className="text-sm text-muted-foreground">Realizado (6 meses) e previsto (próximos 3)</p>
              </div>
              <Badge variant="outline" className="text-xs">
                <span className="inline-block w-2 h-2 rounded-full bg-primary mr-1.5" />Realizado
                <span className="inline-block w-2 h-2 rounded-full bg-gold ml-3 mr-1.5" />Previsto
              </Badge>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={receitaHist} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  formatter={(v: any) => formatBRL(Number(v))}
                />
                <Bar dataKey="realizado" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Realizado" />
                <Bar dataKey="previsto" fill="hsl(var(--gold))" radius={[4, 4, 0, 0]} name="Previsto" fillOpacity={0.7} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        <Card className="p-6">
          <h3 className="font-display text-2xl mb-1">Por área do direito</h3>
          <p className="text-sm text-muted-foreground mb-4">Processos ativos</p>
          {areaData.length === 0 ? (
            <EmptyState message="Sem processos cadastrados." />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={areaData} dataKey="total" nameKey="area" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {areaData.map((_, i) => (
                      <Cell key={i} fill={AREA_COLORS[i % AREA_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-3">
                {areaData.slice(0, 5).map((a, i) => {
                  const totalAll = areaData.reduce((s, x) => s + x.total, 0);
                  const pct = totalAll > 0 ? Math.round((a.total / totalAll) * 100) : 0;
                  return (
                    <div key={a.area} className="flex items-center gap-2 text-xs">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: AREA_COLORS[i % AREA_COLORS.length] }} />
                      <span className="flex-1 truncate capitalize">{a.area}</span>
                      <span className="text-muted-foreground tabular-nums">{a.total} ({pct}%)</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Mapa do Brasil de Clientes */}
      <MapaBrasilClientes
        dadosEstados={dadosMapaEstados}
        totalGeralClientes={totalClientesGeral}
      />

      {/* Prazos da semana + Tarefas atrasadas */}
      <div className="grid lg:grid-cols-2 gap-6">
        <ListCard
          title="Prazos da semana"
          subtitle="Próximos 7 dias"
          link="/controladoria"
          empty="Nenhum prazo nos próximos 7 dias."
          items={prazosSemana}
          renderItem={(p: any) => {
            const diff = Math.ceil((new Date(p.data_vencimento).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            return (
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/40">
                <div className="min-w-0 flex items-center gap-3">
                  <div className={`w-1 h-10 rounded-full ${diff <= 1 ? "bg-destructive" : diff <= 3 ? "bg-warning" : "bg-gold"}`} />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{p.titulo}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {p.clientes?.nome ?? "—"} • {p.processos?.numero_cnj ?? "—"}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-medium">{formatDate(p.data_vencimento)}</p>
                  <Badge variant={diff <= 1 ? "destructive" : "outline"} className="text-[10px] mt-0.5">
                    {diff === 0 ? "hoje" : `D-${diff}`}
                  </Badge>
                </div>
              </div>
            );
          }}
        />

        <ListCard
          title="Tarefas atrasadas"
          subtitle="Pendentes com vencimento passado"
          link="/controladoria"
          empty="Nenhuma tarefa atrasada."
          items={tarefasAtrasadas}
          renderItem={(p: any) => {
            const diff = Math.floor((Date.now() - new Date(p.data_vencimento).getTime()) / (1000 * 60 * 60 * 24));
            return (
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-destructive/5">
                <div className="min-w-0">
                  <p className="font-medium truncate">{p.titulo}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {p.clientes?.nome ?? "—"} • {p.processos?.numero_cnj ?? "—"}
                  </p>
                </div>
                <Badge variant="destructive" className="shrink-0 text-[10px]">{diff}d atrás</Badge>
              </div>
            );
          }}
        />
      </div>

      {/* Desempenho equipe */}
      {verEquipe && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display text-2xl">Desempenho da equipe</h3>
              <p className="text-sm text-muted-foreground">Atingimento de metas — mês atual</p>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/equipe">Ver equipe <ArrowRight className="w-4 h-4 ml-1" /></Link>
            </Button>
          </div>
          {desempenho.length === 0 ? (
            <EmptyState message="Sem dados de desempenho deste mês." />
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {desempenho.map((d) => (
                <div key={d.membro_id} className="p-3 rounded-lg border border-border bg-muted/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                        {d.nome.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{d.nome}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">{d.cargo}</p>
                    </div>
                  </div>
                  <Progress value={Math.min(d.atingimento_pct, 100)} className="h-2" />
                  <div className="flex justify-between items-center mt-1.5">
                    <span className="text-[10px] text-muted-foreground">Atingimento</span>
                    <Badge
                      variant="outline"
                      className={
                        d.atingimento_pct >= 90 ? "text-success border-success/40" :
                        d.atingimento_pct >= 70 ? "text-warning border-warning/40" :
                        "text-destructive border-destructive/40"
                      }
                    >
                      {d.atingimento_pct.toFixed(0)}%
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* DataJud + Aniversariantes + Repasses */}
      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display text-xl flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" /> Andamentos DataJud — hoje
              </h3>
              <p className="text-sm text-muted-foreground">Movimentações detectadas automaticamente</p>
            </div>
          </div>
          {datajudHoje.length === 0 ? (
            <EmptyState message="Nenhum andamento novo hoje." />
          ) : (
            <ScrollArea className="h-[280px]">
              <div className="space-y-2 pr-3">
                {datajudHoje.map((a: any) => (
                  <div key={a.id} className="flex gap-3 p-2.5 rounded-md hover:bg-muted/50 transition-colors">
                    <div className="w-1 self-stretch rounded-full bg-primary/40" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">{a.descricao}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {a.processos?.numero_cnj ?? "—"} • {a.processos?.clientes?.nome ?? "—"}
                      </p>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {new Date(a.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="font-display text-xl flex items-center gap-2 mb-3">
              <Cake className="w-4 h-4 text-gold" /> Aniversariantes
            </h3>
            {aniversariantes.length === 0 ? (
              <EmptyState message="Nenhum nesta semana." />
            ) : (
              <div className="space-y-2">
                {aniversariantes.map((c: any) => {
                  const [, mm, dd] = c.nascimento.split("-").map(Number);
                  return (
                    <Link key={c.id} to={`/clientes/${c.id}`} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-gold/20 text-gold-dark text-xs font-semibold">
                          {c.nome.split(" ").map((n: string) => n[0]).slice(0, 2).join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate">{c.nome}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        {String(dd).padStart(2, "0")}/{String(mm).padStart(2, "0")}
                      </Badge>
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>

          {verFinanceiro && repasses.length > 0 && (
            <Card className="p-6">
              <h3 className="font-display text-xl flex items-center gap-2 mb-3">
                <HandCoins className="w-4 h-4 text-gold" /> Repasses pendentes
              </h3>
              <div className="space-y-2">
                {repasses.map((r) => (
                  <div key={r.parceiro} className="flex items-center justify-between p-2 rounded-md bg-muted/40">
                    <span className="text-sm truncate">{r.parceiro}</span>
                    <span className="text-sm font-semibold tabular-nums">{formatBRL(r.total)}</span>
                  </div>
                ))}
              </div>
              <Button variant="ghost" size="sm" asChild className="w-full mt-3">
                <Link to="/financeiro/repasses">Ver todos <ArrowRight className="w-4 h-4 ml-1" /></Link>
              </Button>
            </Card>
          )}
        </div>
      </div>
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
      <Card className="p-5 bg-gradient-to-r from-primary/5 to-gold/5 border-primary/20">
        <div className="flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-gold" />
          <p className="text-sm">
            Você tem <strong className="text-primary">{tarefasHoje.length}</strong> tarefa{tarefasHoje.length !== 1 ? "s" : ""} para hoje
            {prazosSemana.length > 0 && (
              <> e <strong className="text-warning">{prazosSemana.length}</strong> prazo{prazosSemana.length > 1 ? "s" : ""} esta semana</>
            )}.
          </p>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <ListCard
          title="Minhas tarefas de hoje"
          subtitle={`${tarefasHoje.length} pendente${tarefasHoje.length !== 1 ? "s" : ""}`}
          link="/controladoria"
          empty="Tudo em dia! Nenhuma tarefa para hoje."
          items={tarefasHoje}
          renderItem={(t: any) => (
            <Link to="/controladoria" className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 hover:bg-muted transition-colors">
              <CheckCircle2 className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate text-sm">{t.titulo}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {t.clientes?.nome ?? "—"} • {t.processos?.numero_cnj ?? "—"}
                </p>
              </div>
              <Badge variant={t.prioridade === "alta" || t.prioridade === "urgente" ? "destructive" : "outline"} className="text-[10px]">
                {t.prioridade}
              </Badge>
            </Link>
          )}
        />

        <ListCard
          title="Meus prazos da semana"
          subtitle="Próximos 7 dias"
          link="/controladoria"
          empty="Sem prazos esta semana."
          items={prazosSemana}
          renderItem={(p: any) => {
            const diff = Math.ceil((new Date(p.data_vencimento).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            return (
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/40">
                <div className="min-w-0 flex items-center gap-3">
                  <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium truncate text-sm">{p.titulo}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.processos?.numero_cnj ?? "—"}</p>
                  </div>
                </div>
                <Badge variant={diff <= 1 ? "destructive" : "outline"} className="shrink-0 text-[10px]">
                  {diff === 0 ? "hoje" : `D-${diff}`}
                </Badge>
              </div>
            );
          }}
        />
      </div>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display text-2xl">Meus processos ativos</h3>
            <p className="text-sm text-muted-foreground">Últimos atualizados</p>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/processos">Ver todos <ArrowRight className="w-4 h-4 ml-1" /></Link>
          </Button>
        </div>
        {meusProcessos.length === 0 ? (
          <EmptyState message="Você ainda não é responsável por processos." />
        ) : (
          <div className="space-y-2">
            {meusProcessos.map((p: any) => (
              <Link key={p.id} to={`/processos/${p.id}`}
                className="flex items-center justify-between gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                <div className="min-w-0 flex items-center gap-3">
                  <Briefcase className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium truncate text-sm">{p.numero_cnj ?? "Sem CNJ"}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.clientes?.nome ?? "—"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {p.area_direito && <Badge variant="outline" className="capitalize text-[10px]">{p.area_direito}</Badge>}
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
function KpiCard({ icon: Icon, label, value, accent }: { icon: any; label: string; value: any; accent: string }) {
  const accentClasses: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    warning: "bg-warning/10 text-warning",
    destructive: "bg-destructive/10 text-destructive",
    success: "bg-success/10 text-success",
    gold: "bg-gold/15 text-gold-dark",
  };
  return (
    <Card className="p-4 hover:brand-shadow transition-shadow">
      <div className={`w-9 h-9 rounded-lg ${accentClasses[accent] ?? "bg-muted"} flex items-center justify-center mb-2`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">{label}</p>
      <p className="text-xl font-display font-semibold mt-0.5 truncate">{value}</p>
    </Card>
  );
}

function ListCard<T>({ title, subtitle, link, items, empty, renderItem }: {
  title: string; subtitle: string; link: string; items: T[]; empty: string;
  renderItem: (item: T) => React.ReactNode;
}) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-display text-2xl">{title}</h3>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link to={link}>Ver todos <ArrowRight className="w-4 h-4 ml-1" /></Link>
        </Button>
      </div>
      {items.length === 0 ? (
        <EmptyState message={empty} />
      ) : (
        <div className="space-y-2">
          {items.map((it, i) => <div key={i}>{renderItem(it)}</div>)}
        </div>
      )}
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-10 text-center text-muted-foreground">
      <CheckCircle2 className="w-9 h-9 mx-auto mb-2 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
      </div>
      <div className="grid lg:grid-cols-3 gap-6">
        <Skeleton className="h-80 lg:col-span-2 rounded-lg" />
        <Skeleton className="h-80 rounded-lg" />
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    </div>
  );
}
