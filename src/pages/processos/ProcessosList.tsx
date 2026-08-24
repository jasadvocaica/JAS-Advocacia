import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Search, Eye, Pencil, Trash2, Briefcase, Scale, Wifi, WifiOff, Wand2, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, LayoutGrid, List, X } from "lucide-react";
import { ProcessosKanban } from "./ProcessosKanban";
import { Checkbox } from "@/components/ui/checkbox";
import { formatBRL, formatCNJ } from "@/lib/format";
import { TRIBUNAIS } from "@/lib/datajud";
import type { ProcessoListItem, ProcessoStatus } from "./types";
import { CadastroAssistidoDialog } from "./CadastroAssistidoDialog";
import { ConsultarDatajudLoteDialog } from "@/pages/importacao-exportacao/importar/ConsultarDatajudLoteDialog";
import { StatusBadge } from "@/components/processos/StatusBadge";
import { BulkActionsBar } from "./BulkActionsBar";
import { toast } from "sonner";

export default function ProcessosList() {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const [processos, setProcessos] = useState<ProcessoListItem[]>([]);
  const [statusList, setStatusList] = useState<ProcessoStatus[]>([]);
  const [responsaveis, setResponsaveis] = useState<{ id: string; nome: string }[]>([]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("todos");
  const [filterTipo, setFilterTipo] = useState<string>("todos");
  const [searchParams] = useSearchParams();
  // Leitura segura do filtro de área vindo por query param (ex.: Painel da Juliana).
  const [filterArea, setFilterArea] = useState<string>(() => searchParams.get("area") || "todos");
  const [filterTribunal, setFilterTribunal] = useState<string>("todos");
  const [filterResponsavel, setFilterResponsavel] = useState<string>("todos");
  const [filterPeriodo, setFilterPeriodo] = useState<"todos" | "7d" | "30d" | "mes" | "ano" | "personalizado">("todos");
  const [periodoDe, setPeriodoDe] = useState<string>("");
  const [periodoAte, setPeriodoAte] = useState<string>("");
  const [showEncerrados, setShowEncerrados] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [assistidoOpen, setAssistidoOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncIds, setSyncIds] = useState<string[]>([]);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"tabela" | "kanban">(() => (localStorage.getItem("processos.view") as any) || "tabela");
  const [sortBy, setSortBy] = useState<"criado_em" | "cliente" | "valor" | "status" | "tribunal" | "data_distribuicao">("criado_em");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => { localStorage.setItem("processos.view", viewMode); }, [viewMode]);

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(col); setSortDir("asc"); }
  };
  const sortIcon = (col: typeof sortBy) => {
    if (sortBy !== col) return <ArrowUpDown className="w-3 h-3 inline ml-1 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="w-3 h-3 inline ml-1" /> : <ArrowDown className="w-3 h-3 inline ml-1" />;
  };

  const load = async () => {
    setLoading(true);
    const [{ data: ps, error }, { data: st }, { data: us }] = await Promise.all([
      supabase
        .from("processos")
        .select(`
          id, numero_cnj, numero_cnj_limpo, nb_inss, tipo, area_direito, tipo_acao, status,
          tribunal_sigla, vara, comarca, cliente_id, responsavel_id, valor_causa,
          data_distribuicao, datajud_ultima_consulta, datajud_ativo, criado_em,
          parceiro_id,
          clientes:cliente_id ( nome ),
          parceiros:parceiro_id ( id, nome, estado ),
          partes:processo_partes ( tipo, nome ),
          tags:processos_tags ( tag:tags ( id, nome, cor ) )
        `)
        .order("criado_em", { ascending: false }),
      supabase.from("processo_status").select("*").eq("ativo", true).order("ordem"),
      supabase.from("profiles").select("id, nome").eq("ativo", true).eq("tipo_portal", "interno").order("nome"),
    ]);
    if (error) toast.error("Erro ao carregar processos", { description: error.message });
    const procs = (ps ?? []) as any[];
    // Buscar última movimentação para cada processo (data + descrição)
    if (procs.length > 0) {
      const ids = procs.map((p) => p.id);
      const { data: ands } = await supabase
        .from("andamentos")
        .select("processo_id, data, descricao")
        .in("processo_id", ids)
        .order("data", { ascending: false });
      const ultimoMap = new Map<string, { data: string; descricao: string }>();
      (ands ?? []).forEach((a: any) => {
        if (!ultimoMap.has(a.processo_id)) ultimoMap.set(a.processo_id, { data: a.data, descricao: a.descricao });
      });
      procs.forEach((p) => { p.ultimo_andamento = ultimoMap.get(p.id) ?? null; });
    }
    // Mapear responsável a partir de profiles
    const respMap = new Map<string, { id: string; nome: string }>();
    (us ?? []).forEach((u: any) => respMap.set(u.id, { id: u.id, nome: u.nome }));
    procs.forEach((p) => { p.responsavel = p.responsavel_id ? respMap.get(p.responsavel_id) ?? null : null; });
    setProcessos(procs);
    setStatusList((st ?? []) as any);
    setResponsaveis((us ?? []) as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("processos").delete().eq("id", deleteId);
    if (error) toast.error("Erro ao excluir", { description: error.message });
    else { toast.success("Processo excluído"); load(); }
    setDeleteId(null);
  };

  const statusEncerrados = useMemo(
    () => new Set(["Arquivado", "Encerrado — procedente", "Encerrado — improcedente", "Cessado", "Indeferido"]),
    []
  );

  const areas = useMemo(() => Array.from(new Set(processos.map((p) => p.area_direito).filter(Boolean))).sort() as string[], [processos]);
  const tribunais = useMemo(() => Array.from(new Set(processos.map((p) => p.tribunal_sigla).filter(Boolean))).sort() as string[], [processos]);

  const periodoRange = useMemo<{ de: Date | null; ate: Date | null }>(() => {
    const now = new Date();
    const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
    const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
    if (filterPeriodo === "7d") return { de: startOfDay(new Date(now.getTime() - 7*86400000)), ate: endOfDay(now) };
    if (filterPeriodo === "30d") return { de: startOfDay(new Date(now.getTime() - 30*86400000)), ate: endOfDay(now) };
    if (filterPeriodo === "mes") return { de: new Date(now.getFullYear(), now.getMonth(), 1), ate: endOfDay(now) };
    if (filterPeriodo === "ano") return { de: new Date(now.getFullYear(), 0, 1), ate: endOfDay(now) };
    if (filterPeriodo === "personalizado") {
      return {
        de: periodoDe ? startOfDay(new Date(periodoDe + "T00:00:00")) : null,
        ate: periodoAte ? endOfDay(new Date(periodoAte + "T00:00:00")) : null,
      };
    }
    return { de: null, ate: null };
  }, [filterPeriodo, periodoDe, periodoAte]);

  const filtered = useMemo(() => {
    const arr = processos.filter((p) => {
      const q = search.toLowerCase();
      const matchSearch = !q
        || (p.numero_cnj ?? "").toLowerCase().includes(q)
        || (p.numero_cnj_limpo ?? "").includes(q.replace(/\D/g, ""))
        || (p.nb_inss ?? "").toLowerCase().includes(q)
        || (p.clientes?.nome ?? "").toLowerCase().includes(q)
        || (p.tipo_acao ?? "").toLowerCase().includes(q);
      const matchStatus = filterStatus === "todos" || p.status === filterStatus;
      const matchTipo = filterTipo === "todos" || p.tipo === filterTipo;
      const matchArea = filterArea === "todos" || p.area_direito === filterArea;
      const matchTrib = filterTribunal === "todos" || p.tribunal_sigla === filterTribunal;
      const matchResp = filterResponsavel === "todos"
        || (filterResponsavel === "sem" ? !p.responsavel_id : p.responsavel_id === filterResponsavel);
      let matchPeriodo = true;
      if (periodoRange.de || periodoRange.ate) {
        const ref = p.data_distribuicao ? new Date(p.data_distribuicao) : (p.criado_em ? new Date(p.criado_em) : null);
        if (!ref) matchPeriodo = false;
        else {
          if (periodoRange.de && ref < periodoRange.de) matchPeriodo = false;
          if (periodoRange.ate && ref > periodoRange.ate) matchPeriodo = false;
        }
      }
      const matchEncerrado = showEncerrados || !statusEncerrados.has(p.status);
      return matchSearch && matchStatus && matchTipo && matchArea && matchTrib && matchResp && matchPeriodo && matchEncerrado;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    const cmp = (a: any, b: any) => {
      const get = (p: any) => {
        switch (sortBy) {
          case "cliente": return (p.clientes?.nome ?? "").toLowerCase();
          case "valor": return p.valor_causa ?? 0;
          case "status": return p.status ?? "";
          case "tribunal": return p.tribunal_sigla ?? "";
          case "data_distribuicao": return p.data_distribuicao ?? "";
          default: return p.criado_em ?? "";
        }
      };
      const va = get(a), vb = get(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    };
    return arr.sort(cmp);
  }, [processos, search, filterStatus, filterTipo, filterArea, filterTribunal, filterResponsavel, periodoRange, showEncerrados, statusEncerrados, sortBy, sortDir]);

  const limparFiltros = () => {
    setSearch(""); setFilterStatus("todos"); setFilterTipo("todos");
    setFilterArea("todos"); setFilterTribunal("todos"); setFilterResponsavel("todos");
    setFilterPeriodo("todos"); setPeriodoDe(""); setPeriodoAte("");
    setShowEncerrados(false);
  };
  const filtrosAtivos = !!search || filterStatus !== "todos" || filterTipo !== "todos"
    || filterArea !== "todos" || filterTribunal !== "todos" || filterResponsavel !== "todos"
    || filterPeriodo !== "todos" || showEncerrados;

  const toggleSel = (id: string) => {
    setSelecionados((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const toggleTodos = () => {
    setSelecionados((prev) => {
      if (filtered.every((p) => prev.has(p.id))) {
        const n = new Set(prev);
        filtered.forEach((p) => n.delete(p.id));
        return n;
      }
      const n = new Set(prev);
      filtered.forEach((p) => n.add(p.id));
      return n;
    });
  };
  const todosSelecionados = filtered.length > 0 && filtered.every((p) => selecionados.has(p.id));
  const algunsSelecionados = !todosSelecionados && filtered.some((p) => selecionados.has(p.id));

  const statusBadge = (statusNome: string | null | undefined) => (
    <StatusBadge status={statusNome} options={statusList} size="sm" />
  );

  const datajudIndicator = (p: ProcessoListItem) => {
    if (p.tipo !== "judicial") return null;
    let icon = <Wifi className="w-3.5 h-3.5 text-muted-foreground" />;
    let label = "DataJud";
    if (!p.tribunal_sigla || !(p.tribunal_sigla in TRIBUNAIS)) {
      icon = <WifiOff className="w-3.5 h-3.5 text-muted-foreground" />;
      label = "Tribunal sem suporte DataJud";
    } else if (!p.datajud_ativo) {
      icon = <WifiOff className="w-3.5 h-3.5 text-muted-foreground" />;
      label = "Consulta DataJud desativada";
    } else if (!p.datajud_ultima_consulta) {
      label = "Nunca consultado no DataJud";
    } else {
      const dias = (Date.now() - new Date(p.datajud_ultima_consulta).getTime()) / 86400000;
      const cor = dias < 1 ? "text-success" : dias < 3 ? "text-warning" : "text-destructive";
      icon = <Wifi className={`w-3.5 h-3.5 ${cor}`} />;
      label = `DataJud · ${dias < 1 ? "atualizado hoje" : `${Math.floor(dias)} dia(s) atrás`}`;
    }
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">{icon}</span>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const parteContraria = (p: ProcessoListItem): string => {
    const partes = p.partes ?? [];
    if (partes.length === 0) return "—";
    const clienteNome = normalize(p.clientes?.nome ?? "");
    const clienteEhReu = partes.some((x) => x.tipo === "reu" && normalize(x.nome) === clienteNome);
    const alvo = clienteEhReu ? "autor" : "reu";
    const nomes = partes.filter((x) => x.tipo === alvo).map((x) => x.nome);
    if (nomes.length === 0) {
      const outros = partes.filter((x) => normalize(x.nome) !== clienteNome).map((x) => x.nome);
      return outros[0] ? (outros.length > 1 ? `${outros[0]} +${outros.length - 1}` : outros[0]) : "—";
    }
    return nomes.length > 1 ? `${nomes[0]} +${nomes.length - 1}` : nomes[0];
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Processos"
        description={`${processos.length} processo${processos.length !== 1 ? "s" : ""} cadastrado${processos.length !== 1 ? "s" : ""}`}
      >
        {hasPermission("processos", "editar") && (
          <Button
            variant="outline"
            onClick={() => {
              const ids = processos
                .filter((p) =>
                  p.tipo === "judicial"
                  && p.datajud_ativo
                  && !!p.tribunal_sigla
                  && p.tribunal_sigla in TRIBUNAIS
                  && !!p.numero_cnj_limpo,
                )
                .map((p) => p.id);
              if (ids.length === 0) {
                toast.warning("Nenhum processo elegível para sincronizar (judicial, com CNJ e tribunal suportado).");
                return;
              }
              setSyncIds(ids);
              setSyncOpen(true);
            }}
            disabled={loading}
          >
            <RefreshCw className="w-4 h-4" /> Sincronizar DataJud
          </Button>
        )}
        {hasPermission("processos", "criar") && (
          <>
            <Button variant="outline" onClick={() => setAssistidoOpen(true)}>
              <Wand2 className="w-4 h-4" /> Cadastro assistido
            </Button>
            <Button variant="gold" asChild>
              <Link to="/processos/novo"><Plus className="w-4 h-4" /> Novo processo</Link>
            </Button>
          </>
        )}
      </PageHeader>

      <CadastroAssistidoDialog open={assistidoOpen} onOpenChange={setAssistidoOpen} />
      <ConsultarDatajudLoteDialog
        open={syncOpen}
        onOpenChange={(o) => {
          setSyncOpen(o);
          if (!o) { setSyncIds([]); load(); }
        }}
        processoIds={syncIds}
      />

      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por CNJ, NB, cliente ou ação..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 justify-end">
            <div className="inline-flex rounded-md border bg-background p-0.5">
              <Button
                size="sm"
                variant={viewMode === "tabela" ? "secondary" : "ghost"}
                className="h-7 px-2"
                onClick={() => setViewMode("tabela")}
              ><List className="w-3.5 h-3.5" /> Tabela</Button>
              <Button
                size="sm"
                variant={viewMode === "kanban" ? "secondary" : "ghost"}
                className="h-7 px-2"
                onClick={() => setViewMode("kanban")}
              ><LayoutGrid className="w-3.5 h-3.5" /> Kanban</Button>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
          <Select value={filterTipo} onValueChange={setFilterTipo}>
            <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              <SelectItem value="judicial">Judicial</SelectItem>
              <SelectItem value="administrativo">Administrativo</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              {statusList.map((s) => (
                <SelectItem key={s.id} value={s.nome}>{s.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterArea} onValueChange={setFilterArea}>
            <SelectTrigger><SelectValue placeholder="Área" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as áreas</SelectItem>
              {areas.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterTribunal} onValueChange={setFilterTribunal}>
            <SelectTrigger><SelectValue placeholder="Tribunal" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tribunais</SelectItem>
              {tribunais.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterResponsavel} onValueChange={setFilterResponsavel}>
            <SelectTrigger><SelectValue placeholder="Responsável" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os responsáveis</SelectItem>
              <SelectItem value="sem">Sem responsável</SelectItem>
              {responsaveis.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterPeriodo} onValueChange={(v) => setFilterPeriodo(v as any)}>
            <SelectTrigger><SelectValue placeholder="Período" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Qualquer período</SelectItem>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="mes">Este mês</SelectItem>
              <SelectItem value="ano">Este ano</SelectItem>
              <SelectItem value="personalizado">Personalizado</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm text-muted-foreground whitespace-nowrap px-2">
            <input
              type="checkbox"
              checked={showEncerrados}
              onChange={(e) => setShowEncerrados(e.target.checked)}
              className="rounded border-border"
            />
            Mostrar encerrados
          </label>
        </div>
        {filterPeriodo === "personalizado" && (
          <div className="grid grid-cols-2 gap-2 max-w-md">
            <div>
              <label className="text-xs text-muted-foreground">De</label>
              <Input type="date" value={periodoDe} onChange={(e) => setPeriodoDe(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Até</label>
              <Input type="date" value={periodoAte} onChange={(e) => setPeriodoAte(e.target.value)} />
            </div>
          </div>
        )}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{filtered.length} de {processos.length} processo{processos.length !== 1 ? "s" : ""}</span>
          {filtrosAtivos && (
            <Button size="sm" variant="ghost" className="h-7" onClick={limparFiltros}>
              <X className="w-3 h-3" /> Limpar filtros
            </Button>
          )}
        </div>
      </Card>

      {selecionados.size > 0 && (
        <BulkActionsBar
          selecionados={Array.from(selecionados)}
          onLimpar={() => setSelecionados(new Set())}
          onAtualizar={() => { setSelecionados(new Set()); load(); }}
        />
      )}

      {viewMode === "kanban" ? (
        loading ? (
          <Card className="p-12 text-center text-muted-foreground">Carregando...</Card>
        ) : filtered.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground">Nenhum processo encontrado.</Card>
        ) : (
          <ProcessosKanban processos={filtered} statusList={statusList} />
        )
      ) : (
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={todosSelecionados ? true : algunsSelecionados ? "indeterminate" : false}
                  onCheckedChange={toggleTodos}
                />
              </TableHead>
              <TableHead className="w-12"></TableHead>
              <TableHead>Número / NB</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("cliente")}>Cliente{sortIcon("cliente")}</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Parte contrária</TableHead>
              <TableHead>Ação / Área</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("tribunal")}>Tribunal · Vara{sortIcon("tribunal")}</TableHead>
              <TableHead>Última movimentação</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Parceiro</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("valor")}>Valor{sortIcon("valor")}</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("status")}>Status{sortIcon("status")}</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={14} className="text-center py-12 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={14} className="text-center py-16">
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <Briefcase className="w-10 h-10 opacity-40" />
                    <p>Nenhum processo encontrado.</p>
                    {hasPermission("processos", "criar") && processos.length === 0 && (
                      <Button variant="outline" asChild>
                        <Link to="/processos/novo"><Plus className="w-4 h-4" /> Cadastrar primeiro processo</Link>
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : filtered.map((p: any) => {
              const sel = selecionados.has(p.id);
              const tagsRow: Array<{ id: string; nome: string; cor: string }> =
                (p.tags ?? []).map((t: any) => t.tag).filter(Boolean);
              return (
              <TableRow
                key={p.id}
                data-state={sel ? "selected" : undefined}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => navigate(`/processos/${p.id}`)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={sel} onCheckedChange={() => toggleSel(p.id)} />
                </TableCell>
                <TableCell className="text-center">{datajudIndicator(p)}</TableCell>
                <TableCell className="font-mono text-xs">
                  <div className="flex items-center gap-2">
                    <Scale className="w-3.5 h-3.5 text-primary shrink-0" />
                    <div>
                      <div className="font-semibold">{p.numero_cnj ? formatCNJ(p.numero_cnj) : (p.nb_inss ? `NB ${p.nb_inss}` : "Sem número")}</div>
                      {p.numero_cnj && p.nb_inss && <div className="text-[10px] text-muted-foreground">NB {p.nb_inss}</div>}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="font-medium">{p.clientes?.nome ?? "—"}</TableCell>
                <TableCell className="text-sm">{p.responsavel?.nome ?? <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-sm max-w-[220px] truncate" title={parteContraria(p)}>{parteContraria(p)}</TableCell>
                <TableCell className="text-sm">
                  <div>{p.tipo_acao ?? "—"}</div>
                  <div className="text-xs text-muted-foreground capitalize">{p.area_direito ?? p.tipo}</div>
                </TableCell>
                <TableCell className="text-sm">
                  <div>{p.tribunal_sigla ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{[p.vara, p.comarca].filter(Boolean).join(" · ")}</div>
                </TableCell>
                <TableCell className="text-xs max-w-[220px]">
                  {p.ultimo_andamento ? (
                    <div title={p.ultimo_andamento.descricao ?? ""}>
                      <div className="text-muted-foreground">{new Date(p.ultimo_andamento.data).toLocaleDateString("pt-BR")}</div>
                      <div className="truncate max-w-[200px]">{p.ultimo_andamento.descricao ?? "—"}</div>
                    </div>
                  ) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-xs max-w-[180px]">
                  <div className="flex flex-wrap gap-1">
                    {tagsRow.length === 0 ? <span className="text-muted-foreground">—</span> : tagsRow.map((t) => (
                      <span key={t.id}
                        className="inline-flex px-1.5 py-0.5 rounded-full border text-[10px]"
                        style={{ backgroundColor: `${t.cor}1a`, color: t.cor, borderColor: `${t.cor}55` }}>
                        {t.nome}
                      </span>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-xs">
                  {p.parceiros ? (
                    <span>{p.parceiros.nome}{p.parceiros.estado ? ` · ${p.parceiros.estado}` : ""}</span>
                  ) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-sm font-medium">{formatBRL(p.valor_causa)}</TableCell>
                <TableCell>{statusBadge(p.status)}</TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <Button size="icon" variant="ghost" asChild><Link to={`/processos/${p.id}`}><Eye className="w-4 h-4" /></Link></Button>
                  {hasPermission("processos", "editar") && (
                    <Button size="icon" variant="ghost" asChild><Link to={`/processos/${p.id}/editar`}><Pencil className="w-4 h-4" /></Link></Button>
                  )}
                  {hasPermission("processos", "excluir") && (
                    <Button size="icon" variant="ghost" onClick={() => setDeleteId(p.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  )}
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir processo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Andamentos, prazos e financeiro vinculados podem ser afetados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
