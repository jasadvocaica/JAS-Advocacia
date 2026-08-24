import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft, Pencil, Loader2, Plus, FileText, MessageSquare,
  Calendar, Trash2, Workflow, RefreshCw, Users, Handshake, DollarSign, Activity, Sparkles,
  CheckCircle2, AlertCircle, XCircle, Folder, User as UserIcon, Eye,
} from "lucide-react";
import ChecklistDiligenciasTab from "./ChecklistDiligenciasTab";
import ClienteVeTab from "./ClienteVeTab";
import { LinhaDoTempoProcesso } from "./LinhaDoTempoProcesso";
import { formatBRL, formatCNJ, formatDate, formatDateTime } from "@/lib/format";
import { TRIBUNAIS } from "@/lib/datajud";
import { toast } from "sonner";
import { AplicarFluxoDialog } from "@/pages/fluxos/AplicarFluxoDialog";
import { DataJudErrorBanner } from "@/components/DataJudErrorBanner";
import ItemFormDialog from "@/pages/controladoria/ItemFormDialog";
import { StatusBadge } from "@/components/processos/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import {
  TIPO_LABELS as CTRL_TIPO_LABELS,
  STATUS_LABELS as CTRL_STATUS_LABELS,
  PRIORIDADE_LABELS as CTRL_PRIO_LABELS,
  TIPO_CLASS as CTRL_TIPO_CLASS,
  STATUS_CLASS as CTRL_STATUS_CLASS,
  PRIORIDADE_CLASS as CTRL_PRIO_CLASS,
  type ControladoriaItem,
} from "@/pages/controladoria/types";

interface Processo {
  id: string;
  numero_cnj: string | null;
  numero_cnj_limpo: string | null;
  nb_inss: string | null;
  tipo: "judicial" | "administrativo";
  area_direito: string | null;
  tipo_acao: string | null;
  status: string;
  fase_atual: string | null;
  fase_administrativa: string | null;
  valor_causa: number | null;
  data_distribuicao: string | null;
  data_der: string | null;
  data_encerramento: string | null;
  dib: string | null;
  dcb: string | null;
  vara: string | null;
  comarca: string | null;
  tribunal: string | null;
  tribunal_sigla: string | null;
  tribunal_nome: string | null;
  juiz: string | null;
  instancia: string | null;
  observacoes_internas: string | null;
  cliente_id: string;
  responsavel_id: string | null;
  parceiro_id: string | null;
  datajud_ultima_consulta: string | null;
  datajud_ultimo_erro: string | null;
  datajud_ativo: boolean;
  ultima_atualizacao_andamento: string | null;
  criado_em: string;
  criado_por: string | null;
  clientes?: { id: string; nome: string; cpf_cnpj: string | null } | null;
}

interface Andamento {
  id: string;
  data: string;
  fonte: string;
  descricao: string;
  codigo_movimento: number | null;
  gera_acao: boolean;
  acao_gerada_tipo: string | null;
  acao_gerada_id: string | null;
  criado_em: string;
}

interface Parte {
  id: string;
  tipo: string;
  nome: string;
  cpf_cnpj: string | null;
  advogado_nome: string | null;
  advogado_oab: string | null;
  origem: string;
}

interface ProcessoStatusOpt { id: string; nome: string; cor: string; tipo_processo: string }

