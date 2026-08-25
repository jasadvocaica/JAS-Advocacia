import { useState } from "react";
import { Sparkles, Loader2, CheckCircle2, AlertTriangle, Clock, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
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

const BIA_HABILITADA = import.meta.env.VITE_BIA_ENABLED === "true";

type Alvo = "publicacao" | "item_controladoria";

export interface AcaoSugerida {
  tipo:
    | "criar_item_controladoria"
    | "marcar_publicacao_vista"
    | "arquivar_publicacao"
    | "vincular_processo";
  label: string;
  payload?: {
    tipo?: string;
    titulo?: string;
    descricao?: string;
    prioridade?: string;
    data_vencimento_iso?: string;
  };
}

export interface BiaSugestoes {
  classificacao: string;
  urgencia: "urgente" | "alta" | "media" | "baixa";
  prazo_dias: number;
  resumo: string;
  proximos_passos: string;
  acoes_sugeridas: AcaoSugerida[];
  contexto?: {
    processo_id: string | null;
    processo_cnj: string | null;
    cliente_id: string | null;
    responsavel_sugerido_id: string | null;
  };
}

interface Props {
  alvo: Alvo;
  id: string;
  /** Variant do botão de gatilho */
  size?: "sm" | "default";
  rotulo?: string;
  /** Callback quando uma ação é executada com sucesso */
  onAcaoExecutada?: () => void;
}

const URGENCIA_CLASS: Record<string, string> = {
  urgente: "bg-destructive/10 text-destructive border-destructive/30",
  alta: "bg-warning/10 text-warning border-warning/30",
  media: "bg-primary/10 text-primary border-primary/30",
  baixa: "bg-muted text-muted-foreground border-border",
};

export function BiaAcoesButton({ alvo, id, size = "sm", rotulo = "Bia", onAcaoExecutada }: Props) {
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [sugestoes, setSugestoes] = useState<BiaSugestoes | null>(null);
  const [aplicando, setAplicando] = useState<number | null>(null);
  const [aplicadas, setAplicadas] = useState<Set<number>>(new Set());
  const [aplicandoTodas, setAplicandoTodas] = useState(false);
  const [confirmTodas, setConfirmTodas] = useState(false);

  if (!BIA_HABILITADA) return null;

  async function analisar(e: React.MouseEvent) {
    e.stopPropagation();
    setAberto(true);
    if (sugestoes) return;
    setCarregando(true);
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
      setAberto(false);
    } finally {
      setCarregando(false);
    }
  }

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
          data_vencimento: p.data_vencimento_iso ?? new Date(Date.now() + 86400000 * 3).toISOString(),
          processo_id: ctx?.processo_id ?? null,
          cliente_id: ctx?.cliente_id ?? null,
          origem: "controladoria",
        });
        if (error) throw error;
        toast({ title: "Item criado na controladoria" });

        if (alvo === "publicacao") {
          // Marca a publicação como vista quando criamos um item dela
          await supabase.from("pje_publicacoes").update({ status_leitura: "vista" }).eq("id", id);
        }
      } else if (acao.tipo === "marcar_publicacao_vista") {
        const { error } = await supabase
          .from("pje_publicacoes")
          .update({ status_leitura: "vista" })
          .eq("id", id);
        if (error) throw error;
        toast({ title: "Publicação marcada como vista" });
      } else if (acao.tipo === "arquivar_publicacao") {
        const { error } = await supabase
          .from("pje_publicacoes")
          .update({ status_leitura: "arquivada" })
          .eq("id", id);
        if (error) throw error;
        toast({ title: "Publicação arquivada" });
      } else if (acao.tipo === "vincular_processo") {
        toast({
          title: "Vincular processo",
          description: "Abra a publicação para escolher o processo manualmente.",
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
    const total = sugestoes.acoes_sugeridas.length;
    for (let i = 0; i < total; i++) {
      if (aplicadas.has(i)) continue;
      await aplicar(i, sugestoes.acoes_sugeridas[i]);
    }
    setAplicandoTodas(false);
    toast({ title: "Lote aplicado", description: "Todas as ações pendentes foram processadas." });
  }

  return (
    <>
      <Button
        size={size}
        variant="outline"
        onClick={analisar}
        className="gap-1 border-primary/40 text-primary hover:bg-primary/5"
        title="Analisar com a Bia (IA)"
      >
        <Sparkles className="w-3.5 h-3.5" />
        {rotulo}
      </Button>

      <Sheet open={aberto} onOpenChange={setAberto}>
        <SheetContent className="w-[min(480px,100vw)] sm:max-w-none flex flex-col p-0">
          <SheetHeader className="px-5 py-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" /> Análise da Bia
            </SheetTitle>
            <SheetDescription>
              Sugestões geradas por IA. Nada é executado sem sua confirmação.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {carregando && (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Analisando...
              </div>
            )}

            {sugestoes && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="capitalize">
                    {sugestoes.classificacao}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn("capitalize", URGENCIA_CLASS[sugestoes.urgencia])}
                  >
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
                  <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                    Resumo
                  </h4>
                  <p className="text-sm">{sugestoes.resumo}</p>
                </div>

                <div>
                  <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                    Próximos passos
                  </h4>
                  <p className="text-sm whitespace-pre-line">{sugestoes.proximos_passos}</p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs uppercase tracking-wider text-muted-foreground">
                      Ações sugeridas
                    </h4>
                    {sugestoes.acoes_sugeridas.length > 0 &&
                      aplicadas.size < sugestoes.acoes_sugeridas.length && (
                        <Button
                          size="sm"
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
                                <p>Tipo: {a.payload.tipo}</p>
                                {a.payload.data_vencimento_iso && (
                                  <p>
                                    Vence em:{" "}
                                    {new Date(a.payload.data_vencimento_iso).toLocaleDateString(
                                      "pt-BR",
                                    )}
                                  </p>
                                )}
                                {a.payload.descricao && (
                                  <p className="line-clamp-2">{a.payload.descricao}</p>
                                )}
                              </div>
                            )}
                          </div>
                          {feita ? (
                            <Badge variant="outline" className="bg-success/10 text-success border-success/30">
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
          </div>

          <div className="border-t p-3 flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => setAberto(false)}>
              <X className="w-3.5 h-3.5 mr-1" /> Fechar
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmTodas} onOpenChange={setConfirmTodas}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aplicar todas as ações sugeridas?</AlertDialogTitle>
            <AlertDialogDescription>
              {sugestoes && (
                <>
                  Serão executadas{" "}
                  <strong>{sugestoes.acoes_sugeridas.length - aplicadas.size}</strong>{" "}
                  ação(ões) em sequência. Itens já marcados como feitos serão
                  ignorados. Deseja continuar?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={aplicarTodas}>Aplicar todas</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
