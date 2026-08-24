import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Loader2, Workflow, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { useFormDraft } from "@/hooks/useFormDraft";
import { comRetry } from "@/lib/supabase-retry";
import { enviarEmailSilencioso } from "@/lib/email";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Users } from "lucide-react";
import {
  TIPO_LABELS, PRIORIDADE_LABELS, STATUS_LABELS, TIPO_ICON, TipoItem, StatusItem, Prioridade,
  ControladoriaItem, TIPOS_EVENTO, ORIENTACOES_PADRAO,
} from "./types";
import { useEquipeInterna, responsavelPadrao } from "./equipe";
import { ResponsavelAvatar } from "./ResponsavelAvatar";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: ControladoriaItem | null;
  onSaved: (itemId?: string) => void;
  /** Pré-preenchimento ao criar um item novo (ignorado em edição). */
  prefill?: {
    processoId?: string;
    clienteId?: string;
    titulo?: string;
    descricao?: string;
    tipo?: TipoItem;
    prioridade?: Prioridade;
    dataIntimacao?: string;
    origem?: string;
  };
}

interface SimpleOption { id: string; label: string; }
interface TipoPrazoOption { id: string; nome: string; dias: number; dias_uteis: boolean; }

const TIPOS_AUTO: TipoItem[] = ["prazo_fatal", "prazo_processual"];

