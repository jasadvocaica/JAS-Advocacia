import { useEffect, useState } from "react";
import { Loader2, Check, ArrowRight, FileText, Wrench, Send, CheckCircle2, ChevronDown, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatDateTime } from "@/lib/format";
import { useEquipeInterna } from "./equipe";
import {
  EtapaWorkflow, ETAPA_LABEL, ETAPA_RESP_KEY, ETAPAS_ORDEM,
  etapaAtualDe, transicoesPermitidas, labelTransicao, exigeObservacao, transicionarEtapa,
} from "./workflow";

export type { EtapaWorkflow } from "./workflow";

export const ETAPAS: { id: EtapaWorkflow; label: string; icon: any; respKey: string | null; cor: string }[] = [
  { id: "criacao",    label: "Criação",   icon: FileText,     respKey: null,              cor: "bg-muted text-muted-foreground border-border" },
  { id: "execucao",   label: "Execução",  icon: Wrench,       respKey: "executor_id",     cor: "bg-primary/15 text-primary border-primary/30" },
  { id: "revisao",    label: "Revisão",   icon: Eye,          respKey: "revisor_id",      cor: "bg-[#7c3aed]/15 text-[#7c3aed] dark:text-[#c4b5fd] border-[#7c3aed]/30" },
  { id: "correcao",   label: "Correção",  icon: Wrench,       respKey: "corretor_id",     cor: "bg-warning/15 text-warning border-warning/30" },
  { id: "protocolo",  label: "Protocolo", icon: Send,         respKey: "protocolador_id", cor: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30" },
  { id: "finalizado", label: "Finalizado",icon: CheckCircle2, respKey: null,              cor: "bg-success/15 text-success border-success/30" },
];

interface ItemWorkflow {
  id: string;
  etapa_workflow: string | null;
  exige_revisao?: boolean | null;
  executor_id: string | null;
  corretor_id: string | null;
  revisor_id?: string | null;
  protocolador_id: string | null;
  responsavel_id: string | null;
  etapa_atualizada_em?: string | null;
}

interface HistoricoRow {
  id: string;
  etapa: string;
  responsavel_id: string | null;
  iniciada_em: string;
  finalizada_em: string | null;
  observacao: string | null;
}

interface Props {
  item: ItemWorkflow;
  onChanged: () => void;
  compact?: boolean;
}

export default function WorkflowEtapas({ item, onChanged, compact = false }: Props) {
  const { user } = useAuth();
  const { equipe } = useEquipeInterna();
  const [salvando, setSalvando] = useState(false);
  const [historico, setHistorico] = useState<HistoricoRow[]>([]);
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [alvo, setAlvo] = useState<EtapaWorkflow | null>(null);
  const [proxResponsavel, setProxResponsavel] = useState<string>("");
  const [observacao, setObservacao] = useState("");
  const [transferirOpen, setTransferirOpen] = useState(false);
  const [novoResponsavel, setNovoResponsavel] = useState<string>("");
  const [motivoTransfer, setMotivoTransfer] = useState("");

  const exigeRevisao = item.exige_revisao !== false;
  const etapaAtual = etapaAtualDe(item);
  const opcoes = transicoesPermitidas(etapaAtual, exigeRevisao);
  const etapaAtualConfig = ETAPAS.find((e) => e.id === etapaAtual)!;
  const alvoConfig = alvo ? ETAPAS.find((e) => e.id === alvo)! : null;
  const respAtualId = etapaAtualConfig.respKey ? ((item as any)[etapaAtualConfig.respKey] as string | null) : null;
  const podeTransferir = !!etapaAtualConfig.respKey && etapaAtual !== "finalizado";

  async function carregarHistorico() {
    const { data } = await (supabase as any)
      .from("controladoria_etapas_historico")
      .select("id, etapa, responsavel_id, iniciada_em, finalizada_em, observacao")
      .eq("item_id", item.id)
      .order("iniciada_em", { ascending: false });
    setHistorico((data ?? []) as HistoricoRow[]);
  }

  useEffect(() => {
    if (historicoAberto) void carregarHistorico();
  }, [historicoAberto, item.id]);

  function nomeDe(id: string | null) {
    if (!id) return "—";
    return equipe.find((m) => m.id === id)?.nome ?? "—";
  }

  function abrirTransicao(etapa: EtapaWorkflow) {
    const respKey = ETAPA_RESP_KEY[etapa];
    const sugestao = etapa === "correcao"
      ? (item.executor_id ?? item.responsavel_id ?? "")
      : respKey
        ? ((item as any)[respKey] ?? item.responsavel_id ?? "")
        : "";
    setProxResponsavel(sugestao ?? "");
    setObservacao("");
    setAlvo(etapa);
  }

  async function confirmarTransicao() {
    if (!alvo || !alvoConfig) return;
    setSalvando(true);
    const r = await transicionarEtapa({
      itemId: item.id,
      etapaAtual,
      novaEtapa: alvo,
      exigeRevisao,
      responsavelId: ETAPA_RESP_KEY[alvo] ? proxResponsavel || null : null,
      observacao,
    });
    setSalvando(false);
    if (!r.ok) return toast.error(r.erro ?? "Não foi possível mover a etapa");
    setAlvo(null);
    toast.success(`Etapa: ${ETAPA_LABEL[alvo]}`);
    onChanged();
    if (historicoAberto) void carregarHistorico();
  }

  function abrirTransferir() {
    setNovoResponsavel(respAtualId ?? "");
    setMotivoTransfer("");
    setTransferirOpen(true);
  }

  async function transferir() {
    if (!user || !etapaAtualConfig.respKey) return;
    if (!novoResponsavel) return toast.error("Selecione o novo responsável");
    if (novoResponsavel === respAtualId) return toast.error("Já é o responsável atual");
    setSalvando(true);

    const agora = new Date().toISOString();
    const nomeNovo = equipe.find((m) => m.id === novoResponsavel)?.nome ?? "novo responsável";
    const nomeAntigo = nomeDe(respAtualId);
    const obs = `🔄 Transferida de ${nomeAntigo} para ${nomeNovo}${motivoTransfer.trim() ? ` — ${motivoTransfer.trim()}` : ""}`;

    const { data: aberto } = await (supabase as any)
      .from("controladoria_etapas_historico")
      .select("id")
      .eq("item_id", item.id)
      .eq("etapa", etapaAtual)
      .is("finalizada_em", null)
      .order("iniciada_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (aberto?.id) {
      await (supabase as any)
        .from("controladoria_etapas_historico")
        .update({ finalizada_em: agora, observacao: obs })
        .eq("id", aberto.id);
    }

    const updates: any = { etapa_atualizada_em: agora, responsavel_id: novoResponsavel };
    updates[etapaAtualConfig.respKey] = novoResponsavel;
    const { error } = await supabase
      .from("controladoria_itens")
      .update(updates)
      .eq("id", item.id);
    if (error) { setSalvando(false); return toast.error("Erro: " + error.message); }

    await (supabase as any).from("controladoria_etapas_historico").insert({
      item_id: item.id,
      etapa: etapaAtual,
      responsavel_id: novoResponsavel,
      iniciada_em: agora,
      criado_por: user.id,
    });

    await supabase.from("controladoria_comentarios").insert({
      item_id: item.id,
      user_id: user.id,
      texto: `**${etapaAtualConfig.label}** ${obs}`,
    });

    if (novoResponsavel !== user.id) {
      await supabase.from("notificacoes").insert({
        user_id: novoResponsavel,
        titulo: `Tarefa transferida para você (${etapaAtualConfig.label})`,
        descricao: motivoTransfer.trim() || `${nomeAntigo} transferiu a etapa de ${etapaAtualConfig.label}`,
        tipo: "controladoria",
        item_id: item.id,
        link: `/controladoria?item=${item.id}`,
      } as any);
    }

    setSalvando(false);
    setTransferirOpen(false);
    toast.success(`Transferida para ${nomeNovo}`);
    onChanged();
    if (historicoAberto) void carregarHistorico();
  }

  const visiveis = ETAPAS.filter((e) => exigeRevisao || (e.id !== "revisao" && e.id !== "correcao"));
  const idxAtual = ETAPAS_ORDEM.indexOf(etapaAtual);

  const acoes = (size: "sm" | "xs") => (
    <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
      {podeTransferir && (
        <Button
          size="sm"
          variant={size === "xs" ? "ghost" : "outline"}
          onClick={abrirTransferir}
          disabled={salvando}
          className={size === "xs" ? "h-7 px-2 text-xs" : undefined}
        >
          Transferir
        </Button>
      )}
      {opcoes.map((op) => (
        <Button
          key={op}
          size="sm"
          variant={op === "correcao" ? "outline" : "default"}
          onClick={() => abrirTransicao(op)}
          disabled={salvando}
          className={size === "xs" ? "h-7 px-2.5 text-xs" : undefined}
        >
          {labelTransicao(etapaAtual, op)}
          <ArrowRight className={cn("ml-1", size === "xs" ? "w-3 h-3" : "w-4 h-4")} />
        </Button>
      ))}
    </div>
  );

  const compactBlock = compact && (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-1 flex-1 min-w-0 flex-wrap">
        {visiveis.map((et, i) => {
          const ativa = et.id === etapaAtual;
          const feita = ETAPAS_ORDEM.indexOf(et.id) < idxAtual;
          const Icon = et.icon;
          return (
            <div key={et.id} className="flex items-center gap-1 shrink-0">
              <div
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center border transition-colors",
                  ativa && "border-primary bg-primary text-primary-foreground",
                  feita && "border-success bg-success/10 text-success",
                  !ativa && !feita && "border-border bg-muted text-muted-foreground",
                )}
                title={et.label}
              >
                {feita ? <Check className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
              </div>
              <span
                className={cn(
                  "text-[11px] font-medium hidden md:inline",
                  ativa && "text-primary",
                  feita && "text-muted-foreground line-through",
                  !ativa && !feita && "text-muted-foreground",
                )}
              >
                {et.label}
              </span>
              {i < visiveis.length - 1 && (
                <div className={cn("h-px w-3 sm:w-4", feita ? "bg-success/50" : "bg-border")} />
              )}
            </div>
          );
        })}
      </div>
      {acoes("xs")}
    </div>
  );

  return (
    <>
      {compact ? compactBlock : (

    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm font-semibold">Fluxo da tarefa</p>
        {acoes("sm")}
      </div>

      {/* Stepper visual */}
      <div className="flex items-start gap-1 overflow-x-auto pb-1">
        {visiveis.map((et, i) => {
          const ativa = et.id === etapaAtual;
          const feita = ETAPAS_ORDEM.indexOf(et.id) < idxAtual;
          const Icon = et.icon;
          const resp = et.respKey ? ((item as any)[et.respKey] as string | null) : null;
          return (
            <div key={et.id} className="flex-1 min-w-[88px] flex flex-col items-center text-center">
              <div className={cn(
                "w-9 h-9 rounded-full flex items-center justify-center border-2 transition-colors",
                ativa && "border-primary bg-primary text-primary-foreground shadow-sm",
                feita && "border-success bg-success/10 text-success",
                !ativa && !feita && "border-border bg-muted text-muted-foreground",
              )}>
                {feita ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
              </div>
              <p className={cn(
                "text-[11px] mt-1.5 font-medium leading-tight",
                ativa && "text-primary",
                feita && "text-success",
                !ativa && !feita && "text-muted-foreground",
              )}>{et.label}</p>
              {resp && (
                <p className="text-[10px] text-muted-foreground mt-0.5 uppercase truncate max-w-[80px]" title={nomeDe(resp)}>
                  {nomeDe(resp)}
                </p>
              )}
              {i < visiveis.length - 1 && (
                <div className={cn(
                  "hidden sm:block h-0.5 w-full -mt-7 -mb-3 -z-10",
                  feita ? "bg-success/40" : "bg-border",
                )} />
              )}
            </div>
          );
        })}
      </div>

      {/* Histórico */}
      <Collapsible open={historicoAberto} onOpenChange={setHistoricoAberto}>
        <CollapsibleTrigger asChild>
          <button type="button" className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors pt-1">
            <span>Histórico de etapas</span>
            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", historicoAberto && "rotate-180")} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          {historico.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem registros ainda.</p>
          ) : (
            <ul className="space-y-2">
              {historico.map((h) => {
                const conf = ETAPAS.find((e) => e.id === (h.etapa as EtapaWorkflow));
                const rotulo = conf?.label ?? (h.etapa === "aprovacao" ? "Aprovação" : h.etapa);
                return (
                  <li key={h.id} className="text-xs border-l-2 border-border pl-3 py-1">
                    <div className="flex items-center gap-2">
                      <span className={cn("inline-flex px-1.5 py-0.5 rounded border text-[10px] font-medium", conf?.cor ?? "bg-success/15 text-success border-success/30")}>
                        {rotulo}
                      </span>
                      <span className="text-muted-foreground">{nomeDe(h.responsavel_id)}</span>
                    </div>
                    <div className="text-muted-foreground mt-0.5">
                      {formatDateTime(h.iniciada_em)}
                      {h.finalizada_em && <> → {formatDateTime(h.finalizada_em)}</>}
                    </div>
                    {h.observacao && <p className="text-foreground mt-1 italic">"{h.observacao}"</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
      )}

      {/* Modal de transição */}
      <Dialog open={!!alvo} onOpenChange={(o) => { if (!o) setAlvo(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{alvo ? labelTransicao(etapaAtual, alvo) : ""}</DialogTitle>
            <DialogDescription>
              Próxima etapa: <strong>{alvoConfig?.label}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {alvo && ETAPA_RESP_KEY[alvo] && (
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Responsável pela {alvoConfig?.label.toLowerCase()}
                </Label>
                <Select value={proxResponsavel} onValueChange={setProxResponsavel}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {equipe.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.nome}{m.role ? ` · ${m.role}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                {alvo && exigeObservacao(alvo) ? "O que deve ser corrigido (obrigatório)" : "Observação (opcional)"}
              </Label>
              <Textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                rows={3}
                placeholder="Ex: aguardar fundamentação no art. 7º, IV da CF"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAlvo(null)} disabled={salvando}>Cancelar</Button>
            <Button onClick={confirmarTransicao} disabled={salvando}>
              {salvando && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Confirmar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: transferir etapa atual */}
      <Dialog open={transferirOpen} onOpenChange={setTransferirOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Transferir {etapaAtualConfig.label.toLowerCase()}</DialogTitle>
            <DialogDescription>
              Atual: <strong>{nomeDe(respAtualId)}</strong>. A etapa continua a mesma — só muda quem vai fazer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Novo responsável</Label>
              <Select value={novoResponsavel} onValueChange={setNovoResponsavel}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {equipe.filter((m) => m.id !== respAtualId).map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.nome}{m.role ? ` · ${m.role}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Motivo (opcional)</Label>
              <Textarea
                value={motivoTransfer}
                onChange={(e) => setMotivoTransfer(e.target.value)}
                rows={3}
                placeholder="Ex: estou de férias na próxima semana"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setTransferirOpen(false)} disabled={salvando}>Cancelar</Button>
            <Button onClick={transferir} disabled={salvando || !novoResponsavel}>
              {salvando && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Transferir
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
