import { useEffect, useState } from "react";
import { Sparkles, Loader2, CheckCircle2, AlertTriangle, Clock, RefreshCw, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { AcaoSugerida, BiaSugestoes } from "./BiaAcoesButton";

const URGENCIA_CLASS: Record<string, string> = {
  urgente: "bg-destructive/10 text-destructive border-destructive/30",
  alta: "bg-warning/10 text-warning border-warning/30",
  media: "bg-primary/10 text-primary border-primary/30",
  baixa: "bg-muted text-muted-foreground border-border",
};

interface Props {
  alvo: "publicacao" | "item_controladoria";
  id: string;
  /** Carrega análise automaticamente ao montar */
  autoLoad?: boolean;
  onAcaoExecutada?: () => void;
}

/**
 * Painel inline da Bia — mesma análise + ações do BiaAcoesButton, mas
 * pensado para ficar embutido (ex.: aba "IA" do ItemDetalheSheet).
 */
export function BiaCentralInline({ alvo, id, autoLoad = true, onAcaoExecutada }: Props) {
  const [carregando, setCarregando] = useState(false);
  const [sugestoes, setSugestoes] = useState<BiaSugestoes | null>(null);
  const [aplicando, setAplicando] = useState<number | null>(null);
  const [aplicadas, setAplicadas] = useState<Set<number>>(new Set());
  const [aplicandoTodas, setAplicandoTodas] = useState(false);
  const [confirmTodas, setConfirmTodas] = useState(false);

  async function analisar() {
    setCarregando(true);
    setAplicadas(new Set());
    try {
      const { data, error } = await supabase.functions.invoke("bia-acoes", {
        body: { alvo, id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setSugestoes(data as BiaSugestoes);
    } catch (err) {
      toast({
        title: "Bia não conseguiu analisar",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    if (autoLoad && id) void analisar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, alvo]);

  async function aplicar(idx: number, acao: AcaoSugerida) {
    if (!sugestoes) return;
    setAplicando(idx);
    try {
      const ctx = sugestoes.contexto;
      if (acao.tipo === "criar_item_controladoria") {
        const p = acao.payload ?? {};
        const { error } = await supabase.from("controladoria_itens").insert({
          tipo: (p.tipo ?? "diligencia") as any,
          titulo: p.titulo ?? `${sugestoes.classificacao} - revisar`,
          descricao: p.descricao ?? sugestoes.proximos_passos,
          prioridade: (p.prioridade ?? sugestoes.urgencia ?? "media") as any,
          data_vencimento:
            p.data_vencimento_iso ?? new Date(Date.now() + 86400000 * 3).toISOString(),
          processo_id: ctx?.processo_id ?? null,
          cliente_id: ctx?.cliente_id ?? null,
          origem: "controladoria",
        });
        if (error) throw error;
        toast({ title: "Item criado na controladoria" });
      } else if (acao.tipo === "marcar_publicacao_vista" && alvo === "publicacao") {
        const { error } = await supabase
          .from("pje_publicacoes")
          .update({ status_leitura: "vista" })
          .eq("id", id);
        if (error) throw error;
        toast({ title: "Publicação marcada como vista" });
      } else if (acao.tipo === "arquivar_publicacao" && alvo === "publicacao") {
        const { error } = await supabase
          .from("pje_publicacoes")
          .update({ status_leitura: "arquivada" })
          .eq("id", id);
        if (error) throw error;
        toast({ title: "Publicação arquivada" });
      } else if (acao.tipo === "vincular_processo") {
        toast({
          title: "Vincular processo",
          description: "Abra o item para vincular o processo manualmente.",
        });
      }
      setAplicadas((s) => new Set(s).add(idx));
      onAcaoExecutada?.();
    } catch (err) {
      toast({
        title: "Falha ao aplicar ação",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setAplicando(null);
    }
  }

  async function aplicarTodas() {
    if (!sugestoes) return;
    setConfirmTodas(false);
    setAplicandoTodas(true);
    const antes = aplicadas.size;
    const total = sugestoes.acoes_sugeridas.length;
    for (let i = 0; i < total; i++) {
      if (aplicadas.has(i)) continue;
      await aplicar(i, sugestoes.acoes_sugeridas[i]);
    }
    setAplicandoTodas(false);
    // Lê o set atualizado via callback funcional
    setAplicadas((s) => {
      const ok = s.size - antes;
      const falhas = total - antes - ok;
      toast({
        title: "Ações aplicadas em lote",
        description: `${ok} executada(s)${falhas ? `, ${falhas} falha(s)` : ""}.`,
      });
      return s;
    });
  }

  return (
    <div className="px-6 py-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Central de ações da Bia</h3>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={analisar}
          disabled={carregando}
          title="Reanalisar"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", carregando && "animate-spin")} />
        </Button>
      </div>

      {carregando && !sugestoes && (
        <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Analisando contexto do item...
        </div>
      )}

      {!carregando && !sugestoes && (
        <div className="text-center py-10">
          <Button onClick={analisar} variant="outline" className="gap-2">
            <Sparkles className="w-4 h-4" /> Analisar com a Bia
          </Button>
        </div>
      )}

      {sugestoes && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="capitalize">
              {sugestoes.classificacao}
            </Badge>
            <Badge variant="outline" className={cn("capitalize", URGENCIA_CLASS[sugestoes.urgencia])}>
              {sugestoes.urgencia === "urgente" ? (
                <AlertTriangle className="w-3 h-3 mr-1" />
              ) : (
                <Clock className="w-3 h-3 mr-1" />
              )}
              {sugestoes.urgencia}
            </Badge>
            {sugestoes.prazo_dias > 0 && (
              <Badge variant="outline">{sugestoes.prazo_dias} dia(s) úteis</Badge>
            )}
          </div>

          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Resumo</p>
            <p className="text-sm">{sugestoes.resumo}</p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
              Próximos passos
            </p>
            <p className="text-sm whitespace-pre-line">{sugestoes.proximos_passos}</p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Ações sugeridas
              </p>
              {sugestoes.acoes_sugeridas.length > 0 &&
                aplicadas.size < sugestoes.acoes_sugeridas.length && (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => setConfirmTodas(true)}
                    disabled={aplicandoTodas || aplicando !== null}
                    className="gap-1 h-7"
                  >
                    {aplicandoTodas ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Zap className="w-3.5 h-3.5" />
                    )}
                    Aplicar todas
                  </Button>
                )}
            </div>
            <div className="space-y-2">
              {sugestoes.acoes_sugeridas.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhuma ação sugerida.</p>
              )}
              {sugestoes.acoes_sugeridas.map((a, i) => {
                const feita = aplicadas.has(i);
                return (
                  <div
                    key={i}
                    className="rounded-md border p-3 flex items-start justify-between gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{a.label}</p>
                      {a.tipo === "criar_item_controladoria" && a.payload && (
                        <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                          {a.payload.tipo && <p>Tipo: {a.payload.tipo}</p>}
                          {a.payload.data_vencimento_iso && (
                            <p>
                              Vence em:{" "}
                              {new Date(a.payload.data_vencimento_iso).toLocaleDateString("pt-BR")}
                            </p>
                          )}
                          {a.payload.descricao && (
                            <p className="line-clamp-2">{a.payload.descricao}</p>
                          )}
                        </div>
                      )}
                    </div>
                    {feita ? (
                      <Badge
                        variant="outline"
                        className="bg-success/10 text-success border-success/30"
                      >
                        <CheckCircle2 className="w-3 h-3 mr-1" /> feito
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => aplicar(i, a)}
                        disabled={aplicando !== null}
                      >
                        {aplicando === i ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          "Aplicar"
                        )}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      <AlertDialog open={confirmTodas} onOpenChange={setConfirmTodas}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aplicar todas as ações sugeridas?</AlertDialogTitle>
            <AlertDialogDescription>
              {sugestoes && (
                <>
                  Serão executadas{" "}
                  <strong>
                    {sugestoes.acoes_sugeridas.length - aplicadas.size}
                  </strong>{" "}
                  ação(ões) em sequência. Itens já marcados como feitos serão
                  ignorados. Deseja continuar?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={aplicarTodas}>
              Aplicar todas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