export default function ProcessoDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission, user } = useAuth();
  const [proc, setProc] = useState<Processo | null>(null);
  const [andamentos, setAndamentos] = useState<Andamento[]>([]);
  const [partes, setPartes] = useState<Parte[]>([]);
  const [statusList, setStatusList] = useState<ProcessoStatusOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [novoAndamento, setNovoAndamento] = useState({ data: new Date().toISOString().slice(0, 10), descricao: "" });
  const [openDialog, setOpenDialog] = useState(false);
  const [openFluxo, setOpenFluxo] = useState(false);
  const [savingAnd, setSavingAnd] = useState(false);
  const [consultando, setConsultando] = useState(false);
  const [datajudErro, setDatajudErro] = useState<string | null>(null);
  const [filtroFonte, setFiltroFonte] = useState<"todos" | "manual" | "datajud" | "tjmt_direto" | "pje_direto">("todos");
  const [sincronizandoTrib, setSincronizandoTrib] = useState(false);
  const [syncStage, setSyncStage] = useState<string | null>(null);
  const [ctrlItens, setCtrlItens] = useState<ControladoriaItem[]>([]);
  const [ctrlOpen, setCtrlOpen] = useState(false);
  const [ctrlEditando, setCtrlEditando] = useState<ControladoriaItem | null>(null);
  const [pessoas, setPessoas] = useState<{ responsavel: string | null; criadoPor: string | null }>({
    responsavel: null,
    criadoPor: null,
  });

  const loadCtrlItens = async () => {
    const { data } = await supabase
      .from("controladoria_itens")
      .select("*")
      .eq("processo_id", id!)
      .order("data_vencimento", { ascending: true, nullsFirst: false });
    setCtrlItens((data ?? []) as any);
  };

  const loadAll = async () => {
    setLoading(true);
    const [{ data: p }, { data: a }, { data: parts }, { data: st }] = await Promise.all([
      supabase.from("processos").select(`*, clientes:cliente_id ( id, nome, cpf_cnpj )`).eq("id", id!).maybeSingle(),
      supabase.from("andamentos").select("*").eq("processo_id", id!).order("data", { ascending: false }),
      supabase.from("processo_partes").select("*").eq("processo_id", id!),
      supabase.from("processo_status").select("id, nome, cor, tipo_processo").eq("ativo", true).order("ordem"),
    ]);
    if (!p) { toast.error("Processo não encontrado"); navigate("/processos"); return; }
    setProc(p as any);
    setAndamentos((a ?? []) as any);
    setPartes((parts ?? []) as any);
    setStatusList((st ?? []) as any);

    // Resolve nomes do responsável e de quem criou o processo
    const userIds = [(p as any).responsavel_id, (p as any).criado_por].filter(Boolean) as string[];
    if (userIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, nome")
        .in("id", userIds);
      const map = new Map((profs ?? []).map((pr: any) => [pr.id, pr.nome]));
      setPessoas({
        responsavel: (p as any).responsavel_id ? map.get((p as any).responsavel_id) ?? null : null,
        criadoPor: (p as any).criado_por ? map.get((p as any).criado_por) ?? null : null,
      });
    } else {
      setPessoas({ responsavel: null, criadoPor: null });
    }

    await loadCtrlItens();
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, [id]);

  const handleAddAndamento = async () => {
    if (!novoAndamento.descricao.trim()) { toast.error("Descreva o andamento"); return; }
    setSavingAnd(true);
    const { error } = await supabase.from("andamentos").insert({
      processo_id: id!,
      data: novoAndamento.data,
      descricao: novoAndamento.descricao,
      fonte: "manual",
      criado_por: user?.id,
    });
    setSavingAnd(false);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Andamento adicionado");
    setNovoAndamento({ data: new Date().toISOString().slice(0, 10), descricao: "" });
    setOpenDialog(false);
    loadAll();
  };

  const handleDeleteAndamento = async (andId: string) => {
    const { error } = await supabase.from("andamentos").delete().eq("id", andId);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Andamento removido");
    loadAll();
  };

  const handleStatusChange = async (novoStatus: string): Promise<void> => {
    if (!proc) return;
    const encerrados = ["Arquivado", "Encerrado — procedente", "Encerrado — improcedente", "Cessado", "Indeferido"];
    const update: any = { status: novoStatus };
    if (encerrados.includes(novoStatus)) {
      update.datajud_ativo = false;
      update.data_encerramento = new Date().toISOString().slice(0, 10);
    }
    const { error } = await supabase.from("processos").update(update).eq("id", proc.id);
    if (error) { toast.error("Erro", { description: error.message }); return; }
    toast.success("Status atualizado");
    loadAll();
  };

  const invokeDataJud = async () => {
    if (!proc) throw new Error("Processo indisponível");
    const { data, error } = await supabase.functions.invoke("datajud-consulta", {
      body: { modo: "processo_unico", processo_id: proc.id },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data as { novos_andamentos: number; acoes_geradas: number };
  };

  const handleConsultarDataJud = async () => {
    if (!proc) return;
    setConsultando(true);
    setDatajudErro(null);
    const isAuthError = (msg: string) => /401|unauthorized|authenticate|api[\s_-]?key|security_exception/i.test(msg);
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    try {
      let attempt = 0;
      let lastErr: unknown = null;
      while (attempt < 2) {
        try {
          const data = await invokeDataJud();
          if (attempt > 0) {
            toast.success("Reconectado ao DataJud", {
              description: "A consulta funcionou após nova tentativa.",
            });
          }
          toast.success("DataJud consultado", {
            description: `${data.novos_andamentos} novo(s) andamento(s) · ${data.acoes_geradas} ação(ões) automática(s)`,
          });
          loadAll();
          return;
        } catch (err: any) {
          lastErr = err;
          const msg = err?.message ?? String(err);
          if (attempt === 0 && isAuthError(msg)) {
            toast.message("Chave DataJud rejeitada — tentando novamente…", {
              description: "Se a chave foi rotacionada agora, esta segunda tentativa pode capturar o novo valor.",
            });
            await sleep(1500);
            attempt += 1;
            continue;
          }
          throw err;
        }
      }
      throw lastErr;
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      setDatajudErro(msg);
      toast.error("Erro ao consultar DataJud", { description: msg });
    } finally {
      setConsultando(false);
    }
  };

  // Detecta se o tribunal tem scraper direto disponível (TJMT, TRF1, TRF3)
  const tribunalSuportaScraper = (cnjLimpo: string | null): boolean => {
    if (!cnjLimpo || !/^\d{20}$/.test(cnjLimpo)) return false;
    const seg = cnjLimpo[13];
    const tt = cnjLimpo.slice(14, 16);
    return (seg === "8" && tt === "11") || (seg === "4" && (tt === "01" || tt === "03"));
  };

  // Botão único: tenta scraper direto primeiro; se não suporta, vai direto para DataJud.
  // Se o scraper falhar, ele já cai em fallback DataJud internamente.
  const handleSincronizar = async () => {
    if (!proc) return;
    setSincronizandoTrib(true);
    setSyncStage(null);
    try {
      if (tribunalSuportaScraper(proc.numero_cnj_limpo)) {
        setSyncStage(`Buscando no ${proc.tribunal_sigla ?? "tribunal"}…`);
        const { data, error } = await supabase.functions.invoke("scraper-tribunais", {
          body: { modo: "processo_unico", processo_id: proc.id },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        const status = data?.status as string;
        const novos = data?.novos_andamentos ?? 0;
        if (status === "captcha_bloqueado") {
          toast.warning("Tribunal bloqueou a consulta", {
            description: "CAPTCHA detectado — tentaremos novamente no próximo ciclo.",
          });
        } else if (status === "fallback_datajud") {
          toast.info("Tribunal indisponível — usei DataJud", {
            description: `${novos} novo(s) andamento(s) via fallback`,
          });
        } else if (status === "erro") {
          toast.warning("Tribunal indisponível", {
            description: "Falha no scraper direto e no fallback DataJud. Tentaremos no próximo ciclo.",
          });
        } else if (novos > 0) {
          toast.success(`${novos} novo(s) andamento(s) encontrado(s)`);
        } else {
          toast.success("Já atualizado", { description: "Nenhum andamento novo." });
        }
      } else {
        // Sem scraper direto: usa DataJud
        setSyncStage("Consultando DataJud…");
        const data = await invokeDataJud();
        const novos = data?.novos_andamentos ?? 0;
        if (novos > 0) {
          toast.success(`${novos} novo(s) andamento(s) encontrado(s)`, {
            description: `${data?.acoes_geradas ?? 0} ação(ões) automática(s)`,
          });
        } else {
          toast.success("Já atualizado", { description: "Nenhum andamento novo no DataJud." });
        }
      }
      loadAll();
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      setDatajudErro(msg);
      toast.error("Erro ao sincronizar", { description: msg });
    } finally {
      setSincronizandoTrib(false);
      setSyncStage(null);
    }
  };


  if (loading || !proc) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  const status = statusList.find((s) => s.nome === proc.status);
  const tribunalSuporta = proc.tribunal_sigla && proc.tribunal_sigla in TRIBUNAIS;
  const podeConsultar = proc.tipo === "judicial" && tribunalSuporta && proc.numero_cnj_limpo;
  const andamentosFiltrados = andamentos.filter((a) =>
    filtroFonte === "todos" || a.fonte === filtroFonte
  );

  // Card lateral: última movimentação e próximo prazo
  const ultimaMov = andamentos[0] ?? null;
  const proximoPrazo = ctrlItens
    .filter((it) => ["pendente", "em_andamento", "aguardando"].includes(it.status) && !!it.data_vencimento)
    .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento))[0] ?? null;
  const diasParaPrazo = proximoPrazo
    ? Math.ceil((new Date(proximoPrazo.data_vencimento).getTime() - Date.now()) / 86400000)
    : null;

  // Header estilo Astrea: "Autor x Réu"
  const autorNome = proc.clientes?.nome ?? "Cliente";
  const reuNome = partes.find((p) => p.tipo === "reu")?.nome ?? null;
  const tituloProcesso = reuNome ? `${autorNome} x ${reuNome}` : (proc.tipo_acao || autorNome);
  const sincronizando = sincronizandoTrib || consultando;

  return (
    <div className="space-y-6">
      {/* ========== HEADER estilo Astrea ========== */}
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <h1 className="font-display text-2xl sm:text-3xl leading-tight tracking-tight min-w-0">
            {tituloProcesso}
          </h1>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" asChild>
              <Link to="/processos"><ArrowLeft className="w-4 h-4" /> Voltar</Link>
            </Button>
            {hasPermission("controladoria", "criar") && (
              <Button variant="outline" size="sm" onClick={() => setOpenFluxo(true)}>
                <Workflow className="w-4 h-4" /> Aplicar fluxo
              </Button>
            )}
            {hasPermission("processos", "editar") && (
              <Button variant="gold" size="sm" asChild>
                <Link to={`/processos/${proc.id}/editar`}><Pencil className="w-4 h-4" /> Editar</Link>
              </Button>
            )}
          </div>
        </div>

        {/* Meta em formato "label: valor" */}
        <dl className="text-sm space-y-1">
          {(proc.numero_cnj || proc.nb_inss) && (
            <div className="flex flex-wrap items-baseline gap-x-2">
              <dt className="text-muted-foreground">Processo</dt>
              <dd className="font-medium underline decoration-muted-foreground/40 underline-offset-2">
                {proc.numero_cnj ? formatCNJ(proc.numero_cnj) : `NB ${proc.nb_inss}`}
              </dd>
            </div>
          )}
          <div className="flex flex-wrap items-baseline gap-x-2">
            <dt className="text-muted-foreground">Cliente:</dt>
            <dd className="font-medium">
              <Link to={`/clientes/${proc.clientes?.id}`} className="hover:text-primary">
                {autorNome}
              </Link>
            </dd>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <dt className="text-muted-foreground">Status:</dt>
            <dd className="font-medium inline-flex items-center gap-1.5">
              {proc.status}
              {proc.tipo === "judicial" && (
                sincronizando ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                ) : (
                  <RefreshCw
                    className="w-3.5 h-3.5 text-success cursor-pointer hover:text-primary transition-colors"
                    onClick={handleSincronizar}
                    aria-label="Sincronizar andamentos"
                  />
                )
              )}
            </dd>
          </div>
          {pessoas.responsavel && (
            <div className="flex flex-wrap items-baseline gap-x-2">
              <dt className="text-muted-foreground">Responsável:</dt>
              <dd className="font-medium uppercase tracking-wide">{pessoas.responsavel}</dd>
            </div>
          )}
          {pessoas.criadoPor && (
            <div className="flex flex-wrap items-baseline gap-x-2">
              <dt className="text-muted-foreground">Criado por:</dt>
              <dd className="font-medium uppercase tracking-wide">{pessoas.criadoPor}</dd>
            </div>
          )}
        </dl>
      </div>


      <AplicarFluxoDialog
        open={openFluxo}
        onOpenChange={setOpenFluxo}
        processoId={proc.id}
        clienteId={proc.cliente_id}
      />

      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] xl:grid-cols-[280px_1fr] gap-4">
        {/* Card lateral compacto */}
        <Card className="p-3 space-y-2.5 md:sticky md:top-4 self-start text-sm min-w-0">
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Cliente</div>
            <Link to={`/clientes/${proc.clientes?.id}`} className="font-medium hover:text-primary inline-flex items-center gap-1.5 leading-tight">
              <UserIcon className="w-3.5 h-3.5" /> {proc.clientes?.nome ?? "—"}
            </Link>
          </div>

          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Status</div>
            {hasPermission("processos", "editar") ? (
              <StatusBadge
                status={proc.status}
                options={statusList}
                editable
                tipoProcesso={proc.tipo}
                onChange={handleStatusChange}
              />
            ) : (
              <StatusBadge status={proc.status} options={statusList} />
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Tipo</div>
              <Badge variant="secondary" className="capitalize text-[10px] h-5">{proc.tipo}</Badge>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Área</div>
              <div className="text-xs font-medium leading-tight">{proc.area_direito ?? "—"}</div>
            </div>
          </div>

          {proc.tipo === "judicial" ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Tribunal</div>
                <div className="text-xs font-medium leading-tight">{proc.tribunal_sigla ?? proc.tribunal_nome ?? proc.tribunal ?? "—"}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Vara</div>
                <div className="text-xs leading-tight">{proc.vara ?? "—"}</div>
                {proc.juiz && <div className="text-[10px] text-muted-foreground leading-tight truncate" title={proc.juiz}>{proc.juiz}</div>}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">DER</div>
                <div className="text-xs font-medium">{formatDate(proc.data_der)}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Fase adm.</div>
                <div className="text-xs leading-tight">{proc.fase_administrativa ?? "—"}</div>
              </div>
            </div>
          )}

          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Valor da causa</div>
            <div className="font-semibold text-sm flex items-center gap-1"><DollarSign className="w-3.5 h-3.5 text-gold" />{formatBRL(proc.valor_causa)}</div>
          </div>

          {/* Última movimentação */}
          <div className="pt-2 border-t border-border">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Última movimentação</div>
            {ultimaMov ? (
              <>
                <div className="text-[11px] font-medium leading-tight">{formatDate(ultimaMov.data)}</div>
                <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2" title={ultimaMov.descricao}>
                  {ultimaMov.descricao}
                </p>
              </>
            ) : (
              <div className="text-[11px] text-muted-foreground italic">Sem andamentos.</div>
            )}
          </div>

          {/* Próximo prazo */}
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Próximo prazo</div>
            {proximoPrazo ? (
              <button
                type="button"
                onClick={() => { setCtrlEditando(proximoPrazo); setCtrlOpen(true); }}
                className="w-full text-left group"
              >
                <div className="flex items-center gap-1.5">
                  <Calendar className={`w-3 h-3 ${diasParaPrazo !== null && diasParaPrazo < 0 ? "text-destructive" : diasParaPrazo !== null && diasParaPrazo <= 2 ? "text-warning" : "text-muted-foreground"}`} />
                  <span className="text-[11px] font-medium leading-tight group-hover:text-primary">
                    {formatDate(proximoPrazo.data_vencimento)}
                  </span>
                  {diasParaPrazo !== null && (
                    <Badge
                      variant="outline"
                      className={`text-[9px] h-4 px-1 ${diasParaPrazo < 0 ? "border-destructive/40 text-destructive" : diasParaPrazo <= 2 ? "border-warning/40 text-warning" : "border-border text-muted-foreground"}`}
                    >
                      {diasParaPrazo < 0 ? `${Math.abs(diasParaPrazo)}d atraso` : diasParaPrazo === 0 ? "hoje" : `em ${diasParaPrazo}d`}
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug line-clamp-1" title={proximoPrazo.titulo}>
                  {proximoPrazo.titulo}
                </p>
              </button>
            ) : (
              <div className="text-[11px] text-muted-foreground italic">Sem prazos pendentes.</div>
            )}
          </div>

          {proc.tipo === "judicial" && (
            <div className="pt-2 border-t border-border space-y-1.5">
              {(() => {
                const ts = proc.datajud_ultima_consulta ?? proc.ultima_atualizacao_andamento;
                const ageH = ts ? (Date.now() - new Date(ts).getTime()) / 3.6e6 : null;
                const sincronizando = sincronizandoTrib || consultando;
                const habilitado = !!proc.numero_cnj_limpo;
                return (
                  <>
                    <Button
                      variant="gold"
                      size="sm"
                      className="w-full h-8 text-xs"
                      disabled={!habilitado || sincronizando}
                      onClick={handleSincronizar}
                      title={
                        tribunalSuportaScraper(proc.numero_cnj_limpo)
                          ? "Tenta primeiro o tribunal direto e cai para DataJud se falhar"
                          : "Consulta o DataJud (CNJ)"
                      }
                    >
                      {sincronizando
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <RefreshCw className="w-3.5 h-3.5" />}
                      {sincronizando ? "Sincronizando…" : "Sincronizar andamentos"}
                    </Button>

                    {/* Indicador de status */}
                    {sincronizando && syncStage ? (
                      <p className="text-[10px] text-primary flex items-center gap-1.5 leading-tight">
                        <Loader2 className="w-3 h-3 animate-spin" /> {syncStage}
                      </p>
                    ) : !habilitado ? (
                      <p className="text-[10px] text-muted-foreground">Cadastre o CNJ para habilitar.</p>
                    ) : !ts ? (
                      <p className="text-[10px] text-destructive flex items-center gap-1 leading-tight">
                        <XCircle className="w-3 h-3" />
                        Nunca sincronizado — clique para buscar
                      </p>
                    ) : ageH !== null && ageH > 24 ? (
                      <p className="text-[10px] text-destructive flex items-center gap-1 leading-tight" title={formatDateTime(ts)}>
                        <XCircle className="w-3 h-3" />
                        Última sync há mais de 24h
                      </p>
                    ) : ageH !== null && ageH > 8 ? (
                      <p className="text-[10px] text-warning flex items-center gap-1 leading-tight" title={formatDateTime(ts)}>
                        <AlertCircle className="w-3 h-3" />
                        Atualizado há {Math.round(ageH)}h
                      </p>
                    ) : (
                      <p className="text-[10px] text-success flex items-center gap-1 leading-tight" title={formatDateTime(ts)}>
                        <CheckCircle2 className="w-3 h-3" />
                        Atualizado há {ageH !== null && ageH < 1 ? "menos de 1h" : `${Math.round(ageH ?? 0)}h`}
                      </p>
                    )}

                    {(datajudErro || proc.datajud_ultimo_erro) && (
                      <DataJudErrorBanner
                        message={datajudErro ?? proc.datajud_ultimo_erro ?? ""}
                        onRetry={handleSincronizar}
                        retrying={sincronizando}
                        compact
                      />
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </Card>

        {/* Conteúdo: 3 grupos de abas (Histórico / Gestão / IA & Checklist) */}
        <div className="min-w-0">
          <Tabs defaultValue="historico">
            <TabsList className="grid grid-cols-4 w-full max-w-2xl h-auto p-1">
              <TabsTrigger value="historico" className="text-xs"><Activity className="w-3.5 h-3.5 mr-1" /> Histórico</TabsTrigger>
              <TabsTrigger value="gestao" className="text-xs"><Calendar className="w-3.5 h-3.5 mr-1" /> Gestão</TabsTrigger>
              <TabsTrigger value="ia" className="text-xs"><Sparkles className="w-3.5 h-3.5 mr-1" /> IA & Checklist</TabsTrigger>
              <TabsTrigger value="cliente" className="text-xs"><Eye className="w-3.5 h-3.5 mr-1" /> Cliente vê</TabsTrigger>
            </TabsList>

            {/* ========== GRUPO HISTÓRICO ========== */}
            <TabsContent value="historico" className="mt-4">
              <Tabs defaultValue="timeline">
                <TabsList className="flex flex-wrap h-auto gap-0.5 p-0.5">
                  <TabsTrigger value="timeline" className="text-xs px-2 py-1"><Activity className="w-3.5 h-3.5 mr-1" /> Linha do tempo</TabsTrigger>
                  <TabsTrigger value="andamentos" className="text-xs px-2 py-1"><MessageSquare className="w-3.5 h-3.5 mr-1" /> Andamentos ({andamentos.length})</TabsTrigger>
                </TabsList>

            {/* Linha do tempo unificada */}
            <TabsContent value="timeline" className="mt-4">
              <LinhaDoTempoProcesso processoId={proc.id} />
            </TabsContent>

            {/* Andamentos */}
            <TabsContent value="andamentos" className="space-y-4 mt-4">
              <div className="flex justify-between items-center gap-3 flex-wrap">
                <Select value={filtroFonte} onValueChange={(v: any) => setFiltroFonte(v)}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas as fontes</SelectItem>
                    <SelectItem value="datajud">Só DataJud</SelectItem>
                    <SelectItem value="tjmt_direto">Só TJMT direto</SelectItem>
                    <SelectItem value="pje_direto">Só PJe direto</SelectItem>
                    <SelectItem value="pdpj_pdf">Só PDPJ (PDF)</SelectItem>
                    <SelectItem value="manual">Só manuais</SelectItem>
                  </SelectContent>
                </Select>
                {hasPermission("processos", "criar") && (
                  <Dialog open={openDialog} onOpenChange={setOpenDialog}>
                    <DialogTrigger asChild>
                      <Button variant="gold"><Plus className="w-4 h-4" /> Novo andamento</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Adicionar andamento</DialogTitle></DialogHeader>
                      <div className="space-y-4 py-2">
                        <div className="space-y-2">
                          <Label>Data</Label>
                          <Input type="date" value={novoAndamento.data} onChange={(e) => setNovoAndamento({ ...novoAndamento, data: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Descrição</Label>
                          <Textarea rows={4} value={novoAndamento.descricao} onChange={(e) => setNovoAndamento({ ...novoAndamento, descricao: e.target.value })} placeholder="Ex: Juntada de petição inicial" />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setOpenDialog(false)}>Cancelar</Button>
                        <Button variant="gold" onClick={handleAddAndamento} disabled={savingAnd}>
                          {savingAnd ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>

              {/* Tabela de andamentos extraídos do CNJ (PDPJ + DataJud) */}
              {(() => {
                const extraidos = andamentos.filter(
                  (a) => a.fonte === "pdpj_pdf" || a.fonte === "datajud",
                );
                if (extraidos.length === 0) return null;
                return (
                  <Card className="overflow-hidden">
                    <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <h3 className="text-sm font-semibold">
                          Andamentos extraídos do CNJ
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {proc.numero_cnj
                            ? `CNJ ${formatCNJ(proc.numero_cnj)}`
                            : "Sem CNJ"}
                          {" · "}
                          {extraidos.length} registro(s)
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Badge variant="secondary" className="text-[10px]">
                          PDPJ:{" "}
                          {extraidos.filter((a) => a.fonte === "pdpj_pdf").length}
                        </Badge>
                        <Badge variant="default" className="text-[10px]">
                          DataJud:{" "}
                          {extraidos.filter((a) => a.fonte === "datajud").length}
                        </Badge>
                      </div>
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      <Table>
                        <TableHeader className="sticky top-0 bg-card z-10">
                          <TableRow>
                            <TableHead className="w-28">Data</TableHead>
                            <TableHead className="w-24">Fonte</TableHead>
                            <TableHead className="w-20">Código</TableHead>
                            <TableHead>Descrição</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {extraidos.map((a) => (
                            <TableRow key={a.id}>
                              <TableCell className="text-xs whitespace-nowrap">
                                {formatDate(a.data)}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    a.fonte === "datajud" ? "default" : "secondary"
                                  }
                                  className="text-[10px]"
                                >
                                  {a.fonte === "datajud" ? "DataJud" : "PDPJ"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {a.codigo_movimento ?? "—"}
                              </TableCell>
                              <TableCell className="text-xs whitespace-pre-wrap">
                                {a.descricao}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </Card>
                );
              })()}

              {andamentosFiltrados.length === 0 ? (
                <Card>
                  <EmptyState
                    icon={MessageSquare}
                    title={
                      filtroFonte !== "todos"
                        ? `Nenhum andamento dessa fonte (${filtroFonte})`
                        : "Nenhum andamento registrado ainda"
                    }
                    description={
                      filtroFonte !== "todos"
                        ? "Troque o filtro acima ou sincronize com o tribunal."
                        : "Sincronize com o tribunal ou registre manualmente."
                    }
                    actions={
                      filtroFonte === "todos"
                        ? [
                            {
                              label: sincronizandoTrib || consultando ? "Sincronizando…" : "Sincronizar agora",
                              icon: RefreshCw,
                              onClick: handleSincronizar,
                            },
                            ...(hasPermission("processos", "criar")
                              ? [{
                                  label: "Registrar andamento",
                                  icon: Plus,
                                  variant: "outline" as const,
                                  onClick: () => setOpenDialog(true),
                                }]
                              : []),
                          ]
                        : undefined
                    }
                  />
                </Card>
              ) : (
                <div className="relative space-y-0 before:absolute before:left-[15px] before:top-0 before:bottom-0 before:w-px before:bg-border">
                  {andamentosFiltrados.map((a) => (
                    <div key={a.id} className="relative pl-10 pb-6 group">
                      <div className={`absolute left-0 top-1.5 w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${a.fonte === "datajud" ? "bg-primary text-primary-foreground" : a.fonte === "pdpj_pdf" ? "bg-gold text-background" : "bg-muted text-foreground"}`}>
                        {new Date(a.data).getDate()}
                      </div>
                      <Card className="p-4">
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-muted-foreground mb-1.5 flex items-center gap-2 flex-wrap">
                              <span>{formatDate(a.data)}</span>
                              <Badge variant={a.fonte === "datajud" ? "default" : "secondary"} className="text-[10px] h-4">
                                {a.fonte === "datajud" ? "DataJud" :
                                 a.fonte === "tjmt_direto" ? "TJMT direto" :
                                 a.fonte === "pje_direto" ? "PJe direto" :
                                 a.fonte === "pdpj_pdf" ? "PDPJ" : "Manual"}
                              </Badge>
                              {a.codigo_movimento && (
                                <span className="text-[10px] text-muted-foreground">TPU {a.codigo_movimento}</span>
                              )}
                              {a.gera_acao && a.acao_gerada_tipo && (
                                <Badge variant="outline" className="text-[10px] h-4 border-success/40 text-success">
                                  {a.acao_gerada_tipo === "tarefa" ? "Tarefa criada"
                                    : a.acao_gerada_tipo === "prazo_fatal" ? "Prazo criado"
                                    : a.acao_gerada_tipo === "fluxo" ? "Fluxo iniciado"
                                    : "Notificação enviada"}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm whitespace-pre-wrap">{a.descricao}</p>
                          </div>
                          {a.fonte === "manual" && hasPermission("processos", "excluir") && (
                            <Button size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100" onClick={() => handleDeleteAndamento(a.id)}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </Card>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
              </Tabs>
            </TabsContent>

            {/* ========== GRUPO GESTÃO ========== */}
            <TabsContent value="gestao" className="mt-4">
              <Tabs defaultValue="controladoria">
                <TabsList className="flex flex-wrap h-auto gap-0.5 p-0.5">
                  <TabsTrigger value="controladoria" className="text-xs px-2 py-1"><Calendar className="w-3.5 h-3.5 mr-1" /> Controladoria</TabsTrigger>
                  <TabsTrigger value="financeiro" className="text-xs px-2 py-1"><DollarSign className="w-3.5 h-3.5 mr-1" /> Financeiro</TabsTrigger>
                  <TabsTrigger value="documentos" className="text-xs px-2 py-1"><FileText className="w-3.5 h-3.5 mr-1" /> Documentos</TabsTrigger>
                  <TabsTrigger value="partes" className="text-xs px-2 py-1"><Users className="w-3.5 h-3.5 mr-1" /> Partes ({partes.length})</TabsTrigger>
                  <TabsTrigger value="parceiros" className="text-xs px-2 py-1"><Handshake className="w-3.5 h-3.5 mr-1" /> Parceiros</TabsTrigger>
                </TabsList>

            {/* Controladoria */}
            <TabsContent value="controladoria" className="mt-4 space-y-3">
              <Card className="p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <h3 className="font-display text-lg leading-tight">Prazos, tarefas e audiências</h3>
                    <p className="text-xs text-muted-foreground">
                      {ctrlItens.length === 0
                        ? "Nenhuma atividade vinculada ainda."
                        : `${ctrlItens.length} atividade${ctrlItens.length === 1 ? "" : "s"} vinculada${ctrlItens.length === 1 ? "" : "s"} a este processo.`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" asChild>
                      <Link to="/controladoria">Ver na controladoria</Link>
                    </Button>
                    {hasPermission("controladoria", "criar") && (
                      <Button
                        variant="gold"
                        onClick={() => { setCtrlEditando(null); setCtrlOpen(true); }}
                      >
                        <Plus className="w-4 h-4" /> Nova atividade
                      </Button>
                    )}
                  </div>
                </div>
              </Card>

              {ctrlItens.length === 0 ? (
                <Card>
                  <EmptyState
                    icon={Calendar}
                    title="Nenhum prazo cadastrado"
                    description="Crie uma tarefa, audiência ou diligência para acompanhar este processo."
                    actions={
                      hasPermission("controladoria", "criar")
                        ? [{
                            label: "Nova atividade",
                            icon: Plus,
                            onClick: () => { setCtrlEditando(null); setCtrlOpen(true); },
                          }]
                        : undefined
                    }
                  />
                </Card>
              ) : (
                <Card>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Título</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Prioridade</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead className="text-right"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ctrlItens.map((it) => (
                        <TableRow
                          key={it.id}
                          className="cursor-pointer hover:bg-muted/40"
                          onClick={() => { setCtrlEditando(it); setCtrlOpen(true); }}
                        >
                          <TableCell className="font-medium">{it.titulo}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={CTRL_TIPO_CLASS[it.tipo]}>
                              {CTRL_TIPO_LABELS[it.tipo]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={CTRL_PRIO_CLASS[it.prioridade]}>
                              {CTRL_PRIO_LABELS[it.prioridade]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={CTRL_STATUS_CLASS[it.status]}>
                              {CTRL_STATUS_LABELS[it.status]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {it.data_vencimento ? formatDateTime(it.data_vencimento) : "—"}
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            abrir
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              )}

              <ItemFormDialog
                open={ctrlOpen}
                onOpenChange={(o) => { setCtrlOpen(o); if (!o) setCtrlEditando(null); }}
                item={ctrlEditando}
                prefill={proc ? { processoId: proc.id, clienteId: proc.cliente_id } : undefined}
                onSaved={() => { void loadCtrlItens(); }}
              />
            </TabsContent>

            {/* Financeiro */}
            <TabsContent value="financeiro" className="mt-4">
              <Card>
                <EmptyState
                  icon={DollarSign}
                  title="Nenhum lançamento financeiro"
                  description="Registre os honorários, parcelas e rateios deste caso."
                  actions={[{ label: "Lançar honorário", icon: Plus, to: "/financeiro/contratos" }]}
                />
              </Card>
            </TabsContent>

            {/* Documentos */}
            <TabsContent value="documentos" className="mt-4">
              <Card>
                <EmptyState
                  icon={Folder}
                  title="Pasta do cliente vazia"
                  description="Adicione os documentos do caso assim que o módulo for ativado."
                />
              </Card>
            </TabsContent>

            {/* Partes */}
            <TabsContent value="partes" className="mt-4">
              {partes.length === 0 ? (
                <Card>
                  <EmptyState
                    icon={Users}
                    title="Nenhuma parte cadastrada"
                    description="Partes do polo contrário são importadas automaticamente do DataJud quando você sincroniza."
                    actions={[{
                      label: sincronizandoTrib || consultando ? "Sincronizando…" : "Sincronizar agora",
                      icon: RefreshCw,
                      onClick: handleSincronizar,
                    }]}
                  />
                </Card>
              ) : (
                <Card>
                  <div className="divide-y divide-border">
                    {partes.map((p) => (
                      <div key={p.id} className="p-4 flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="capitalize">{p.tipo}</Badge>
                            <span className="font-medium">{p.nome}</span>
                          </div>
                          {p.cpf_cnpj && <div className="text-xs text-muted-foreground mt-1">{p.cpf_cnpj}</div>}
                          {p.advogado_nome && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Advogado: {p.advogado_nome} {p.advogado_oab ? `(${p.advogado_oab})` : ""}
                            </div>
                          )}
                        </div>
                        {p.origem === "datajud" && <Badge variant="secondary" className="text-[10px]">DataJud</Badge>}
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </TabsContent>

            {/* Parceiros */}
            <TabsContent value="parceiros" className="mt-4">
              <Card>
                <EmptyState
                  icon={Handshake}
                  title="Nenhum parceiro vinculado"
                  description="Substabelecimentos, correspondentes e indicadores aparecem aqui."
                  actions={[{ label: "Ir para parceiros", to: "/parceiros", variant: "outline" }]}
                />
              </Card>
            </TabsContent>
              </Tabs>
            </TabsContent>

            {/* ========== GRUPO IA & CHECKLIST ========== */}
            <TabsContent value="ia" className="mt-4">
              <ChecklistDiligenciasTab
                processoId={proc.id}
                clienteId={proc.cliente_id}
                varaProcesso={proc.vara}
              />
            </TabsContent>

            {/* ========== GRUPO CLIENTE VÊ ========== */}
            <TabsContent value="cliente" className="mt-4">
              <ClienteVeTab processoId={proc.id} clienteId={proc.cliente_id} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
