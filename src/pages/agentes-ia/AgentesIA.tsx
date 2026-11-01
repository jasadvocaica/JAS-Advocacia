import { useState } from "react";
import {
  Bot,
  Play,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  LABEL_STATUS_EXECUCAO,
  useAgentesIA,
  type AgenteIA,
  type ExecucaoAgente,
} from "./hooks/useAgentesIA";

const ESTILO_STATUS: Record<ExecucaoAgente["status"], string> = {
  pendente: "bg-muted text-muted-foreground border-border",
  executando: "bg-info/15 text-info border-info/30",
  aguardando_aprovacao: "bg-warning/15 text-warning border-warning/30",
  concluida: "bg-success/15 text-success border-success/30",
  rejeitada: "bg-muted text-muted-foreground border-border",
  erro: "bg-destructive/15 text-destructive border-destructive/30",
  cancelada: "bg-muted text-muted-foreground border-border",
};

function dataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AgentesIA() {
  const { agentes, execucoes, pendentesAprovacao, loading, error, recarregar, disparar, decidir } =
    useAgentesIA();
  const { toast } = useToast();

  const [executando, setExecutando] = useState<string | null>(null);
  const [revisao, setRevisao] = useState<ExecucaoAgente | null>(null);
  const [observacao, setObservacao] = useState("");
  const [processando, setProcessando] = useState(false);

  async function rodar(agente: AgenteIA) {
    setExecutando(agente.slug);
    try {
      await disparar(agente.slug, {});
      toast({
        title: `${agente.nome} iniciado.`,
        description: "O resultado aparece abaixo em instantes.",
      });
    } catch (e) {
      toast({
        title: "Não foi possível executar",
        description: e instanceof Error ? e.message : "Erro desconhecido.",
        variant: "destructive",
      });
    } finally {
      setExecutando(null);
    }
  }

  async function decidirRevisao(decisao: "aprovado" | "rejeitado") {
    if (!revisao) return;
    setProcessando(true);
    try {
      await decidir(revisao.id, decisao, observacao || undefined);
      toast({
        title: decisao === "aprovado" ? "Aprovado" : "Rejeitado",
        description:
          decisao === "aprovado"
            ? "A execução foi marcada como concluída."
            : "O resultado foi descartado.",
      });
      setRevisao(null);
      setObservacao("");
    } catch (e) {
      toast({
        title: "Falha ao registrar decisão",
        description: e instanceof Error ? e.message : "Erro desconhecido.",
        variant: "destructive",
      });
    } finally {
      setProcessando(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Bot className="h-5 w-5 text-muted-foreground" aria-hidden />
            Agentes de IA
          </h1>
          <p className="text-sm text-muted-foreground">
            Acione os agentes do escritório. Tudo que exigir ação externa passa pela sua aprovação.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={recarregar} disabled={loading}>
          <RefreshCw className={cn("mr-2 h-3.5 w-3.5", loading && "animate-spin")} />
          Atualizar
        </Button>
      </header>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {pendentesAprovacao.length > 0 ? (
        <Card className="border-warning/40 bg-warning/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
              {pendentesAprovacao.length} resultado(s) aguardando sua revisão
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {pendentesAprovacao.map((e) => (
              <div
                key={e.id}
                className="flex flex-col gap-2 rounded-md border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{e.agente?.nome ?? "Agente"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {e.resumo ?? "Sem resumo. Abra para ver o conteúdo."}
                  </p>
                </div>
                <Button size="sm" onClick={() => setRevisao(e)}>
                  Revisar
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {loading && agentes.length === 0
          ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-lg" />)
          : agentes.map((agente) => (
              <Card key={agente.id} className={cn("flex flex-col", !agente.ativo && "opacity-60")}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm">{agente.nome}</CardTitle>
                    <div className="flex shrink-0 gap-1">
                      {agente.exige_aprovacao ? (
                        <Badge variant="outline" className="text-[10px]">
                          Revisão
                        </Badge>
                      ) : null}
                      {!agente.webhook_url ? (
                        <Badge variant="outline" className="border-warning/40 text-[10px] text-warning">
                          Sem webhook
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <CardDescription className="text-xs leading-relaxed">
                    {agente.descricao}
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-auto pt-2">
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={executando === agente.slug || !agente.ativo || !agente.webhook_url}
                    onClick={() => rodar(agente)}
                  >
                    {executando === agente.slug ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="mr-2 h-3.5 w-3.5" />
                    )}
                    Executar agora
                  </Button>
                </CardContent>
              </Card>
            ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Histórico de execuções</h2>
        {execucoes.length === 0 ? (
          <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            Nenhuma execução registrada ainda.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {execucoes.map((e) => (
              <li key={e.id}>
                <Collapsible>
                  <div className="rounded-md border bg-card">
                    <CollapsibleTrigger className="flex w-full items-center gap-2 p-2.5 text-left">
                      <Badge
                        variant="outline"
                        className={cn("shrink-0 text-[10px]", ESTILO_STATUS[e.status])}
                      >
                        {LABEL_STATUS_EXECUCAO[e.status]}
                      </Badge>
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">
                        {e.agente?.nome ?? "Agente"}
                        {e.resumo ? ` — ${e.resumo}` : ""}
                      </span>
                      <span className="hidden shrink-0 items-center gap-1 text-[10px] text-muted-foreground sm:flex">
                        <Clock className="h-3 w-3" aria-hidden />
                        {dataHora(e.iniciado_em)}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="space-y-2 border-t px-2.5 py-2 text-xs">
                        {e.erro ? <p className="text-destructive">{e.erro}</p> : null}
                        <div>
                          <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                            Entrada
                          </p>
                          <pre className="max-h-32 overflow-auto rounded bg-muted/50 p-2 text-[11px]">
                            {JSON.stringify(e.entrada ?? {}, null, 2)}
                          </pre>
                        </div>
                        {e.saida ? (
                          <div>
                            <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                              Saída
                            </p>
                            <pre className="max-h-52 overflow-auto rounded bg-muted/50 p-2 text-[11px]">
                              {JSON.stringify(e.saida, null, 2)}
                            </pre>
                          </div>
                        ) : null}
                        {e.duracao_ms ? (
                          <p className="text-[10px] text-muted-foreground">
                            Duração: {(e.duracao_ms / 1000).toFixed(1)}s
                          </p>
                        ) : null}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={!!revisao} onOpenChange={(o) => !o && setRevisao(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Revisar resultado — {revisao?.agente?.nome}</DialogTitle>
            <DialogDescription>
              Nada é enviado a cliente ou protocolado sem esta aprovação.
            </DialogDescription>
          </DialogHeader>

          <pre className="max-h-[45vh] overflow-auto rounded-md bg-muted/50 p-3 text-xs">
            {JSON.stringify(revisao?.saida ?? {}, null, 2)}
          </pre>

          <Textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Observação para o histórico (opcional)"
            rows={2}
          />

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => decidirRevisao("rejeitado")}
              disabled={processando}
            >
              <XCircle className="mr-2 h-4 w-4" />
              Rejeitar
            </Button>
            <Button onClick={() => decidirRevisao("aprovado")} disabled={processando}>
              {processando ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Aprovar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