export default function ItemFormDialog({ open, onOpenChange, item, onSaved, prefill }: Props) {
  const { user } = useAuth();
  const isEdit = !!item;

  const [saving, setSaving] = useState(false);
  const [clientes, setClientes] = useState<SimpleOption[]>([]);
  const [processos, setProcessos] = useState<{ id: string; label: string; cliente_id: string | null }[]>([]);
  const [tiposPrazo, setTiposPrazo] = useState<TipoPrazoOption[]>([]);
  const [fluxos, setFluxos] = useState<{ id: string; nome: string; _count: number }[]>([]);
  const [fluxoId, setFluxoId] = useState<string>("");
  const [aplicandoFluxo, setAplicandoFluxo] = useState(false);

  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [tipo, setTipo] = useState<TipoItem>("prazo_processual");
  const [status, setStatus] = useState<StatusItem>("pendente");
  const [prioridade, setPrioridade] = useState<Prioridade>("media");
  const [clienteId, setClienteId] = useState<string>("");
  const [processoId, setProcessoId] = useState<string>("");
  const [tipoPrazoId, setTipoPrazoId] = useState<string>("");
  const [dataIntimacao, setDataIntimacao] = useState<Date | undefined>();
  const [dataVencimento, setDataVencimento] = useState<Date | undefined>();
  const [vara, setVara] = useState("");
  const [juiz, setJuiz] = useState("");
  const [local, setLocal] = useState("");
  const [linkVirtual, setLinkVirtual] = useState("");
  const [visivelParceiro, setVisivelParceiro] = useState(false);
  const [responsavelId, setResponsavelId] = useState<string>("");
  const [coResponsaveis, setCoResponsaveis] = useState<string[]>([]);
  const [oQueLevar, setOQueLevar] = useState("");
  const [orientacoes, setOrientacoes] = useState("");

  const { equipe } = useEquipeInterna();
  const isAuto = TIPOS_AUTO.includes(tipo);
  const isEvento = TIPOS_EVENTO.includes(tipo);

  // Carrega dados de apoio quando abre
  useEffect(() => {
    if (!open) return;
    setFluxoId("");
    (async () => {
      const [c, p, t, f] = await Promise.all([
        supabase.from("clientes").select("id, nome").eq("ativo", true).order("nome"),
        supabase.from("processos").select("id, numero_cnj, tipo_acao, cliente_id").order("criado_em", { ascending: false }),
        supabase.from("tipos_prazo").select("id, nome, dias, dias_uteis").eq("ativo", true).order("nome"),
        (supabase as any).from("fluxos_templates").select("id, nome").eq("ativo", true).order("nome"),
      ]);
      setClientes((c.data ?? []).map((x: any) => ({ id: x.id, label: x.nome })));
      setProcessos(
        (p.data ?? []).map((x: any) => ({
          id: x.id,
          cliente_id: x.cliente_id,
          label: x.numero_cnj || x.tipo_acao || `Processo ${x.id.slice(0, 8)}`,
        })),
      );
      setTiposPrazo((t.data ?? []) as TipoPrazoOption[]);

      // Conta etapas de cada fluxo
      const fluxosData = (f.data ?? []) as { id: string; nome: string }[];
      let counts: Record<string, number> = {};
      if (fluxosData.length) {
        const { data: ets } = await (supabase as any)
          .from("fluxo_etapas_template")
          .select("template_id")
          .in("template_id", fluxosData.map((x) => x.id));
        (ets ?? []).forEach((e: any) => { counts[e.template_id] = (counts[e.template_id] ?? 0) + 1; });
      }
      setFluxos(fluxosData.map((x) => ({ ...x, _count: counts[x.id] ?? 0 })));
    })();
  }, [open]);

  // Preenche em edição / reseta em novo
  useEffect(() => {
    if (!open) return;
    if (item) {
      setTitulo(item.titulo);
      setDescricao(item.descricao ?? "");
      setTipo(item.tipo);
      setStatus(item.status);
      setPrioridade(item.prioridade);
      setClienteId(item.cliente_id ?? "");
      setProcessoId(item.processo_id ?? "");
      setTipoPrazoId(item.tipo_prazo_id ?? "");
      setDataIntimacao(item.data_intimacao ? new Date(item.data_intimacao + "T00:00:00") : undefined);
      setDataVencimento(item.data_vencimento ? new Date(item.data_vencimento) : undefined);
      setVara(item.vara ?? "");
      setJuiz(item.juiz ?? "");
      setLocal(item.local ?? "");
      setLinkVirtual(item.link_virtual ?? "");
      setVisivelParceiro((item as any).visivel_parceiro ?? false);
      setResponsavelId(item.responsavel_id ?? "");
      setOQueLevar((item as any).o_que_levar ?? "");
      setOrientacoes((item as any).orientacoes ?? "");
      // Carrega co-responsáveis salvos
      (async () => {
        const { data } = await supabase
          .from("controladoria_responsaveis")
          .select("user_id")
          .eq("item_id", item.id);
        const ids = (data ?? []).map((r: any) => r.user_id).filter((x: string) => x !== item.responsavel_id);
        setCoResponsaveis(ids);
      })();
    } else {
      setTitulo(prefill?.titulo ?? "");
      setDescricao(prefill?.descricao ?? "");
      setTipo(prefill?.tipo ?? "prazo_processual");
      setStatus("pendente");
      setPrioridade(prefill?.prioridade ?? "media");
      setClienteId(prefill?.clienteId ?? "");
      setProcessoId(prefill?.processoId ?? "");
      setTipoPrazoId("");
      setDataIntimacao(prefill?.dataIntimacao ? new Date(prefill.dataIntimacao + "T00:00:00") : undefined);
      setDataVencimento(undefined);
      setVara("");
      setJuiz("");
      setLocal("");
      setLinkVirtual("");
      setVisivelParceiro(false);
      setResponsavelId("");
      setCoResponsaveis([]);
      setOQueLevar("");
      setOrientacoes("");
    }
  }, [item, open]);

  // Auto-preenche orientações ao trocar tipo (apenas em criação e quando vazio)
  useEffect(() => {
    if (!open || isEdit) return;
    if (!isEvento) return;
    if (orientacoes.trim()) return;
    const padrao = ORIENTACOES_PADRAO[tipo];
    if (padrao) setOrientacoes(padrao);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, open, isEdit, isEvento]);

  // Default por tipo: aplica quando ainda não há responsável escolhido
  useEffect(() => {
    if (!open || isEdit) return;
    if (responsavelId) return;
    if (equipe.length === 0) return;
    const padrao = responsavelPadrao(tipo, equipe);
    if (padrao) setResponsavelId(padrao);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, open, equipe.length]);

  // Cálculo automático para prazos
  useEffect(() => {
    if (!isAuto || !dataIntimacao || !tipoPrazoId) return;
    const tp = tiposPrazo.find((t) => t.id === tipoPrazoId);
    if (!tp) return;
    (async () => {
      if (tp.dias_uteis) {
        const { data, error } = await supabase.rpc("adicionar_dias_uteis", {
          _data_inicio: format(dataIntimacao, "yyyy-MM-dd"),
          _dias: tp.dias,
        });
        if (!error && data) setDataVencimento(new Date(data + "T00:00:00"));
      } else {
        const d = new Date(dataIntimacao);
        d.setDate(d.getDate() + tp.dias);
        setDataVencimento(d);
      }
    })();
  }, [dataIntimacao, tipoPrazoId, isAuto, tiposPrazo]);

  const processosFiltrados = useMemo(
    () => (clienteId ? processos.filter((p) => p.cliente_id === clienteId) : processos),
    [processos, clienteId],
  );

  // Auto-save de rascunho — protege contra trocar de aba / minimizar / fechar
  const draftKey = `controladoria:rascunho:${item?.id ?? "novo"}`;
  const draftValues = {
    titulo, descricao, tipo, status, prioridade,
    clienteId, processoId, tipoPrazoId,
    dataIntimacao: dataIntimacao?.toISOString() ?? null,
    dataVencimento: dataVencimento?.toISOString() ?? null,
    vara, juiz, local, linkVirtual, visivelParceiro,
  };
  const { clear: clearDraft } = useFormDraft(draftKey, draftValues, {
    enabled: open,
    hasContent: (v) => Boolean(v.titulo || v.descricao || v.vara || v.juiz),
    onRestore: (d) => {
      setTitulo(d.titulo ?? "");
      setDescricao(d.descricao ?? "");
      if (d.tipo) setTipo(d.tipo);
      if (d.status) setStatus(d.status);
      if (d.prioridade) setPrioridade(d.prioridade);
      setClienteId(d.clienteId ?? "");
      setProcessoId(d.processoId ?? "");
      setTipoPrazoId(d.tipoPrazoId ?? "");
      setDataIntimacao(d.dataIntimacao ? new Date(d.dataIntimacao) : undefined);
      setDataVencimento(d.dataVencimento ? new Date(d.dataVencimento) : undefined);
      setVara(d.vara ?? "");
      setJuiz(d.juiz ?? "");
      setLocal(d.local ?? "");
      setLinkVirtual(d.linkVirtual ?? "");
      setVisivelParceiro(Boolean(d.visivelParceiro));
    },
  });

  async function handleSubmit() {
    if (!titulo.trim()) return toast.error("Informe um título");
    if (!dataVencimento) return toast.error("Informe a data de vencimento");
    if (!responsavelId) return toast.error("Selecione o responsável pelo item");
    if (!clienteId && !processoId) {
      return toast.error("Toda tarefa precisa estar vinculada a um cliente ou processo.");
    }

    setSaving(true);
    const payload = {
      titulo: titulo.trim(),
      descricao: descricao.trim() || null,
      tipo,
      status,
      prioridade,
      cliente_id: clienteId || null,
      processo_id: processoId || null,
      responsavel_id: responsavelId || null,
      tipo_prazo_id: isAuto ? (tipoPrazoId || null) : null,
      data_intimacao: isAuto && dataIntimacao ? format(dataIntimacao, "yyyy-MM-dd") : null,
      data_vencimento: dataVencimento.toISOString(),
      vara: vara.trim() || null,
      juiz: juiz.trim() || null,
      local: local.trim() || null,
      link_virtual: linkVirtual.trim() || null,
      visivel_parceiro: visivelParceiro,
      o_que_levar: isEvento ? (oQueLevar.trim() || null) : null,
      orientacoes: isEvento ? (orientacoes.trim() || null) : null,
      origem: prefill?.origem ?? (isEdit ? item?.origem : "controladoria"),
    };

    let savedId: string | null = null;
    if (isEdit && item) {
      const { data, error } = await comRetry(async () =>
        await supabase.from("controladoria_itens").update(payload).eq("id", item.id).select().single(),
      );
      setSaving(false);
      if (error) return toast.error("Erro ao salvar: " + error.message);
      savedId = (data as any)?.id ?? item.id;
      toast.success("Item atualizado");
    } else {
      const newId = crypto.randomUUID();
      const { error } = await comRetry(async () =>
        await supabase
          .from("controladoria_itens")
          .insert({ id: newId, ...payload, criado_por: user?.id ?? null }),
      );
      setSaving(false);
      if (error) return toast.error("Erro ao criar: " + error.message);
       savedId = newId;
      toast.success("Item criado");
    }

    // Sincroniza co-responsáveis (tabela controladoria_responsaveis)
    if (savedId) {
      try {
        const todos = Array.from(new Set([responsavelId, ...coResponsaveis].filter(Boolean)));
        await supabase.from("controladoria_responsaveis").delete().eq("item_id", savedId);
        if (todos.length) {
          await supabase.from("controladoria_responsaveis").insert(
            todos.map((uid) => ({
              item_id: savedId!,
              user_id: uid,
              papel: uid === responsavelId ? "principal" as const : "apoio" as const,
            }))
          );
        }
        // Notifica novos co-responsáveis (best-effort)
        const novos = coResponsaveis.filter((id) => id !== user?.id && id !== responsavelId);
        for (const uid of novos) {
          await supabase.from("notificacoes").insert({
            user_id: uid,
            tipo: "tarefa_atribuida",
            titulo: "Você foi adicionado(a) como colaborador(a)",
            descricao: titulo.trim(),
            link: `/controladoria?item=${savedId}`,
            item_id: savedId,
          });
        }
      } catch (err) {
        console.warn("[ItemFormDialog] sincronizar co-responsáveis falhou", err);
      }
    }

    try {
      const responsavel = equipe.find((m) => m.id === responsavelId);
      const responsavelUserId = (responsavel as any)?.user_id ?? null;
      const criadorNome = user?.user_metadata?.nome ?? user?.email ?? "Alguém da equipe";
      if (responsavelUserId && responsavelId !== user?.id && savedId) {
        // notificacoes.user_id referencia profiles.id (que = responsavelId)
        await supabase.from("notificacoes").insert({
          user_id: responsavelId,
          tipo: "tarefa_atribuida",
          titulo: `Nova tarefa atribuída a você por ${criadorNome}`,
          descricao: titulo.trim(),
          link: `/controladoria?item=${savedId}`,
          item_id: savedId,
        });
      }
    } catch {
      // notificação é best-effort, não bloqueia o fluxo
    }

    // Disparo de emails (best-effort)
    try {
      const responsavel = equipe.find((m) => m.id === responsavelId);
      const responsavelEmail = responsavel?.email ?? null;
      const responsavelNome = responsavel?.nome ?? "Equipe";
      const criadorNome = user?.user_metadata?.nome ?? user?.email ?? "Alguém da equipe";
      const tituloItem = titulo.trim();
      const linkItem = `/controladoria?item=${savedId}`;
      const statusAntigo = isEdit ? item?.status : null;
      const respAntigo = isEdit ? item?.responsavel_id : null;

      // 1) Nova tarefa atribuída (criação OU mudança de responsável)
      const houveNovaAtribuicao = !isEdit || (respAntigo !== responsavelId);
      if (houveNovaAtribuicao && responsavelEmail && responsavelId !== user?.id) {
        enviarEmailSilencioso({
          para: responsavelEmail,
          assunto: `[LegisFlow] Nova tarefa: ${tituloItem}`,
          conteudo: `
            <h2>Olá, ${responsavelNome.split(" ")[0]}!</h2>
            <p><strong>${criadorNome}</strong> atribuiu uma nova tarefa a você:</p>
            <div class="highlight"><strong>${tituloItem}</strong>${dataVencimento ? ` · vence em ${format(dataVencimento, "dd/MM/yyyy")}` : ""}</div>
            <p>Acesse a controladoria para ver os detalhes.</p>
          `,
          evento: "tarefa_atribuida",
        });
      }

      // 2) Mudanças de status (apenas em edição)
      if (isEdit && statusAntigo && statusAntigo !== status) {
        // Buscar email da gestora (Dra. Juliana) sob demanda
        const buscarEmailGestor = async (): Promise<string | null> => {
          const { data } = await supabase
            .from("user_roles")
            .select("profiles:user_id(email)")
            .eq("role", "gestor" as any)
            .limit(1)
            .maybeSingle();
          const p = Array.isArray((data as any)?.profiles) ? (data as any).profiles[0] : (data as any)?.profiles;
          return p?.email ?? null;
        };

        if (status === "aguardando") {
          const gestorEmail = await buscarEmailGestor();
          if (gestorEmail) {
            enviarEmailSilencioso({
              para: gestorEmail,
              assunto: `[Revisão] ${responsavelNome} enviou: ${tituloItem}`,
              conteudo: `
                <h2>Item enviado para revisão</h2>
                <p><strong>${responsavelNome}</strong> marcou o item como aguardando revisão:</p>
                <div class="highlight"><strong>${tituloItem}</strong></div>
                <p>Acesse a controladoria para revisar.</p>
              `,
              evento: "enviado_revisao",
            });
          }
        } else if (status === "concluido" && responsavelEmail) {
          enviarEmailSilencioso({
            para: responsavelEmail,
            assunto: `[Aprovado ✅] ${tituloItem}`,
            conteudo: `
              <h2>Item aprovado ✅</h2>
              <p>O item <strong>${tituloItem}</strong> foi aprovado e marcado como concluído.</p>
              <p>Bom trabalho, ${responsavelNome.split(" ")[0]}!</p>
            `,
            evento: "item_aprovado",
          });
        } else if (status === "cancelado" && responsavelEmail) {
          enviarEmailSilencioso({
            para: responsavelEmail,
            assunto: `[Correção ↩] ${tituloItem}`,
            conteudo: `
              <h2>Item retornado para correção ↩</h2>
              <p>O item <strong>${tituloItem}</strong> foi marcado como cancelado/reprovado.</p>
              <p>Verifique os detalhes na controladoria e ajuste o que for necessário.</p>
            `,
            evento: "item_reprovado",
          });
        }
      }
    } catch (err) {
      console.warn("[ItemFormDialog] envio de email falhou", err);
    }

    clearDraft();
    onSaved(savedId ?? undefined);
    onOpenChange(false);
  }

  async function aplicarFluxo() {
    if (!fluxoId) return;
    setAplicandoFluxo(true);
    const dataRef = dataIntimacao ?? dataVencimento ?? new Date();
    const { error } = await (supabase as any).rpc("instanciar_fluxo", {
      _template_id: fluxoId,
      _data_gatilho: format(dataRef, "yyyy-MM-dd"),
      _processo_id: processoId || null,
      _cliente_id: clienteId || null,
    });
    setAplicandoFluxo(false);
    if (error) return toast.error("Erro ao aplicar fluxo: " + error.message);
    toast.success("Fluxo aplicado! Etapas criadas na controladoria.");
    onSaved();
    onOpenChange(false);
  }

  const fluxoSelecionado = fluxos.find((f) => f.id === fluxoId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {isEdit ? "Editar item" : "Novo item da Controladoria"}
          </DialogTitle>
          <DialogDescription>
            Crie manualmente ou escolha um fluxo automatizado como modelo — o sistema gera todas as etapas com prazos calculados.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 py-2">
          {/* Fluxo como modelo (apenas em criação) */}
          {!isEdit && prefill?.origem !== "djen" && fluxos.length > 0 && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">Usar fluxo automatizado como modelo</span>
                <Badge variant="outline" className="text-[10px] ml-auto">opcional</Badge>
              </div>
              <Select value={fluxoId || "none"} onValueChange={(v) => setFluxoId(v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um fluxo (ou crie manualmente abaixo)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Criar manualmente —</SelectItem>
                  {fluxos.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nome} ({f._count} {f._count === 1 ? "etapa" : "etapas"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fluxoSelecionado && (
                <div className="text-xs text-muted-foreground">
                  Ao aplicar, serão criadas <strong>{fluxoSelecionado._count} etapas</strong> de uma vez, com prazos calculados a partir da data de intimação ou vencimento abaixo. Vincule cliente/processo se desejar.
                </div>
              )}
            </div>
          )}

          {/* Tipo + prioridade + status + responsável */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoItem)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TIPO_LABELS) as TipoItem[]).map((k) => {
                    const Icon = TIPO_ICON[k];
                    return (
                      <SelectItem key={k} value={k}>
                        <span className="inline-flex items-center gap-2"><Icon className="h-3.5 w-3.5" />{TIPO_LABELS[k]}</span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Select value={prioridade} onValueChange={(v) => setPrioridade(v as Prioridade)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORIDADE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as StatusItem)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Responsável *</Label>
              <Select value={responsavelId} onValueChange={setResponsavelId}>
                <SelectTrigger>
                  <SelectValue placeholder={equipe.length ? "Selecione" : "Sem equipe cadastrada"} />
                </SelectTrigger>
                <SelectContent>
                  {equipe.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <span className="inline-flex items-center gap-2">
                        <ResponsavelAvatar nome={m.nome} id={m.id} size="xs" showTooltip={false} />
                        <span className="truncate">{m.nome}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Co-responsáveis (múltiplos colaboradores) */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2">
              <Users className="w-3.5 h-3.5" /> Co-responsáveis (opcional)
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start font-normal">
                  {coResponsaveis.length === 0
                    ? "Adicionar mais pessoas a esta tarefa"
                    : `${coResponsaveis.length} ${coResponsaveis.length === 1 ? "colaborador" : "colaboradores"} selecionado(s)`}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[320px] p-0" align="start">
                <div className="max-h-72 overflow-y-auto p-2 space-y-1">
                  {equipe.filter((m) => m.id !== responsavelId).length === 0 && (
                    <p className="text-xs text-muted-foreground p-2">Selecione antes o responsável principal.</p>
                  )}
                  {equipe.filter((m) => m.id !== responsavelId).map((m) => {
                    const checked = coResponsaveis.includes(m.id);
                    return (
                      <label
                        key={m.id}
                        className="flex items-center gap-2 p-2 rounded-md hover:bg-muted cursor-pointer"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            setCoResponsaveis((prev) =>
                              v ? [...prev, m.id] : prev.filter((x) => x !== m.id)
                            );
                          }}
                        />
                        <ResponsavelAvatar nome={m.nome} id={m.id} size="xs" showTooltip={false} />
                        <span className="text-sm truncate">{m.nome}</span>
                      </label>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
            {coResponsaveis.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {coResponsaveis.map((id) => {
                  const m = equipe.find((x) => x.id === id);
                  if (!m) return null;
                  return (
                    <Badge key={id} variant="secondary" className="gap-1.5 pr-1">
                      <ResponsavelAvatar nome={m.nome} id={m.id} size="xs" showTooltip={false} />
                      {m.nome}
                      <button
                        type="button"
                        onClick={() => setCoResponsaveis((prev) => prev.filter((x) => x !== id))}
                        className="ml-1 rounded-full hover:bg-muted-foreground/20 px-1 text-xs"
                        aria-label={`Remover ${m.nome}`}
                      >
                        ×
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              O responsável principal recebe a tarefa; co-responsáveis veem e podem colaborar. Para <strong>transferir</strong>, basta trocar o responsável principal acima.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Título *</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Contestação - Processo 0001234-..." />
          </div>

          {/* Cálculo automático (apenas prazos) */}
          {isAuto && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                  Cálculo automático em dias úteis
                </Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Tipo de prazo</Label>
                  <Select value={tipoPrazoId} onValueChange={setTipoPrazoId}>
                    <SelectTrigger>
                      <SelectValue placeholder={tiposPrazo.length ? "Selecione" : "Nenhum cadastrado"} />
                    </SelectTrigger>
                    <SelectContent>
                      {tiposPrazo.map((tp) => (
                        <SelectItem key={tp.id} value={tp.id}>
                          {tp.nome} ({tp.dias} {tp.dias_uteis ? "d. úteis" : "dias"})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Data da intimação</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start font-normal", !dataIntimacao && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dataIntimacao ? format(dataIntimacao, "dd/MM/yyyy") : "Selecione"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={dataIntimacao} onSelect={setDataIntimacao} initialFocus className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>
          )}

          {/* Vencimento */}
          <div className="space-y-1.5">
            <Label>Data de vencimento *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full sm:w-[280px] justify-start font-normal", !dataVencimento && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dataVencimento ? format(dataVencimento, "dd/MM/yyyy") : "Selecione"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dataVencimento} onSelect={setDataVencimento} initialFocus className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>
          </div>

          {/* Vínculos — obrigatório vincular a cliente OU processo */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>
                Vínculo <span className="text-destructive">*</span>
              </Label>
              {!clienteId && !processoId && (
                <span className="text-xs text-destructive">
                  Toda tarefa precisa estar vinculada a um cliente ou processo
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                value={clienteId || "none"}
                onValueChange={(v) => {
                  const proximoClienteId = v === "none" ? "" : v;
                  const processosDoCliente = processos.filter((p) => p.cliente_id === proximoClienteId);
                  setClienteId(proximoClienteId);
                  setProcessoId(processosDoCliente.length === 1 ? processosDoCliente[0].id : "");
                }}
              >
                <SelectTrigger className={!clienteId && !processoId ? "border-destructive/60" : ""}>
                  <SelectValue placeholder="Selecione um cliente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select
                value={processoId || "none"}
                onValueChange={(v) => {
                  const proximoProcessoId = v === "none" ? "" : v;
                  setProcessoId(proximoProcessoId);
                  const processo = processos.find((p) => p.id === proximoProcessoId);
                  if (processo?.cliente_id) setClienteId(processo.cliente_id);
                }}
              >
                <SelectTrigger className={!clienteId && !processoId ? "border-destructive/60" : ""}>
                  <SelectValue placeholder="Selecione um processo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {processosFiltrados.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Audiência details */}
          {tipo === "audiencia" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-lg border bg-muted/30 p-4">
              <div className="space-y-1.5">
                <Label>Vara</Label>
                <Input value={vara} onChange={(e) => setVara(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Juiz(a)</Label>
                <Input value={juiz} onChange={(e) => setJuiz(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Local</Label>
                <Input value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Endereço presencial" />
              </div>
              <div className="space-y-1.5">
                <Label>Link da audiência virtual</Label>
                <Input value={linkVirtual} onChange={(e) => setLinkVirtual(e.target.value)} placeholder="https://..." />
              </div>
            </div>
          )}

          {/* Local + preparação (perícia / conciliação / reunião) */}
          {isEvento && tipo !== "audiencia" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-lg border bg-muted/30 p-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Local do evento</Label>
                <Input value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Ex: INSS Primavera do Leste — Av. Brasil, 123" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Link virtual (se for online)</Label>
                <Input value={linkVirtual} onChange={(e) => setLinkVirtual(e.target.value)} placeholder="https://..." />
              </div>
            </div>
          )}

          {/* Preparação do evento — para todos os 4 tipos */}
          {isEvento && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                  Preparação do evento
                </Badge>
                <span className="text-xs text-muted-foreground">Aparece para a responsável e nos lembretes por email.</span>
              </div>
              <div className="space-y-1.5">
                <Label>O que levar</Label>
                <Textarea
                  value={oQueLevar}
                  onChange={(e) => setOQueLevar(e.target.value)}
                  rows={3}
                  placeholder="Documentos, exames, procuração, atestados..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Orientações específicas</Label>
                <Textarea
                  value={orientacoes}
                  onChange={(e) => setOrientacoes(e.target.value)}
                  rows={4}
                  placeholder="Orientações para a responsável conduzir o evento."
                />
                <p className="text-xs text-muted-foreground">
                  Texto sugerido por tipo já preenchido. Você pode editar livremente.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Descrição / observações</Label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} />
          </div>

          <label className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/40 transition-colors">
            <input
              type="checkbox"
              checked={visivelParceiro}
              onChange={(e) => setVisivelParceiro(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <div className="flex-1">
              <p className="text-sm font-medium">Visível ao parceiro</p>
              <p className="text-xs text-muted-foreground">
                Se o processo tiver parceiro vinculado, esta tarefa aparece no portal dele.
                Mantenha desligado para tarefas internas, estratégia ou minutas.
              </p>
            </div>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving || aplicandoFluxo}>Cancelar</Button>
          {!isEdit && fluxoId ? (
            <Button onClick={aplicarFluxo} disabled={aplicandoFluxo} className="gap-2">
              {aplicandoFluxo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Workflow className="w-4 h-4" />}
              Aplicar fluxo ({fluxoSelecionado?._count ?? 0} etapas)
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEdit ? "Salvar alterações" : "Criar item"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
