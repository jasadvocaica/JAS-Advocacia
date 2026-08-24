import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Briefcase,
  ListChecks,
  Calendar,
  DollarSign,
  AlertTriangle,
  Loader2,
  Gavel,
  ArrowRight,
  Sun,
  Moon,
  Sunset,
  Sparkles,
  ShieldCheck,
  Info,
  X,
} from "lucide-react";
import { formatBRL, formatDate } from "@/lib/format";
import { toast } from "sonner";
import type { PortalParceiroContext } from "../PortalParceiroLayout";

interface Indicadores {
  processos: number;
  tarefas: number;
  prazos: number;
  prazosHoje: number;
  aReceber: number;
  proximaAudiencia: any | null;
  alertas: any[];
  listaTarefas: any[];
  listaPrazos: any[];
}

function getSaudacao() {
  const h = new Date().getHours();
  if (h < 12) return { texto: "Bom dia", Icon: Sun };
  if (h < 18) return { texto: "Boa tarde", Icon: Sunset };
  return { texto: "Boa noite", Icon: Moon };
}

export default function DashboardParceiro() {
  const { parceiro } = useOutletContext<PortalParceiroContext>();
  const { user } = useAuth();
  const [data, setData] = useState<Indicadores | null>(null);
  const [loading, setLoading] = useState(true);
  const sobreKey = `portal-parceiro:sobre-dismissed:${parceiro.id}`;
  const [mostrarSobre, setMostrarSobre] = useState<boolean>(() => {
    try { return localStorage.getItem(sobreKey) !== "1"; } catch { return true; }
  });
  const dispensarSobre = () => {
    try { localStorage.setItem(sobreKey, "1"); } catch {}
    setMostrarSobre(false);
  };

  const saudacao = useMemo(() => getSaudacao(), []);

  const load = async () => {
    setLoading(true);
    const hoje = new Date().toISOString().slice(0, 10);
    const em7dias = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const em30dias = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

    const { data: vinculos } = await supabase
      .from("processo_parceiros")
      .select("processo_id")
      .eq("parceiro_id", parceiro.id)
      .eq("ativo", true);

    const processoIds = (vinculos ?? [])
      .map((v: any) => v.processo_id)
      .filter(Boolean) as string[];

    if (processoIds.length === 0) {
      const { data: repZero } = await supabase
        .from("honorarios_repasses")
        .select("valor_repasse")
        .eq("parceiro_id", parceiro.id)
        .eq("status", "pendente");
      setData({
        processos: 0,
        tarefas: 0,
        prazos: 0,
        prazosHoje: 0,
        aReceber: ((repZero as any[]) ?? []).reduce((s, r) => s + Number(r.valor_repasse), 0),
        proximaAudiencia: null,
        alertas: [],
        listaTarefas: [],
        listaPrazos: [],
      });
      setLoading(false);
      return;
    }

    const tarefasQ = supabase
      .from("controladoria_itens")
      .select(`
        id, titulo, data_vencimento, tipo, prioridade, processo_id,
        processos:processo_id(numero_cnj, nb_inss),
        clientes:cliente_id(nome),
        controladoria_responsaveis!inner(user_id)
      `)
      .in("processo_id", processoIds)
      .eq("visivel_parceiro", true)
      .eq("controladoria_responsaveis.user_id", user?.id ?? "")
      .in("status", ["pendente", "em_andamento"])
      .order("data_vencimento", { ascending: true })
      .limit(10);

    const prazosQ = supabase
      .from("controladoria_itens")
      .select("id, titulo, data_vencimento, processo_id")
      .in("processo_id", processoIds)
      .eq("visivel_parceiro", true)
      .in("tipo", ["prazo_fatal", "prazo_processual"])
      .neq("status", "concluido")
      .lte("data_vencimento", em7dias)
      .gte("data_vencimento", hoje);

    const repQ = supabase
      .from("honorarios_repasses")
      .select("valor_repasse")
      .eq("parceiro_id", parceiro.id)
      .eq("status", "pendente");

    const alertasQ = supabase
      .from("controladoria_itens")
      .select("id, titulo, data_vencimento, processo_id, processos:processo_id(numero_cnj)")
      .in("processo_id", processoIds)
      .eq("visivel_parceiro", true)
      .in("tipo", ["prazo_fatal"])
      .neq("status", "concluido")
      .lt("data_vencimento", hoje);

    // Próxima audiência (próximos 30 dias)
    const audienciaQ = supabase
      .from("controladoria_itens")
      .select("id, titulo, data_vencimento, processo_id, local, link_virtual, processos:processo_id(numero_cnj), clientes:cliente_id(nome)")
      .in("processo_id", processoIds)
      .eq("visivel_parceiro", true)
      .eq("tipo", "audiencia")
      .neq("status", "concluido")
      .gte("data_vencimento", hoje)
      .lte("data_vencimento", em30dias)
      .order("data_vencimento", { ascending: true })
      .limit(1);

    const [tarefasRes, prazosRes, repRes, alertasRes, audRes] = await Promise.all([
      tarefasQ, prazosQ, repQ, alertasQ, audienciaQ,
    ]);

    const prazosLista = (prazosRes.data as any[]) ?? [];
    const prazosHoje = prazosLista.filter((p) => p.data_vencimento.slice(0, 10) === hoje).length;

    setData({
      processos: processoIds.length,
      tarefas: tarefasRes.data?.length ?? 0,
      prazos: prazosLista.length,
      prazosHoje,
      aReceber: ((repRes.data as any[]) ?? []).reduce((s, r) => s + Number(r.valor_repasse), 0),
      proximaAudiencia: ((audRes.data as any[]) ?? [])[0] ?? null,
      alertas: (alertasRes.data as any[]) ?? [],
      listaTarefas: (tarefasRes.data as any[]) ?? [],
      listaPrazos: prazosLista,
    });
    setLoading(false);
  };

  useEffect(() => { load(); }, [parceiro.id, user?.id]);

  const concluirTarefa = async (id: string) => {
    const { error } = await supabase
      .from("controladoria_itens")
      .update({ status: "concluido", concluido_em: new Date().toISOString() })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Tarefa concluída");
    load();
  };

  if (loading || !data) {
    return <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  // Resumo do dia
  const resumoPartes: string[] = [];
  if (data.alertas.length > 0) resumoPartes.push(`${data.alertas.length} prazo${data.alertas.length > 1 ? "s" : ""} vencido${data.alertas.length > 1 ? "s" : ""}`);
  if (data.prazosHoje > 0) resumoPartes.push(`${data.prazosHoje} venc${data.prazosHoje > 1 ? "em" : "e"} hoje`);
  if (data.tarefas > 0 && resumoPartes.length === 0) resumoPartes.push(`${data.tarefas} tarefa${data.tarefas > 1 ? "s" : ""} em aberto`);
  const resumo = resumoPartes.length > 0 ? resumoPartes.join(" · ") : "Nada urgente para hoje. Bom trabalho!";

  const SaudacaoIcon = saudacao.Icon;
  const audDias = data.proximaAudiencia
    ? Math.ceil((new Date(data.proximaAudiencia.data_vencimento).getTime() - Date.now()) / 86400000)
    : null;

  return (
    <div className="space-y-6">
      <Card className="p-5 bg-gradient-to-br from-primary/5 to-transparent border-primary/20">
        <div className="flex items-start gap-4">
          <div className="rounded-full bg-primary/10 p-2.5">
            <SaudacaoIcon className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-2xl">
              {saudacao.texto}, {parceiro.nome.split(" ")[0]}
            </h2>
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              {resumo}
            </p>
          </div>
        </div>
      </Card>

      {mostrarSobre && (
        <Card className="p-5 bg-gradient-to-br from-sidebar to-sidebar/80 text-sidebar-foreground border-gold/30 relative">
          <button
            onClick={dispensarSobre}
            className="absolute top-3 right-3 text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
            aria-label="Dispensar mensagem"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-full bg-gold/20 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-gold" />
            </div>
            <div className="space-y-2 flex-1 min-w-0 pr-6">
              <Badge className="bg-gold text-sidebar-primary-foreground">Sobre este portal</Badge>
              <h3 className="font-display text-xl">Este portal é seu, e só seu.</h3>
              <p className="text-sm text-sidebar-foreground/80">
                Tudo que aparece aqui é estritamente o que está atribuído a você como parceiro da banca.
                Você não vê — nem por engano — clientes, processos, modelos ou números do escritório que
                não fazem parte do seu trabalho. Suas ações ficam registradas em log de auditoria para
                segurança de todos.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button asChild size="sm" variant="outline" className="bg-transparent border-gold/40 text-gold hover:bg-gold/10 hover:text-gold">
                  <Link to="bem-vindo">
                    <Info className="w-3.5 h-3.5 mr-1.5" />
                    Ver o que posso fazer
                  </Link>
                </Button>
                <Button size="sm" variant="ghost" onClick={dispensarSobre} className="text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-foreground/10">
                  Não mostrar novamente
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Indicador icon={Briefcase} label="Processos ativos" valor={String(data.processos)} />
        <Indicador icon={ListChecks} label="Tarefas em aberto" valor={String(data.tarefas)} />
        <Indicador icon={Calendar} label="Prazos (7 dias)" valor={String(data.prazos)} highlight={data.prazos > 0} />
        <Indicador icon={DollarSign} label="A receber" valor={formatBRL(data.aReceber)} valorClass="text-amber-600" />
      </div>

      {/* Próxima audiência */}
      {data.proximaAudiencia && (
        <Card className="p-4 border-primary/30">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-primary/10 p-2">
              <Gavel className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium">Próxima audiência</p>
                <Badge variant={audDias !== null && audDias <= 3 ? "destructive" : "outline"} className="text-[10px]">
                  {audDias === 0 ? "Hoje" : audDias === 1 ? "Amanhã" : `em ${audDias}d`}
                </Badge>
              </div>
              <p className="text-sm mt-1 truncate">{data.proximaAudiencia.titulo}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatDate(data.proximaAudiencia.data_vencimento)}
                {data.proximaAudiencia.clientes?.nome && ` · ${data.proximaAudiencia.clientes.nome}`}
                {data.proximaAudiencia.local && ` · ${data.proximaAudiencia.local}`}
              </p>
            </div>
            <Button size="sm" variant="outline" asChild>
              <Link to={`processos/${data.proximaAudiencia.processo_id}`}>Ver</Link>
            </Button>
          </div>
        </Card>
      )}

      {/* Atalhos rápidos */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <AtalhoRapido to="processos" icon={Briefcase} label="Meus processos" />
        <AtalhoRapido to="prazos" icon={Calendar} label="Todos os prazos" highlight={data.prazos > 0} />
        <AtalhoRapido to="tarefas" icon={ListChecks} label="Minhas tarefas" />
        <AtalhoRapido to="financeiro" icon={DollarSign} label="Financeiro" />
      </div>

      {data.alertas.length > 0 && (
        <Card className="p-4 border-destructive/40 bg-destructive/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-destructive">Prazos vencidos exigem ação imediata</p>
              <ul className="mt-2 space-y-1 text-sm">
                {data.alertas.map((a) => (
                  <li key={a.id}>
                    <Link to={`processos/${a.processo_id}`} className="hover:underline">
                      {a.titulo} — venceu em {formatDate(a.data_vencimento)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="font-display text-lg mb-3">Minhas tarefas</h3>
          {data.listaTarefas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada pendente atribuído a você.</p>
          ) : (
            <ul className="space-y-2">
              {data.listaTarefas.slice(0, 6).map((t) => (
                <li key={t.id} className="flex items-start gap-3 p-2 hover:bg-muted/50 rounded-md">
                  <Checkbox onCheckedChange={() => concluirTarefa(t.id)} className="mt-1" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.titulo}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.clientes?.nome ?? "—"} · vence {formatDate(t.data_vencimento)}
                    </p>
                  </div>
                  {t.tipo === "prazo_fatal" && <Badge variant="destructive" className="text-[10px]">Fatal</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="font-display text-lg mb-3">Prazos da semana</h3>
          {data.listaPrazos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem prazos imediatos nos seus processos.</p>
          ) : (
            <ul className="space-y-2">
              {data.listaPrazos.map((p) => (
                <li key={p.id} className="flex items-center gap-3 p-2 hover:bg-muted/50 rounded-md">
                  <Calendar className="w-4 h-4 text-amber-600" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{p.titulo}</p>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground">{formatDate(p.data_vencimento)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Indicador({ icon: Icon, label, valor, valorClass, highlight }: any) {
  return (
    <Card className={`p-4 ${highlight ? "border-amber-500/40" : ""}`}>
      <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <p className={`font-display text-2xl mt-1 ${valorClass ?? ""}`}>{valor}</p>
    </Card>
  );
}

function AtalhoRapido({ to, icon: Icon, label, highlight }: { to: string; icon: any; label: string; highlight?: boolean }) {
  return (
    <Link
      to={to}
      className={`group flex items-center justify-between gap-2 p-3 rounded-lg border transition-all hover:border-primary/40 hover:bg-primary/5 ${
        highlight ? "border-amber-500/40 bg-amber-500/5" : "border-border"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Icon className={`w-4 h-4 shrink-0 ${highlight ? "text-amber-600" : "text-muted-foreground"}`} />
        <span className="text-sm font-medium truncate">{label}</span>
      </div>
      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
    </Link>
  );
}
