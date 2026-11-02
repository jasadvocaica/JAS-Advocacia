import VpsConnector from "./escritorio/agent-editor/VpsConnector";
import CentralComando from "./escritorio/CentralComando";
import CentralMissoes from "./escritorio/missoes/CentralMissoes";
import SalaGestora from "./escritorio/missoes/SalaGestora";
import OfficeShell, { secaoOffice } from "./escritorio/OfficeShell";
import AgentEditor from "./escritorio/agent-editor/AgentEditor";
import EscritorioIsometrico from "./escritorio/EscritorioIsometrico";
import { useMatch, useNavigate, useLocation } from "react-router-dom";
import ChatEscritorio from "./escritorio/ChatEscritorio";
import EscritorioVisual, { horario } from "./EscritorioVisual";
import { chamarEscritorio } from "./hooks/useAgentesIA";
import { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    timeZone: "America/Cuiaba",
  });
}

export default function AgentesIA() {
  const {
    agentes,
    execucoes,
    consultas,
    tokens,
    atualizadoEm,
    passos,
    mensagens,
    operacaoDjen,
    pendentesAprovacao,
    loading,
    error,
    recarregar,
    disparar,
    decidir,
  } = useAgentesIA();
  const { toast } = useToast();
  const editMatch = useMatch("/escritorio/equipe/:agenteId/editar");
  const newMatch = useMatch("/escritorio/equipe/novo");
  const navigate = useNavigate();
  const editor = !!editMatch || !!newMatch;
  const location = useLocation();
  const secao = editor ? "configurar" : secaoOffice(location.pathname);
  const [contratarAberto, setContratarAberto] = useState(false);

  const [executando, setExecutando] = useState<string | null>(null);
  const [revisao, setRevisao] = useState<ExecucaoAgente | null>(null);
  const [observacao, setObservacao] = useState("");
  const [processando, setProcessando] = useState(false);

  async function rodar(agente: AgenteIA) {
    setExecutando(agente.slug);
    try {
      if (agente.executor === "analista_operacional") {
        await chamarEscritorio({ acao: "executar", agente_id: agente.id });
        await recarregar();
      } else await disparar(agente.slug, {});
      toast({
        title: `${agente.nome}: execução finalizada.`,
        description: "Confira o resultado e o estado registrado no histórico.",
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
    <OfficeShell
      secao={secao}
      contratar={() => navigate("/escritorio/equipe/novo")}
      recarregar={() => void recarregar()}
      loading={loading}
      pendentes={pendentesAprovacao.length}
      trabalhando={
        execucoes.filter(
          (e) =>
            e.status === "executando" &&
            Date.now() - new Date(e.iniciado_em).getTime() < 600000,
        ).length
      }
      atualizadoEm={atualizadoEm}
    >
      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <EscritorioVisual
        agentes={agentes}
        execucoes={execucoes}
        rodar={rodar}
        ocupado={executando !== null}
        recarregar={recarregar}
        revisar={setRevisao}
        modo={
          secao === "planta"
            ? "planta"
            : secao === "equipe"
              ? "equipe"
              : "somente-dialogos"
        }
        contratarAberto={contratarAberto}
        onContratarAberto={setContratarAberto}
      />
      {editor && (
        <AgentEditor
          agenteId={editMatch?.params.agenteId}
          agentes={agentes}
          recarregar={recarregar}
        />
      )}
      {secao === "comando" && <CentralComando />}
      {secao === "gestora" && (
        <SalaGestora agentes={agentes} execucoes={execucoes} mensagens={mensagens} />
      )}
      {secao === "missoes" && <CentralMissoes agentes={agentes} />}
      {secao === "isometrico" && (
        <EscritorioIsometrico
          agentes={agentes}
          execucoes={execucoes}
          atualizadoEm={atualizadoEm}
          ocupado={executando !== null}
          rodar={rodar}
          revisar={setRevisao}
        />
      )}
      {secao === "chat" && (
        <ChatEscritorio
          agentes={agentes}
          execucoes={execucoes}
          mensagens={mensagens}
          recarregar={recarregar}
        />
      )}

      {secao === "operacao" && <VpsConnector />}
      {secao === "operacao" && operacaoDjen ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Operação DJEN</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Triagem: {operacaoDjen.triagem_pendente} pendentes,{" "}
              {operacaoDjen.triagem_com_erro} com falha.
            </p>
            <p>
              Agenda: {operacaoDjen.agenda_pendente} aguardando confirmação,{" "}
              {operacaoDjen.agenda_com_erro} com falha.
            </p>
            <p className="text-xs text-muted-foreground">
              Última consulta concluída:{" "}
              {operacaoDjen.ultima_consulta
                ? new Date(operacaoDjen.ultima_consulta).toLocaleString(
                    "pt-BR",
                    { timeZone: "America/Cuiaba" },
                  )
                : "nenhuma registrada"}
              .
            </p>
            {operacaoDjen.triagem_com_erro + operacaoDjen.agenda_com_erro >
            0 ? (
              <p className="text-xs text-destructive">
                Confira o vínculo e o responsável da publicação e a autorização
                da agenda. Após corrigir, execute o Assistente de Controladoria
                para tentar novamente.
              </p>
            ) : null}
            {operacaoDjen.falhas?.length ? (
              <ul className="space-y-1 text-xs text-destructive">
                {operacaoDjen.falhas.map((falha, i) => (
                  <li key={`${falha.tipo}-${falha.referencia}-${i}`}>
                    {falha.tipo} · {falha.referencia}: {falha.erro}
                  </li>
                ))}
              </ul>
            ) : null}
            <a
              href="/ferramentas/publicacoes-pje"
              className="inline-block text-xs underline"
            >
              Ver publicações e vínculos
            </a>
            <a
              href="/controladoria"
              className="ml-4 inline-block text-xs underline"
            >
              Conferir tarefas e prazos
            </a>
          </CardContent>
        </Card>
      ) : null}

      {secao === "entregas" &&
        (pendentesAprovacao.length > 0 ? (
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
                    <p className="text-sm font-medium">
                      {e.agente?.nome ?? "Agente"}
                    </p>
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
        ) : (
          <div className="office-empty">
            <CheckCircle2 size={28} />
            <h3>Entregas em dia</h3>
            <p>Nenhum resultado aguardando sua revisão.</p>
          </div>
        ))}

      {secao === "operacao" && (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Consumo OpenAI hoje</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {tokens ? (
                  <>
                    <p>
                      {tokens.usados.toLocaleString("pt-BR")} usados ·{" "}
                      {tokens.reservados.toLocaleString("pt-BR")} reservados
                    </p>
                    <progress
                      className="my-2 h-2 w-full"
                      max={tokens.limite}
                      value={tokens.usados + tokens.reservados}
                    />
                    <p className="text-xs text-muted-foreground">
                      {tokens.disponiveis.toLocaleString("pt-BR")} disponíveis
                      de {tokens.limite.toLocaleString("pt-BR")}. Reinicia à
                      meia-noite de Cuiabá.
                    </p>
                  </>
                ) : (
                  <p>Consumo indisponível.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  Consultas reais do monitor DJEN
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="max-h-40 space-y-2 overflow-auto text-xs">
                  {consultas.map((c) => (
                    <li
                      key={c.id}
                      className="flex justify-between gap-2 border-b pb-2"
                    >
                      <time>{horario(c.iniciado_em)}</time>
                      <span>
                        {c.status} · {c.total_novas} novas · {c.total_erros}{" "}
                        falhas
                      </span>
                    </li>
                  ))}
                </ul>
                {consultas.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Nenhuma consulta disponível.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
          <p className="text-xs text-muted-foreground">
            {atualizadoEm
              ? `Dados consultados às ${horario(atualizadoEm)} · atualização automática a cada 15 segundos`
              : "Consultando dados do escritório…"}
          </p>
        </>
      )}
      {secao === "historico" && (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                Passos de trabalho registrados
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="max-h-56 space-y-2 overflow-auto text-xs">
                {passos.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-col gap-1 border-l-2 border-primary/30 pl-3"
                  >
                    <span>{p.mensagem}</span>
                    <time className="text-muted-foreground">
                      {horario(p.criado_em)}
                    </time>
                  </li>
                ))}
              </ul>
              {passos.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Os passos aparecerão aqui quando os agentes executarem suas
                  rotinas.
                </p>
              )}
            </CardContent>
          </Card>
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              Histórico de execuções
            </h2>
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
                            className={cn(
                              "shrink-0 text-[10px]",
                              ESTILO_STATUS[e.status],
                            )}
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
                          <ChevronDown
                            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                            aria-hidden
                          />
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="space-y-2 border-t px-2.5 py-2 text-xs">
                            {e.erro ? (
                              <p className="text-destructive">{e.erro}</p>
                            ) : null}
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
        </>
      )}
      <Dialog open={!!revisao} onOpenChange={(o) => !o && setRevisao(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Revisar resultado — {revisao?.agente?.nome}
            </DialogTitle>
            <DialogDescription>
              Sua decisão registra a revisão deste resultado. Aprovar não envia
              mensagens nem protocola documentos.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[45vh] overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm">
            {typeof revisao?.saida?.relatorio === "string"
              ? revisao.saida.relatorio
              : JSON.stringify(revisao?.saida ?? {}, null, 2)}
          </div>

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
            <Button
              onClick={() => decidirRevisao("aprovado")}
              disabled={processando}
            >
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
    </OfficeShell>
  );
}
