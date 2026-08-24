import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, CheckCircle2, Pencil, Trash2, ExternalLink, MessageSquare, Maximize2, X, Sparkles, Send, FileCheck2, RotateCcw, Play, Square, CheckSquare, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatDateTime } from "@/lib/format";
import {
  ControladoriaItem, TIPO_LABELS, STATUS_LABELS, PRIORIDADE_LABELS,
  TIPO_CLASS, STATUS_CLASS, PRIORIDADE_CLASS, TIPOS_EVENTO, EVENTO_COR_HEADER,
} from "./types";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ClipboardList, Lightbulb, FileSignature, CheckCircle, AlertCircle } from "lucide-react";
import ItemChat from "./ItemChat";
import { BiaCentralInline } from "@/components/assistente/BiaCentralInline";
import { useEquipeInterna } from "./equipe";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import WorkflowEtapas from "./WorkflowEtapas";
import { ETAPA_LABEL, type EtapaWorkflow } from "./workflow";

type TabId = "detalhes" | "ia" | "chat" | "historico";

interface Props {
  itemId: string | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (item: ControladoriaItem) => void;
  onChanged: () => void;
}

export default function ItemDetalheSheet({ itemId, onOpenChange, onEdit, onChanged }: Props) {
  const { user, hasPermission, roles } = useAuth();
  const [item, setItem] = useState<ControladoriaItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<TabId>("chat");
  const [chatExpandido, setChatExpandido] = useState(false);

  // Relatório pós-evento (estado local, salva em lote)
  const [resultado, setResultado] = useState("");
  const [proximoPasso, setProximoPasso] = useState("");
  const [docsEntregues, setDocsEntregues] = useState("");
  const [docsRecebidos, setDocsRecebidos] = useState("");
  const [savingRelatorio, setSavingRelatorio] = useState(false);
  const [confirmandoCliente, setConfirmandoCliente] = useState(false);

  const open = !!itemId;
  const podeEditar = hasPermission("controladoria", "editar");
  const podeExcluir = hasPermission("controladoria", "excluir");
  const isGestor = roles.includes("gestor");
  const isEstagiario = roles.includes("estagiario") && !isGestor && !roles.includes("advogado");
  // Quem pode concluir/protocolar: gestor, advogado ou admin. Estagiários só iniciam e enviam para revisão.
  const podeConcluir = !isEstagiario;

  const isEvento = item ? TIPOS_EVENTO.includes(item.tipo) : false;
  const corHeader = item ? EVENTO_COR_HEADER[item.tipo] : null;

  // Modais de fluxo
  const [devolverOpen, setDevolverOpen] = useState(false);
  const [devolverComentario, setDevolverComentario] = useState("");
  const [devolverResponsavelId, setDevolverResponsavelId] = useState<string>("");
  const [protocoloOpen, setProtocoloOpen] = useState(false);
  const [salvandoFluxo, setSalvandoFluxo] = useState(false);
  const { equipe: equipeInterna } = useEquipeInterna();

  useEffect(() => {
    if (!itemId) { setItem(null); setTab("chat"); setLoading(false); return; }
    setLoading(true);
    setItem(null);
    loadItem();
    // Marca notificações de comentário deste item como lidas
    if (user) {
      supabase.from("notificacoes")
        .update({ lida: true, lida_em: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("item_id", itemId)
        .eq("tipo", "controladoria_comentario")
        .eq("lida", false)
        .then(() => {});
    }
  }, [itemId, user?.id]);

  useEffect(() => {
    if (!item) return;
    setResultado(item.resultado ?? "");
    setProximoPasso(item.proximo_passo ?? "");
    setDocsEntregues(item.documentos_entregues ?? "");
    setDocsRecebidos(item.documentos_recebidos ?? "");
  }, [item?.id, item?.resultado, item?.proximo_passo, item?.documentos_entregues, item?.documentos_recebidos]);

  async function loadItem() {
    if (!itemId) return;
    setLoading(true);
    try {
      // Busca o item sem embeds primeiro — embeds com RLS restritivo podem falhar
      // a query inteira e travar a caixinha em loading.
      const { data: it, error } = await supabase
        .from("controladoria_itens")
        .select("*")
        .eq("id", itemId)
        .maybeSingle();
      if (error) {
        toast.error("Não foi possível abrir o item: " + error.message);
        setItem(null);
        return;
      }
      if (!it) {
        toast.error("Item não encontrado ou sem permissão de acesso");
        setItem(null);
        return;
      }
      // Busca cliente e processo separadamente (tolerante a RLS)
      const [cli, proc] = await Promise.all([
        (it as any).cliente_id
          ? supabase.from("clientes").select("id, nome").eq("id", (it as any).cliente_id).maybeSingle()
          : Promise.resolve({ data: null }),
        (it as any).processo_id
          ? supabase.from("processos").select("id, numero_cnj, tipo_acao").eq("id", (it as any).processo_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      setItem({ ...(it as any), cliente: cli.data, processo: proc.data } as ControladoriaItem);
    } catch (e: any) {
      toast.error("Erro inesperado ao carregar o item");
      setItem(null);
    } finally {
      setLoading(false);
    }
  }

  async function marcarConcluido() {
    if (!item || !user) return;
    const { error } = await supabase
      .from("controladoria_itens")
      .update({
        status: "concluido",
        coluna_kanban: "concluido",
        concluido_em: new Date().toISOString(),
        concluido_por: user.id,
      })
      .eq("id", item.id);
    if (error) return toast.error("Erro: " + error.message);
    toast.success("Item concluído");
    loadItem();
    onChanged();
  }

  async function toggleClienteConfirmado() {
    if (!item) return;
    setConfirmandoCliente(true);
    const novo = !item.cliente_confirmado;
    const { error } = await supabase
      .from("controladoria_itens")
      .update({ cliente_confirmado: novo })
      .eq("id", item.id);
    setConfirmandoCliente(false);
    if (error) return toast.error("Erro: " + error.message);
    toast.success(novo ? "Cliente marcado como confirmado" : "Confirmação do cliente removida");
    loadItem();
    onChanged();
  }

  async function salvarRelatorio() {
    if (!item) return;
    if (!resultado.trim()) return toast.error("Conte o que aconteceu antes de salvar");
    setSavingRelatorio(true);
    const updates: any = {
      resultado: resultado.trim(),
      proximo_passo: proximoPasso.trim() || null,
      documentos_entregues: docsEntregues.trim() || null,
      documentos_recebidos: docsRecebidos.trim() || null,
    };
    // Marca como realizado/concluído ao salvar relatório
    if (item.status !== "concluido") {
      updates.status = "concluido";
      updates.coluna_kanban = "concluido";
      updates.concluido_em = new Date().toISOString();
      updates.concluido_por = user?.id ?? null;
    }
    const { error } = await supabase
      .from("controladoria_itens")
      .update(updates)
      .eq("id", item.id);
    setSavingRelatorio(false);
    if (error) return toast.error("Erro: " + error.message);
    toast.success("Relatório salvo");
    loadItem();
    onChanged();
  }

  async function cancelarEvento() {
    if (!item) return;
    const motivo = prompt("Informe o motivo do cancelamento:");
    if (!motivo || !motivo.trim()) return;
    const { error } = await supabase
      .from("controladoria_itens")
      .update({
        status: "cancelado",
        coluna_kanban: "concluido",
        cancelado_motivo: motivo.trim(),
      })
      .eq("id", item.id);
    if (error) return toast.error("Erro: " + error.message);
    toast.success("Evento cancelado");
    loadItem();
    onChanged();
  }

  async function excluir() {
    if (!item) return;
    const { error } = await supabase.from("controladoria_itens").delete().eq("id", item.id);
    if (error) return toast.error("Erro: " + error.message);
    toast.success("Item excluído");
    onOpenChange(false);
    onChanged();
  }

  async function buscarProfilePor(termo: string, role?: string) {
    // Busca pelo nome (case-insensitive). Opcionalmente valida role em user_roles.
    const { data } = await supabase
      .from("profiles")
      .select("id, nome")
      .ilike("nome", `%${termo}%`)
      .eq("ativo", true)
      .limit(5);
    if (!data || data.length === 0) return null;
    if (!role) return data[0];
    const ids = data.map((d: any) => d.id);
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("user_id", ids)
      .eq("role", role as any);
    const valido = data.find((d: any) => roles?.some((r: any) => r.user_id === d.id));
    return valido ?? data[0];
  }

  // As mudanças de etapa acontecem exclusivamente pela transição canônica
  // (`controladoria_transicionar_etapa`), exposta no card de Fluxo da tarefa.


  const detalhes = item && (
    <div className="px-4 sm:px-6 py-4 sm:py-5 space-y-5 sm:space-y-6">
      {item.descricao && (

        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Descrição</p>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{item.descricao}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 text-sm">
        {item.cliente && (
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Cliente</p>
            <p>{item.cliente.nome}</p>
          </div>
        )}
        {item.processo && (
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Processo</p>
            <p className="font-mono text-xs">{item.processo.numero_cnj || item.processo.tipo_acao || "—"}</p>
          </div>
        )}
        {item.data_intimacao && (
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Intimação</p>
            <p>{formatDateTime(item.data_intimacao)}</p>
          </div>
        )}
        {item.vara && (
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Vara</p>
            <p>{item.vara}</p>
          </div>
        )}
        {item.juiz && (
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Juiz(a)</p>
            <p>{item.juiz}</p>
          </div>
        )}
        {item.local && (
          <div className="col-span-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Local</p>
            <p>{item.local}</p>
          </div>
        )}
        {item.link_virtual && (
          <div className="col-span-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Link da audiência</p>
            <a href={item.link_virtual} target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center gap-1.5 text-primary hover:underline">
              Abrir <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}
        {item.concluido_em && (
          <div className="col-span-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Concluído em</p>
            <p className="text-success">{formatDateTime(item.concluido_em)}</p>
          </div>
        )}
      </div>

      {/* Toggle confirmação do cliente — apenas eventos */}
      {isEvento && (
        <div className="rounded-lg border bg-card p-4 flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            {item.cliente_confirmado ? (
              <CheckCircle className="w-5 h-5 text-success mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-warning mt-0.5" />
            )}
            <div>
              <p className="text-sm font-medium">
                {item.cliente_confirmado ? "Cliente confirmou presença" : "Cliente ainda não confirmou"}
              </p>
              <p className="text-xs text-muted-foreground">
                {item.cliente_confirmado
                  ? "Tudo certo para o evento."
                  : "Entre em contato para confirmar antes do evento."}
              </p>
            </div>
          </div>
          {podeEditar && (
            <Switch
              checked={!!item.cliente_confirmado}
              disabled={confirmandoCliente}
              onCheckedChange={toggleClienteConfirmado}
            />
          )}
        </div>
      )}

      {/* Preparação do evento */}
      {isEvento && (item.o_que_levar || item.orientacoes) && (
        <div className="space-y-3">
          {item.o_que_levar && (
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center gap-2 mb-2">
                <ClipboardList className="w-4 h-4 text-foreground" />
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">O que levar</p>
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{item.o_que_levar}</p>
            </div>
          )}
          {item.orientacoes && (
            <div className="rounded-lg border bg-primary/5 border-primary/20 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="w-4 h-4 text-primary" />
                <p className="text-xs uppercase tracking-wider text-primary font-semibold">Orientações</p>
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{item.orientacoes}</p>
            </div>
          )}
        </div>
      )}

      {/* Relatório pós-evento */}
      {isEvento && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <FileSignature className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold">Relatório pós-evento</p>
          </div>
          {podeEditar ? (
            <>
              <div className="space-y-1.5">
                <Label>O que aconteceu *</Label>
                <Textarea value={resultado} onChange={(e) => setResultado(e.target.value)} rows={4} placeholder="Resumo do que ocorreu no evento" />
              </div>
              <div className="space-y-1.5">
                <Label>Próximo passo</Label>
                <Input value={proximoPasso} onChange={(e) => setProximoPasso(e.target.value)} placeholder="Ex: Aguardar laudo / Protocolar petição" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Documentos entregues ao cliente</Label>
                  <Input value={docsEntregues} onChange={(e) => setDocsEntregues(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Documentos recebidos do cliente</Label>
                  <Input value={docsRecebidos} onChange={(e) => setDocsRecebidos(e.target.value)} />
                </div>
              </div>
              <Button onClick={salvarRelatorio} disabled={savingRelatorio} className="w-full sm:w-auto">
                {savingRelatorio && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Salvar relatório e marcar como realizado
              </Button>
            </>
          ) : (
            <div className="text-sm space-y-2">
              {item.resultado && <p><strong>O que aconteceu:</strong> {item.resultado}</p>}
              {item.proximo_passo && <p><strong>Próximo passo:</strong> {item.proximo_passo}</p>}
              {!item.resultado && <p className="text-muted-foreground">Sem relatório registrado.</p>}
            </div>
          )}
        </div>
      )}

      {item.cancelado_motivo && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-xs uppercase tracking-wider text-destructive font-semibold mb-1">Cancelado</p>
          <p className="text-sm">{item.cancelado_motivo}</p>
        </div>
      )}
    </div>
  );

  const acoes = item && (
    <div className="border-t bg-muted/20 px-4 sm:px-6 py-2 sm:py-3 flex flex-wrap gap-2 justify-between">
      <div className="flex gap-2 flex-wrap">
        {/* Fluxo de etapas (Iniciar / Avançar / Revisar / Protocolo) está no card "Fluxo da tarefa" na aba Detalhes.
            Aqui ficam apenas ações administrativas. */}
        {isEvento && item.status !== "cancelado" && item.status !== "concluido" && isGestor && (
          <Button size="sm" variant="outline" onClick={cancelarEvento} className="text-destructive hover:text-destructive">
            Cancelar evento
          </Button>
        )}
      </div>
      <div className="flex gap-2">
        {podeEditar && (
          <Button size="sm" variant="outline" onClick={() => onEdit(item)}>
            <Pencil className="w-4 h-4 mr-1.5" /> Editar
          </Button>
        )}
        {podeExcluir && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" className="text-destructive hover:text-destructive">
                <Trash2 className="w-4 h-4 mr-1.5" /> Excluir
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir item?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação não pode ser desfeita. O item e seus comentários serão removidos.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={excluir} className="bg-destructive hover:bg-destructive/90">
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );

  return (
    <>
      <Sheet open={open && !chatExpandido} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-none sm:w-[75vw] lg:w-[55vw] lg:min-w-[680px] lg:max-w-[1100px] p-0 flex flex-col gap-0 overflow-hidden border-l"
        >

          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : !item ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <AlertCircle className="w-8 h-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Não foi possível abrir este item.<br />Ele pode ter sido removido ou você não tem permissão.</p>
              <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
            </div>
          ) : (
            <>
              {/* Cabeçalho do painel de trabalho */}
              <div className="px-5 sm:px-7 pt-5 pb-4 border-b">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      <Badge variant="outline" className={cn("text-[10px] h-5", TIPO_CLASS[item.tipo])}>{TIPO_LABELS[item.tipo]}</Badge>
                      <Badge variant="outline" className={cn("text-[10px] h-5", STATUS_CLASS[item.status])}>{STATUS_LABELS[item.status]}</Badge>
                      {(item.prioridade === "urgente" || item.prioridade === "alta") && (
                        <Badge variant="outline" className={cn("text-[10px] h-5", PRIORIDADE_CLASS[item.prioridade])}>{PRIORIDADE_LABELS[item.prioridade]}</Badge>
                      )}
                    </div>
                    <div className="flex items-start gap-2.5">
                      <button
                        type="button"
                        onClick={() => podeConcluir && item.status !== "concluido" && marcarConcluido()}
                        disabled={!podeConcluir || item.status === "concluido"}
                        className="mt-1 shrink-0 text-muted-foreground hover:text-success disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title={item.status === "concluido" ? "Concluído" : podeConcluir ? "Marcar como concluído" : "Sem permissão"}
                      >
                        {item.status === "concluido"
                          ? <CheckSquare className="w-4 h-4 text-success" />
                          : <Square className="w-4 h-4" />}
                      </button>
                      <h2 className={cn(
                        "font-display text-lg sm:text-xl leading-snug flex-1",
                        item.status === "concluido" && "line-through text-muted-foreground",
                      )}>
                        {item.titulo}
                      </h2>
                    </div>
                    {item.descricao && (
                      <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2 pl-[26px]">{item.descricao}</p>
                    )}
                  </div>
                  {podeEditar && (
                    <button
                      type="button"
                      onClick={() => onEdit(item)}
                      className="mt-1 mr-8 p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
                      title="Editar"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Faixa de contexto */}
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 rounded-lg border border-border/70 bg-muted/25 px-3 py-2.5">
                  <ContextoCampo label="Cliente" value={item.cliente?.nome ?? "—"} href={item.cliente?.id ? `/clientes/${item.cliente.id}` : undefined} />
                  <ContextoCampo
                    label="Processo"
                    value={item.processo?.numero_cnj || item.processo?.tipo_acao || "—"}
                    href={item.processo?.id ? `/processos/${item.processo.id}` : undefined}
                  />
                  <ContextoCampo label="Responsável" value={item.responsavel?.nome ?? "Sem responsável"} />
                  <ContextoCampo
                    label="Prazo"
                    value={formatDateTime(item.data_vencimento)}
                    tone={
                      item.status === "concluido" ? undefined
                      : new Date(item.data_vencimento) < new Date() ? "destructive"
                      : "warningSoon"
                    }
                  />
                </div>
              </div>

              {/* Fluxo da tarefa — sempre visível e compacto, acima das abas */}
              <div className="px-5 sm:px-7 py-2 border-b bg-muted/20">
                <WorkflowEtapas item={item as any} compact onChanged={() => { loadItem(); onChanged(); }} />
              </div>

              <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex-1 flex flex-col min-h-0">
                {/* Abas: Comentários primeiro (foco principal) */}
                <div className="px-5 sm:px-7 border-b flex items-center justify-between gap-2">
                  <div className="flex gap-1">
                    {([
                      { v: "chat", label: "Comentários", icon: MessageSquare },
                      { v: "detalhes", label: "Visão geral", icon: null },
                      { v: "historico", label: "Histórico", icon: History },
                      { v: "ia", label: "IA", icon: Sparkles },
                    ] as Array<{ v: TabId; label: string; icon: any }>).map(({ v, label, icon: Icon }) => (

                      <button
                        key={v}
                        type="button"
                        onClick={() => setTab(v as any)}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors",
                          tab === v
                            ? "border-primary text-primary font-medium"
                            : "border-transparent text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {Icon && <Icon className="w-3.5 h-3.5" />}
                        {label}
                      </button>
                    ))}
                  </div>
                  {tab === "chat" && (
                    <Button size="sm" variant="ghost" onClick={() => setChatExpandido(true)} title="Expandir chat">
                      <Maximize2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>


                <TabsContent value="detalhes" className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden">
                  <ScrollArea className="h-full">
                    <div className="mx-auto w-full max-w-3xl">{detalhes}</div>
                  </ScrollArea>
                </TabsContent>
                <TabsContent value="ia" className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden">
                  <ScrollArea className="h-full">
                    <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-4">
                      <BiaCentralInline
                        alvo="item_controladoria"
                        id={item.id}
                        autoLoad={tab === "ia"}
                        onAcaoExecutada={() => { loadItem(); onChanged(); }}
                      />
                    </div>
                  </ScrollArea>
                </TabsContent>
                <TabsContent value="historico" className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden">
                  <ScrollArea className="h-full">
                    <div className="mx-auto w-full max-w-3xl px-5 sm:px-7 py-5">
                      <HistoricoTimeline item={item} ativo={tab === "historico"} />
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="chat" className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden data-[state=active]:flex">
                  <div className="mx-auto w-full max-w-3xl h-full min-h-0 flex flex-col px-2 sm:px-4">
                    <ItemChat itemId={item.id} processoId={item.processo_id} clienteId={item.cliente_id} itemTitulo={item.titulo} />
                  </div>
                </TabsContent>
              </Tabs>

              {acoes}
            </>
          )}
        </SheetContent>
      </Sheet>


      {/* Modal expandido do chat */}
      <Dialog open={chatExpandido} onOpenChange={setChatExpandido}>
        <DialogContent className="max-w-5xl w-[95vw] h-[85vh] p-0 flex flex-col gap-0">
          {item && (
            <>
              <div className="px-6 py-4 border-b flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className={TIPO_CLASS[item.tipo]}>{TIPO_LABELS[item.tipo]}</Badge>
                    <Badge variant="outline" className={STATUS_CLASS[item.status]}>{STATUS_LABELS[item.status]}</Badge>
                  </div>
                  <h2 className="font-display text-xl leading-tight truncate">{item.titulo}</h2>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5" /> Chat do item
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setChatExpandido(false)} className="shrink-0">
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex-1 min-h-0">
                <ItemChat itemId={item.id} processoId={item.processo_id} clienteId={item.cliente_id} itemTitulo={item.titulo} variant="fullscreen" />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

    </>
  );
}

function MetaLinha({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className={valueClass ?? "text-foreground"}>{value}</span>
    </div>
  );
}

function ContextoCampo({ label, value, href, tone }: {
  label: string;
  value: string;
  href?: string;
  tone?: "destructive" | "warningSoon";
}) {
  const valueClass = cn(
    "text-[13px] font-medium truncate",
    tone === "destructive" && "text-destructive",
    tone === "warningSoon" && "text-foreground",
  );
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      {href ? (
        <Link to={href} className={cn(valueClass, "block text-primary hover:underline")}>{value}</Link>
      ) : (
        <p className={valueClass}>{value}</p>
      )}
    </div>
  );
}

interface EventoTimeline { id: string; quando: string; titulo: string; detalhe?: string | null }

/** Timeline derivada apenas de dados reais já existentes: criação do item,
 *  histórico de etapas e comentários. */
function HistoricoTimeline({ item, ativo }: { item: ControladoriaItem; ativo: boolean }) {
  const [eventos, setEventos] = useState<EventoTimeline[]>([]);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!ativo) return;
    let cancelado = false;
    (async () => {
      setCarregando(true);
      const [hist, coment] = await Promise.all([
        (supabase as any)
          .from("controladoria_etapas_historico")
          .select("id, etapa, iniciada_em, observacao")
          .eq("item_id", item.id)
          .order("iniciada_em", { ascending: false }),
        (supabase as any)
          .from("controladoria_comentarios")
          .select("id, criado_em, texto")
          .eq("item_id", item.id)
          .order("criado_em", { ascending: false }),
      ]);
      if (cancelado) return;
      const lista: EventoTimeline[] = [];
      (hist?.data ?? []).forEach((h: any) => lista.push({
        id: `h-${h.id}`,
        quando: h.iniciada_em,
        titulo: `Etapa: ${ETAPA_LABEL[(h.etapa ?? "criacao") as EtapaWorkflow] ?? h.etapa}`,
        detalhe: h.observacao,
      }));
      (coment?.data ?? []).forEach((c: any) => lista.push({
        id: `c-${c.id}`,
        quando: c.criado_em,
        titulo: "Comentário",
        detalhe: c.texto,
      }));
      if (item.criado_em) {
        lista.push({ id: "criado", quando: item.criado_em, titulo: "Atividade criada" });
      }
      lista.sort((a, b) => (b.quando ?? "").localeCompare(a.quando ?? ""));
      setEventos(lista);
      setCarregando(false);
    })();
    return () => { cancelado = true; };
  }, [ativo, item.id, item.criado_em]);

  if (carregando) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  }
  if (eventos.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">Nenhum evento registrado ainda.</p>;
  }
  return (
    <ol className="relative border-l border-border pl-5 space-y-5">
      {eventos.map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute -left-[23px] top-1.5 w-2 h-2 rounded-full bg-primary/60 ring-4 ring-background" />
          <p className="text-[13px] font-medium">{e.titulo}</p>
          <p className="text-[11px] text-muted-foreground">{formatDateTime(e.quando)}</p>
          {e.detalhe && <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-4">{e.detalhe}</p>}
        </li>
      ))}
    </ol>
  );
}
