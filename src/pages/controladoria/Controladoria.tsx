import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, Search, Loader2, Calendar as CalendarIcon, LayoutGrid, List, AlertTriangle, Clock, Workflow, CalendarCheck, BarChart3, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { isToday, isTomorrow, isPast, isThisWeek, isWithinInterval, addDays, startOfDay } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatDateTime, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  ControladoriaItem, TIPO_LABELS, STATUS_LABELS, PRIORIDADE_LABELS,
  TIPO_CLASS, STATUS_CLASS, PRIORIDADE_CLASS, KANBAN_COLUMNS, TipoItem, StatusItem, Prioridade,
  EtapaKanban,
} from "./types";
import { transicionarEtapa, etapaAtualDe, ETAPA_LABEL, type EtapaWorkflow } from "./workflow";

import ItemFormDialog from "./ItemFormDialog";
import ItemDetalheSheet from "./ItemDetalheSheet";
import { BiaAcoesButton } from "@/components/assistente/BiaAcoesButton";
import { useEquipeInterna } from "./equipe";
import { ResponsavelAvatar } from "./ResponsavelAvatar";
import { TipoBadge } from "./TipoBadge";
import { KanbanBoard } from "./KanbanBoard";
import { EventosSemanaCard } from "./EventosSemanaCard";
import { PendenciasProducaoCard } from "./PendenciasProducaoCard";

type FiltroTipo = "todos" | TipoItem;
type FiltroPrioridade = "todas" | Prioridade;

/** Filtros aceitos por query param (somente leitura). */
const ETAPAS_FILTRAVEIS: EtapaWorkflow[] = ["criacao", "execucao", "revisao", "correcao", "protocolo", "finalizado"];
const PRAZOS_FILTRAVEIS = ["atrasado", "hoje", "amanha", "semana"];

