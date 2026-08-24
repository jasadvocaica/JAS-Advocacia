import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, ArrowRight, RotateCcw, Send, Play, FileCheck2, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import {
  ETAPAS_ORDENADAS,
  ETAPA_LABEL,
  ETAPA_DESCRICAO,
  etapaAtualDe,
  podeTransicionar,
  transicionarEtapa,
  type EtapaWorkflow,
} from "./workflow";
import { useEquipeInterna } from "./equipe";
import { ResponsavelAvatar } from "./ResponsavelAvatar";

interface Props {
  item: {
    id: string;
    titulo: string;
    etapa_workflow?: EtapaWorkflow | string | null;
    status?: string | null;
    responsavel_id?: string | null;
    exige_revisao?: boolean | null;
    executor_id?: string | null;
    corretor_id?: string | null;
    revisor_id?: string | null;
    protocolador_id?: string | null;
  };
  compact?: boolean;
  onChanged: () => void;
}

export default function WorkflowEtapas({ item, compact = false, onChanged }: Props) {
  const { user, roles, hasPermission } = useAuth();
  const { equipe } = useEquipeInterna();
  const [salvando, setSalvando] = useState(false);

  // Modais de apoio para transições com payload extra
  const [modalDevolver, setModalDevolver] = useState(false);
  const [devolverObs, setDevolverObs] = useState("");
  const [devolverRespId, setDevolverRespId] = useState("");

  const [modalProtocolo, setModalProtocolo] = useState(false);
  const [numeroProtocolo, setNumeroProtocolo] = useState("");
  const [comprovanteUrl, setComprovanteUrl] = useState("");

  const etapaAtual = etapaAtualDe(item);
  const exigeRevisao = item.exige_revisao !== false;

  const isGestor = roles.includes("gestor");
  const isAdvogado = roles.includes("advogado");
  const podeExecutar = hasPermission("controladoria", "editar");
  const podeRevisarOuProtocolar = podeExecutar && (isGestor || isAdvogado);

  async function executarTransicao(
    destino: EtapaWorkflow,
    extra?: {
      novoResponsavelId?: string | null;
      observacao?: string | null;
      numeroProtocolo?: string | null;
      arquivoProtocoloUrl?: string | null;
    },
  ) {
    setSalvando(true);
    try {
      const res = await transicionarEtapa({
        itemId: item.id,
        novaEtapa: destino,
        etapaAtual: etapaAtual,
        exigeRevisao: exigeRevisao,
        ...extra,
      });

      if (!res.ok) {
        toast.error(res.erro || res.error || "Não foi possível avançar a etapa");
        return false;
      }

      toast.success(`Etapa avançada para: ${ETAPA_LABEL[destino]}`);
      onChanged();
      return true;
    } catch (err: any) {
      toast.error(err?.message || "Erro inesperado ao avançar etapa");
      return false;
    } finally {
      setSalvando(false);
    }
  }

  // --- Handlers de cada ação do workflow ---

  async function handleIniciarExecucao() {
    await executarTransicao("execucao", {
      novoResponsavelId: item.responsavel_id || user?.id,
    });
  }

  async function handleEnviarRevisao() {
    // Busca advogado/gestor preferencial se não houver um atribuído
    const gestorOuAdv = equipe.find(
      (m) => (m.role === "gestor" || m.role === "advogado") && m.id !== user?.id,
    );
    await executarTransicao("revisao", {
      novoResponsavelId: gestorOuAdv?.id ?? null,
      observacao: "Minuta finalizada, aguardando revisão.",
    });
  }

  async function handleAprovarParaProtocolo() {
    await executarTransicao("protocolo", {
      observacao: "Minuta aprovada, liberada para protocolo.",
    });
  }

  async function handleConfirmarDevolucao() {
    if (!devolverObs.trim()) {
      toast.error("Informe os apontamentos de correção");
      return;
    }
    const ok = await executarTransicao("correcao", {
      novoResponsavelId: devolverRespId || item.corretor_id || item.executor_id || item.responsavel_id,
      observacao: devolverObs.trim(),
    });
    if (ok) {
      setModalDevolver(false);
      setDevolverObs("");
      setDevolverRespId("");
    }
  }

  async function handleConfirmarProtocolo() {
    const ok = await executarTransicao("finalizado", {
      numeroProtocolo: numeroProtocolo.trim() || null,
      arquivoProtocoloUrl: comprovanteUrl.trim() || null,
      observacao: numeroProtocolo ? `Protocolo nº ${numeroProtocolo}` : "Protocolado no tribunal",
    });
    if (ok) {
      setModalProtocolo(false);
      setNumeroProtocolo("");
      setComprovanteUrl("");
    }
  }

  // --- Render dos botões contextuais por etapa ---

  function renderAcoesContextuais() {
    if (!podeExecutar) {
      return <span className="text-xs text-muted-foreground italic">Sem permissão para alterar esta atividade</span>;
    }

    if (salvando) {
      return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Atualizando etapa...
        </div>
      );
    }

    switch (etapaAtual) {
      case "criacao":
        return (
          <Button size="sm" onClick={handleIniciarExecucao} className="gap-1.5 h-8 text-xs">
            <Play className="w-3.5 h-3.5" /> Iniciar execução
          </Button>
        );

      case "execucao":
      case "correcao":
        return (
          <div className="flex items-center gap-2 flex-wrap">
            {exigeRevisao ? (
              <Button size="sm" onClick={handleEnviarRevisao} className="gap-1.5 h-8 text-xs">
                <Send className="w-3.5 h-3.5" /> Enviar para revisão
              </Button>
            ) : (
              <Button size="sm" onClick={handleAprovarParaProtocolo} className="gap-1.5 h-8 text-xs">
                <FileCheck2 className="w-3.5 h-3.5" /> Liberar p/ protocolo
              </Button>
            )}
          </div>
        );

      case "revisao":
        if (!podeRevisarOuProtocolar) {
          return (
            <span className="text-xs text-muted-foreground italic">
              Aguardando revisão por advogado ou gestor
            </span>
          );
        }
        return (
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDevolverRespId(item.corretor_id || item.executor_id || item.responsavel_id || "");
                setModalDevolver(true);
              }}
              className="gap-1.5 h-8 text-xs text-warning border-warning/40 hover:bg-warning/10"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Devolver p/ correção
            </Button>
            <Button
              size="sm"
              onClick={handleAprovarParaProtocolo}
              className="gap-1.5 h-8 text-xs bg-success text-success-foreground hover:bg-success/90"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Aprovar minuta
            </Button>
          </div>
        );

      case "protocolo":
        if (!podeRevisarOuProtocolar) {
          return (
            <span className="text-xs text-muted-foreground italic">
              Aguardando protocolo por advogado ou gestor
            </span>
          );
        }
        return (
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDevolverRespId(item.corretor_id || item.executor_id || item.responsavel_id || "");
                setModalDevolver(true);
              }}
              className="gap-1.5 h-8 text-xs text-muted-foreground"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Devolver
            </Button>
            <Button
              size="sm"
              onClick={() => setModalProtocolo(true)}
              className="gap-1.5 h-8 text-xs bg-primary"
            >
              <FileCheck2 className="w-3.5 h-3.5" /> Marcar como protocolado
            </Button>
          </div>
        );

      case "finalizado":
        return (
          <Badge variant="outline" className="gap-1 bg-success/15 text-success border-success/30">
            <CheckCircle2 className="w-3 h-3" /> Finalizado / Protocolado
          </Badge>
        );

      default:
        return null;
    }
  }

  const idxAtual = ETAPAS_ORDENADAS.indexOf(etapaAtual);

  return (
    <div className="space-y-2">
      {/* Barra de progresso linear */}
      <div className="flex items-center justify-between gap-1 overflow-x-auto py-1">
        {ETAPAS_ORDENADAS.map((etapa, idx) => {
          const concluida = idx < idxAtual;
          const ativa = idx === idxAtual;
          return (
            <div key={etapa} className="flex items-center gap-1 shrink-0">
              <div
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                  ativa
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : concluida
                    ? "bg-muted text-foreground/80"
                    : "text-muted-foreground/60"
                }`}
                title={ETAPA_DESCRICAO[etapa]}
              >
                {concluida ? (
                  <CheckCircle2 className="w-3 h-3 text-success" />
                ) : (
                  <span className="w-3 text-center text-[10px] opacity-70">{idx + 1}</span>
                )}
                <span>{ETAPA_LABEL[etapa]}</span>
              </div>
              {idx < ETAPAS_ORDENADAS.length - 1 && (
                <ArrowRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      {/* Ações contextuais */}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <span className="text-[11px] text-muted-foreground truncate">
          {ETAPA_DESCRICAO[etapaAtual]}
        </span>
        <div className="shrink-0">{renderAcoesContextuais()}</div>
      </div>

      {/* Modal Devolver para Correção */}
      <Dialog open={modalDevolver} onOpenChange={setModalDevolver}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Devolver minuta para correção</DialogTitle>
            <DialogDescription>
              Aponte o que precisa ser ajustado. O item retornará para o responsável com as observações.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Responsável pelos ajustes</Label>
              <Select value={devolverRespId} onValueChange={setDevolverRespId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione quem fará os ajustes" />
                </SelectTrigger>
                <SelectContent>
                  {equipe.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <span className="inline-flex items-center gap-2">
                        <ResponsavelAvatar nome={m.nome} id={m.id} size="xs" showTooltip={false} />
                        {m.nome}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Apontamentos de correção *</Label>
              <Textarea
                value={devolverObs}
                onChange={(e) => setDevolverObs(e.target.value)}
                placeholder="Ex: Corrigir o pedido de tutela de urgência e revisar valor da causa..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalDevolver(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmarDevolucao}
              disabled={salvando || !devolverObs.trim()}
              className="bg-warning text-warning-foreground hover:bg-warning/90"
            >
              {salvando && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Confirmar devolução
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Marcar como Protocolado */}
      <Dialog open={modalProtocolo} onOpenChange={setModalProtocolo}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar protocolo</DialogTitle>
            <DialogDescription>
              Informe os dados do protocolo para arquivar o item como concluído.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Número do protocolo (opcional)</Label>
              <Input
                value={numeroProtocolo}
                onChange={(e) => setNumeroProtocolo(e.target.value)}
                placeholder="Ex: 2026.0001234-PJE"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Link do comprovante (opcional)</Label>
              <Input
                value={comprovanteUrl}
                onChange={(e) => setComprovanteUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalProtocolo(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmarProtocolo} disabled={salvando}>
              {salvando && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Concluir protocolo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