export default function Controladoria() {
  const { hasPermission, user, isGestor } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const podeCriar = hasPermission("controladoria", "criar");
  const podeEditar = hasPermission("controladoria", "editar");
  const podeExcluir = hasPermission("controladoria", "excluir");
  const { equipe } = useEquipeInterna();
  const [concluidosExpandido, setConcluidosExpandido] = useState(false);
  const [kanbanFullscreen, setKanbanFullscreen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [itens, setItens] = useState<ControladoriaItem[]>([]);
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>("todos");
  const [filtroPrioridade, setFiltroPrioridade] = useState<FiltroPrioridade>("todas");
  // "todos" | "sem" | <user_id>
  const [filtroResponsavel, setFiltroResponsavel] = useState<string>(
    () => searchParams.get("responsavel") || "todos",
  );

  const [formOpen, setFormOpen] = useState(false);
  const [editandoItem, setEditandoItem] = useState<ControladoriaItem | null>(null);
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const itemParam = searchParams.get("item");

  // Leitura segura de filtros vindos por query param (ex.: Painel da Juliana).
  // Apenas leitura/visualização — nenhuma regra de negócio é alterada aqui.
  const etapaParam = useMemo(() => {
    const v = searchParams.get("etapa");
    return v && ETAPAS_FILTRAVEIS.includes(v as EtapaWorkflow) ? (v as EtapaWorkflow) : null;
  }, [searchParams]);
  const prazoParam = useMemo(() => {
    const v = searchParams.get("prazo");
    return v && PRAZOS_FILTRAVEIS.includes(v) ? v : null;
  }, [searchParams]);


  useEffect(() => {
    if (itemParam && itemParam !== selecionadoId) setSelecionadoId(itemParam);
  }, [itemParam, selecionadoId]);

  function selecionarItem(id: string) {
    setSelecionadoId(id);
    const next = new URLSearchParams(searchParams);
    next.set("item", id);
    setSearchParams(next, { replace: false });
  }

  function fecharDetalhe(open: boolean) {
    if (open) return;
    setSelecionadoId(null);
    if (!itemParam) return;
    const next = new URLSearchParams(searchParams);
    next.delete("item");
    setSearchParams(next, { replace: true });
  }

  // Quando o usuário logado faz parte da equipe, default = "meus itens"
  useEffect(() => {
    if (!user?.id || equipe.length === 0) return;
    if (filtroResponsavel !== "todos") return;
    if (equipe.some((m) => m.id === user.id)) {
      setFiltroResponsavel(user.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, equipe.length]);

  async function loadItens() {
    setLoading(true);
    const { data, error } = await supabase
      .from("controladoria_itens")
      .select("*, cliente:clientes(id, nome), processo:processos(id, numero_cnj, tipo_acao), responsavel:profiles!responsavel_id(id, nome, email), google_evento:controladoria_google_eventos(google_event_id, ultimo_sync, ultimo_erro)")
      .order("data_vencimento", { ascending: true });
    setLoading(false);
    if (error) return console.error(error);
    const normalizados = (data ?? []).map((d: any) => ({
      ...d,
      responsavel: Array.isArray(d.responsavel) ? (d.responsavel[0] ?? null) : d.responsavel,
      google_evento: Array.isArray(d.google_evento) ? (d.google_evento[0] ?? null) : d.google_evento,
    }));
    setItens(normalizados as ControladoriaItem[]);
  }

  useEffect(() => { loadItens(); }, []);

  // Helpers de participação no workflow
  const ehResponsavelAtual = (it: ControladoriaItem, uid: string) => it.responsavel_id === uid;
  const participaWorkflow = (it: ControladoriaItem, uid: string) =>
    it.responsavel_id === uid ||
    it.executor_id === uid ||
    it.corretor_id === uid ||
    it.revisor_id === uid ||
    it.protocolador_id === uid;


  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens.filter((it) => {
      if (filtroTipo !== "todos" && it.tipo !== filtroTipo) return false;
      if (filtroPrioridade !== "todas" && it.prioridade !== filtroPrioridade) return false;
      if (etapaParam && etapaAtualDe(it) !== etapaParam) return false;
      if (prazoParam) {
        if (it.status === "concluido" || it.status === "cancelado") return false;
        const v = new Date(it.data_vencimento);
        const ok =
          prazoParam === "atrasado" ? isPast(v) && !isToday(v)
          : prazoParam === "hoje" ? isToday(v)
          : prazoParam === "amanha" ? isTomorrow(v)
          : isThisWeek(v, { weekStartsOn: 1 }) && !isPast(v) && !isToday(v) && !isTomorrow(v);
        if (!ok) return false;
      }
      if (filtroResponsavel === "sem" && it.responsavel_id) return false;
      if (filtroResponsavel !== "todos" && filtroResponsavel !== "sem") {
        // Inclui itens em que o membro é responsável atual OU já foi participante de alguma etapa
        if (!participaWorkflow(it, filtroResponsavel)) return false;
      }
      if (q) {
        const blob = `${it.titulo} ${it.descricao ?? ""} ${it.cliente?.nome ?? ""} ${it.processo?.numero_cnj ?? ""} ${it.responsavel?.nome ?? ""}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [itens, busca, filtroTipo, filtroPrioridade, filtroResponsavel, etapaParam, prazoParam]);


  // Métricas rápidas
  const stats = useMemo(() => {
    const hoje = startOfDay(new Date());
    const em7 = addDays(hoje, 7);
    let atrasados = 0, hojeC = 0, semana = 0, total = 0;
    itens.forEach((it) => {
      if (it.status === "concluido" || it.status === "cancelado") return;
      total++;
      const v = new Date(it.data_vencimento);
      if (isPast(v) && !isToday(v)) atrasados++;
      else if (isToday(v)) hojeC++;
      else if (isWithinInterval(v, { start: hoje, end: em7 })) semana++;
    });
    return { atrasados, hoje: hojeC, semana, total };
  }, [itens]);

  // Agrupamento da agenda
  const grupos = useMemo(() => {
    const g = { atrasados: [] as ControladoriaItem[], hoje: [] as ControladoriaItem[], amanha: [] as ControladoriaItem[], semana: [] as ControladoriaItem[], proximos: [] as ControladoriaItem[], concluidos: [] as ControladoriaItem[] };
    filtrados.forEach((it) => {
      if (it.status === "concluido") { g.concluidos.push(it); return; }
      const v = new Date(it.data_vencimento);
      if (isPast(v) && !isToday(v)) g.atrasados.push(it);
      else if (isToday(v)) g.hoje.push(it);
      else if (isTomorrow(v)) g.amanha.push(it);
      else if (isThisWeek(v, { weekStartsOn: 1 })) g.semana.push(it);
      else g.proximos.push(it);
    });
    return g;
  }, [filtrados]);

  function abrirNovo() { setEditandoItem(null); setFormOpen(true); }
  function abrirEdicao(it: ControladoriaItem) {
    setSelecionadoId(null);
    const next = new URLSearchParams(searchParams);
    next.delete("item");
    setSearchParams(next, { replace: true });
    setEditandoItem(it);
    setFormOpen(true);
  }

  // Drag-and-drop simples para o Kanban
  async function moverItem(itemId: string, novoStatus: StatusItem) {
    const alvo = itens.find((i) => i.id === itemId);
    // Guarda canônica: itens já no workflow (ou conclusão) só mudam via RPC.
    if (alvo && (etapaAtualDe(alvo) !== "criacao" || novoStatus === "concluido")) {
      toast.error("Use o fluxo da tarefa para avançar ou concluir esta atividade");
      return;
    }
    setItens((prev) => prev.map((i) => i.id === itemId ? { ...i, status: novoStatus, coluna_kanban: novoStatus } : i));
    const update: any = { status: novoStatus, coluna_kanban: novoStatus };
    if (novoStatus === "concluido") {
      update.concluido_em = new Date().toISOString();
    }
    const { error } = await supabase.from("controladoria_itens").update(update).eq("id", itemId);
    if (error) { console.error(error); loadItens(); }
  }

  // Move um item entre etapas do workflow direto pelo Kanban (drag-and-drop),
  // sempre pela transição canônica (validada no banco).
  async function moverEtapa(itemId: string, novaEtapa: EtapaKanban) {
    const it = itens.find((i) => i.id === itemId);
    if (!it) return;
    const r = await transicionarEtapa({
      itemId,
      etapaAtual: etapaAtualDe(it),
      novaEtapa: novaEtapa as EtapaWorkflow,
      exigeRevisao: it.exige_revisao !== false,
      responsavelId: it.responsavel_id,
    });
    if (!r.ok) return toast.error(r.erro ?? "Não foi possível mover");
    toast.success(`Etapa: ${ETAPA_LABEL[novaEtapa as EtapaWorkflow]}`);
    loadItens();
  }


  async function excluirItem(itemId: string) {
    if (!confirm("Excluir esta atividade permanentemente?")) return;
    const { error } = await supabase.from("controladoria_itens").delete().eq("id", itemId);
    if (error) return toast.error("Erro: " + error.message);
    toast.success("Item excluído");
    loadItens();
  }

  return (
    <div>
      {/* Cabeçalho editorial */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="font-display text-2xl sm:text-3xl tracking-tight">Controladoria Jurídica</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Organize a produção e acompanhe o fluxo das atividades.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="ghost" size="sm" asChild className="gap-2 text-muted-foreground hover:text-foreground">
            <Link to="/controladoria/performance"><BarChart3 className="w-4 h-4" /> Performance</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild className="gap-2 text-muted-foreground hover:text-foreground">
            <Link to="/fluxos"><Workflow className="w-4 h-4" /> Fluxos</Link>
          </Button>
          {podeCriar && (
            <Button onClick={abrirNovo} className="gap-2">
              <Plus className="w-4 h-4" /> Nova atividade
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon={<AlertTriangle className="w-4 h-4" />} label="Atrasados" value={stats.atrasados} tone="destructive" />
        <StatCard icon={<Clock className="w-4 h-4" />} label="Hoje" value={stats.hoje} tone="warning" />
        <StatCard icon={<CalendarIcon className="w-4 h-4" />} label="Próximos 7 dias" value={stats.semana} tone="primary" />
        <StatCard icon={<List className="w-4 h-4" />} label="Total ativos" value={stats.total} tone="muted" />
      </div>

      {/* Eventos desta semana */}
      <div className="mb-6">
        <EventosSemanaCard itens={itens} onSelecionar={selecionarItem} />
      </div>

      {/* Filtros */}
      <div className="rounded-xl border border-border/70 bg-card p-3 mb-4 flex flex-col lg:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar atividade, cliente ou processo..."
            className="pl-9 bg-background"
          />
        </div>
        <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v as FiltroTipo)}>
          <SelectTrigger className="w-full lg:w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {Object.entries(TIPO_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroPrioridade} onValueChange={(v) => setFiltroPrioridade(v as FiltroPrioridade)}>
          <SelectTrigger className="w-full lg:w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas prioridades</SelectItem>
            {Object.entries(PRIORIDADE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Chips de responsável */}
      {equipe.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          <ChipResp
            ativo={filtroResponsavel === "todos"}
            onClick={() => setFiltroResponsavel("todos")}
            label="Todos"
          />
          {equipe.map((m) => {
            const count = itens.filter((i) => i.responsavel_id === m.id && i.status !== "concluido" && i.status !== "cancelado").length;
            return (
              <ChipResp
                key={m.id}
                ativo={filtroResponsavel === m.id}
                onClick={() => setFiltroResponsavel(m.id)}
                label={m.nome.split(" ")[0]}
                avatarId={m.id}
                avatarNome={m.nome}
                count={count}
                isMine={m.id === user?.id}
              />
            );
          })}
          {itens.some((i) => !i.responsavel_id) && (
            <ChipResp
              ativo={filtroResponsavel === "sem"}
              onClick={() => setFiltroResponsavel("sem")}
              label="Sem responsável"
              count={itens.filter((i) => !i.responsavel_id).length}
            />
          )}
        </div>
      )}

      {/* Conteúdo */}
      <Tabs defaultValue="kanban" className="space-y-4">
        <TabsList>
          <TabsTrigger value="kanban" className="gap-2"><LayoutGrid className="w-4 h-4" />Quadro</TabsTrigger>
          <TabsTrigger value="agenda" className="gap-2"><List className="w-4 h-4" />Lista</TabsTrigger>
        </TabsList>


        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <TabsContent value="agenda" className="space-y-6">
              {isGestor && <PendenciasProducaoCard />}
              {filtrados.length === 0 && <EmptyState onNovo={podeCriar ? abrirNovo : undefined} />}
              <Grupo titulo="Atrasados" itens={grupos.atrasados} tone="destructive" onSelect={selecionarItem} onAcaoBia={loadItens} currentUserId={user?.id} />
              <Grupo titulo="Hoje" itens={grupos.hoje} tone="warning" onSelect={selecionarItem} onAcaoBia={loadItens} currentUserId={user?.id} />
              <Grupo titulo="Amanhã" itens={grupos.amanha} onSelect={selecionarItem} onAcaoBia={loadItens} currentUserId={user?.id} />
              <Grupo titulo="Esta semana" itens={grupos.semana} onSelect={selecionarItem} onAcaoBia={loadItens} currentUserId={user?.id} />
              <Grupo titulo="Próximos" itens={grupos.proximos} onSelect={selecionarItem} onAcaoBia={loadItens} currentUserId={user?.id} />
              <Grupo titulo="Concluídos" itens={grupos.concluidos} muted onSelect={selecionarItem} onAcaoBia={loadItens} currentUserId={user?.id} collapsed={!concluidosExpandido} onToggleExpand={() => setConcluidosExpandido((v) => !v)} onDelete={excluirItem} podeExcluir={podeExcluir} />
            </TabsContent>

            <TabsContent value="kanban">
              <KanbanBoard
                itens={filtrados}
                equipe={equipe}
                podeEditar={podeEditar}
                onMover={moverItem}
                onMoverEtapa={moverEtapa}
                onSelect={selecionarItem}
                currentUserId={user?.id}
                fullscreen={kanbanFullscreen}
                onToggleFullscreen={() => setKanbanFullscreen((v) => !v)}
                onNovo={podeCriar ? abrirNovo : undefined}

              />
            </TabsContent>
          </>
        )}
      </Tabs>

      <ItemFormDialog
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) setEditandoItem(null); }}
        item={editandoItem}
        onSaved={loadItens}
      />

      <ItemDetalheSheet
        itemId={selecionadoId}
        onOpenChange={fecharDetalhe}
        onEdit={abrirEdicao}
        onChanged={loadItens}
      />
    </div>
  );
}

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: "destructive" | "warning" | "primary" | "muted" }) {
  const toneClass = {
    destructive: "bg-destructive/10 text-destructive border-destructive/20",
    warning: "bg-warning/10 text-warning border-warning/20",
    primary: "bg-primary/10 text-primary border-primary/20",
    muted: "bg-muted text-muted-foreground border-border",
  }[tone];
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn("w-9 h-9 rounded-md border flex items-center justify-center shrink-0", toneClass)}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-semibold leading-none">{value}</p>
          <p className="text-xs text-muted-foreground mt-1">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ChipResp({ ativo, onClick, label, count, avatarId, avatarNome, isMine }: {
  ativo: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  avatarId?: string;
  avatarNome?: string;
  isMine?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
        ativo
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card hover:bg-accent/50 border-border text-foreground",
        isMine && !ativo && "ring-1 ring-gold/40",
      )}
    >
      {avatarId && (
        <ResponsavelAvatar nome={avatarNome ?? label} id={avatarId} size="xs" showTooltip={false} />
      )}
      <span className="font-medium">{label}</span>
      {typeof count === "number" && (
        <span className={cn(
          "rounded-full px-1.5 py-0 text-[10px] leading-tight",
          ativo ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
        )}>
          {count}
        </span>
      )}
    </button>
  );
}

function Grupo({ titulo, itens, tone, muted, onSelect, onAcaoBia, currentUserId, collapsed, onToggleExpand, onDelete, podeExcluir }: { titulo: string; itens: ControladoriaItem[]; tone?: "destructive" | "warning"; muted?: boolean; onSelect: (id: string) => void; onAcaoBia: () => void; currentUserId?: string; collapsed?: boolean; onToggleExpand?: () => void; onDelete?: (id: string) => void; podeExcluir?: boolean }) {
  if (itens.length === 0) return null;
  const titleClass = tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-warning" : muted ? "text-muted-foreground" : "text-foreground";
  const isCollapsible = !!onToggleExpand;
  return (
    <div>
      <button
        type="button"
        onClick={isCollapsible ? onToggleExpand : undefined}
        className={cn("flex items-center gap-3 mb-3 w-full", isCollapsible && "cursor-pointer hover:opacity-80")}
      >
        {isCollapsible && (
          collapsed ? <ChevronRight className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
        <h2 className={cn("text-sm font-semibold uppercase tracking-wider", titleClass)}>{titulo}</h2>
        <Badge variant="secondary" className="h-5">{itens.length}</Badge>
        <div className="flex-1 h-px bg-border" />
      </button>
      {!collapsed && (
        <div className="space-y-2">
          {itens.map((it) => <ItemRow key={it.id} item={it} onClick={() => onSelect(it.id)} onAcaoBia={onAcaoBia} currentUserId={currentUserId} onDelete={onDelete} podeExcluir={podeExcluir} />)}
        </div>
      )}
    </div>
  );
}

function ItemRow({ item, onClick, onAcaoBia, currentUserId, onDelete, podeExcluir }: { item: ControladoriaItem; onClick: () => void; onAcaoBia: () => void; currentUserId?: string; onDelete?: (id: string) => void; podeExcluir?: boolean }) {
  const venc = new Date(item.data_vencimento);
  const atrasado = isPast(venc) && !isToday(venc) && item.status !== "concluido";
  const isMine = !!currentUserId && item.responsavel_id === currentUserId;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter") onClick(); }}
      className={cn(
        "w-full text-left rounded-lg border bg-card hover:bg-accent/40 transition-colors p-3 flex items-start gap-3 cursor-pointer",
        atrasado && "border-destructive/30",
        isMine && !atrasado && "border-gold/40 ring-1 ring-gold/20",
      )}
    >
      <div className={cn("w-1 self-stretch rounded-full shrink-0",
        item.prioridade === "urgente" ? "bg-destructive" :
        item.prioridade === "alta" ? "bg-warning" :
        item.prioridade === "media" ? "bg-primary" : "bg-muted-foreground/30"
      )} />
      <ResponsavelAvatar
        nome={item.responsavel?.nome ?? null}
        id={item.responsavel_id ?? undefined}
        size="md"
      />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <TipoBadge tipo={item.tipo} />
          <Badge variant="outline" className={cn("text-[10px] py-0 h-5", STATUS_CLASS[item.status])}>{STATUS_LABELS[item.status]}</Badge>
          {!item.responsavel_id && (
            <Badge variant="outline" className="text-[10px] py-0 h-5 border-warning/40 text-warning">Sem responsável</Badge>
          )}
        </div>
        <p className="text-sm font-medium truncate">{item.titulo}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-1">
          <span>{item.tipo === "audiencia" ? formatDateTime(item.data_vencimento) : formatDate(item.data_vencimento)}</span>
          {item.responsavel?.nome && <span>· {item.responsavel.nome.split(" ")[0]}</span>}
          {item.cliente && <span>· {item.cliente.nome}</span>}
          {item.processo?.numero_cnj && <span>· {item.processo.numero_cnj}</span>}
          {item.google_evento?.google_event_id && (
            <span className="inline-flex items-center gap-1 text-success" title={`Sincronizado com Google Calendar em ${new Date(item.google_evento.ultimo_sync).toLocaleString("pt-BR")}`}>
              <CalendarCheck className="w-3 h-3" /> Agenda
            </span>
          )}
        </div>
      </div>
      <div onClick={(e) => e.stopPropagation()} className="shrink-0 flex items-center gap-1">
        {podeExcluir && onDelete && (
          <button
            type="button"
            onClick={() => onDelete(item.id)}
            className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
            title="Excluir"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
        <BiaAcoesButton alvo="item_controladoria" id={item.id} onAcaoExecutada={onAcaoBia} />
      </div>
    </div>
  );
}


function EmptyState({ onNovo }: { onNovo?: () => void }) {
  return (
    <Card>
      <CardContent className="p-12 flex flex-col items-center text-center">
        <CalendarIcon className="w-10 h-10 text-muted-foreground/40 mb-3" />
        <p className="font-medium">Nenhum item encontrado</p>
        <p className="text-sm text-muted-foreground mt-1 mb-4">
          Cadastre prazos, audiências, tarefas e diligências para começar.
        </p>
        {onNovo && <Button onClick={onNovo} className="gap-2"><Plus className="w-4 h-4" /> Novo item</Button>}
      </CardContent>
    </Card>
  );
}
