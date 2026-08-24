import { useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, CheckCircle2, Clock, FileText, FolderOpen, Loader2,
  PauseCircle, PlayCircle, RotateCcw, Send, ShieldAlert, Stamp, Undo2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import ItemDetalheSheet from "@/pages/controladoria/ItemDetalheSheet";
import { ETAPA_LABEL, etapaAtualDe } from "@/pages/controladoria/workflow";
import { PRIORIDADE_CLASS, PRIORIDADE_LABELS } from "@/pages/controladoria/types";
import { usePainelProducaoData } from "./usePainelProducaoData";
import {
  aguardandoDocumentos, classificarUrgencia, diasDesde, filas, horasDesde, minhasTarefas,
  precisaDeMimAgora, resumo, slaReferencia, SLA_PRODUCAO_DIAS_UTEIS,
  type ItemProducao,
} from "./logic";
import {
  aguardarDocumentos, enviarParaRevisao, iniciarProducao, registrarProtocolo,
  reenviarParaRevisao, retomarProducao,
} from "./acoes";

const URGENCIA_CLASS: Record<string, string> = {
  vencido: "bg-destructive/15 text-destructive border-destructive/30",
  hoje: "bg-warning/15 text-warning border-warning/30",
  proximo: "bg-muted text-muted-foreground border-border",
  sem_prazo: "bg-muted text-muted-foreground border-border",
};
const URGENCIA_LABEL: Record<string, string> = {
  vencido: "Vencido", hoje: "Hoje", proximo: "No prazo", sem_prazo: "Sem prazo",
};

function Secao({ titulo, contagem, id, children }: {
  titulo: string; contagem?: number; id?: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="space-y-3 scroll-mt-20">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold">{titulo}</h2>
        {contagem !== undefined && <Badge variant="secondary">{contagem}</Badge>}
      </div>
      {children}
    </section>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{texto}</p>;
}

type Acao = { label: string; icon: any; onClick: () => void; variant?: "default" | "outline" | "secondary" };

function ItemCard({ item, acoes, onAbrir, extra }: {
  item: ItemProducao; acoes: Acao[]; onAbrir: () => void; extra?: React.ReactNode;
}) {
  const urg = classificarUrgencia(item);
  const sla = slaReferencia(item);
  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <button onClick={onAbrir} className="text-left text-sm font-medium hover:underline">
              {item.titulo}
            </button>
            <p className="truncate text-xs text-muted-foreground">
              {item.cliente_nome ?? "Sem cliente vinculado"}
              {item.processo_cnj ? ` · ${item.processo_cnj}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <Badge variant="outline" className={cn("text-[11px]", URGENCIA_CLASS[urg])}>
              {URGENCIA_LABEL[urg]}
              {item.data_vencimento ? ` · ${formatDate(item.data_vencimento)}` : ""}
            </Badge>
            {item.prioridade && (
              <Badge variant="outline" className={cn("text-[11px]", PRIORIDADE_CLASS[item.prioridade as never])}>
                {PRIORIDADE_LABELS[item.prioridade as never] ?? item.prioridade}
              </Badge>
            )}
            <Badge variant="outline" className="text-[11px]">{ETAPA_LABEL[etapaAtualDe(item)]}</Badge>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>Entrada: {item.criado_em ? formatDate(item.criado_em) : "—"}</span>
          <span>Em curso há {sla.diasCorridos ?? 0} dia(s)</span>
          {item.origem && <span>Origem: {item.origem}</span>}
          {sla.emPausa && <span className="text-warning">Aguardando documentos</span>}
        </div>

        {extra}

        <div className="flex flex-wrap gap-2">
          {acoes.map((a) => (
            <Button key={a.label} size="sm" variant={a.variant ?? "outline"} onClick={a.onClick}>
              <a.icon className="mr-1.5 h-3.5 w-3.5" />{a.label}
            </Button>
          ))}
          {item.processo_id && (
            <Button size="sm" variant="ghost" asChild>
              <Link to={`/processos/${item.processo_id}`}>
                <FolderOpen className="mr-1.5 h-3.5 w-3.5" />Abrir processo
              </Link>
            </Button>
          )}
          {item.cliente_id && (
            <Button size="sm" variant="ghost" asChild>
              <Link to={`/clientes/${item.cliente_id}`}>
                <FileText className="mr-1.5 h-3.5 w-3.5" />Ver documentos
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function PainelProducao() {
  const { user, isGestor } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id ?? "";
  const { data, isLoading, isError, refetch, isFetching } = usePainelProducaoData(userId);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<
    | null
    | { tipo: "aguardar" | "revisao" | "reenviar" | "protocolo" | "retomar"; item: ItemProducao }
  >(null);
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);

  const modelo = useMemo(() => {
    const itens = data?.itens ?? [];
    const f = filas(itens, userId);
    return { f, agora: precisaDeMimAgora(f), resumo: resumo(f), tarefas: minhasTarefas(f) };
  }, [data, userId]);

  if (!user) return <Navigate to="/login" replace />;

  const revisor = data?.revisor;
  const revisorOk = !!revisor?.configurado && !!revisor?.ativo;

  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ["painel-producao"] });
    qc.invalidateQueries({ queryKey: ["controladoria"] });
  };

  const executar = async (fn: () => Promise<{ ok: boolean; erro?: string }>, sucesso: string) => {
    setSalvando(true);
    const r = await fn();
    setSalvando(false);
    if (!r.ok) { toast.error(r.erro ?? "Não foi possível concluir a ação"); return; }
    toast.success(sucesso);
    setDialogo(null);
    setTexto("");
    recarregar();
  };

  const confirmarDialogo = () => {
    if (!dialogo) return;
    const { tipo, item } = dialogo;
    if (tipo === "aguardar") return executar(() => aguardarDocumentos(item.id, texto), "Registrado: aguardando documentos");
    if (tipo === "retomar") return executar(() => retomarProducao(item.id, { documentoRecebido: texto }), "Produção retomada");
    if (tipo === "revisao") return executar(() => enviarParaRevisao(item, revisor, texto), "Enviado para revisão");
    if (tipo === "reenviar") return executar(() => reenviarParaRevisao(item, revisor, texto), "Reenviado para revisão");
    if (tipo === "protocolo") return executar(() => registrarProtocolo(item, userId, texto), "Protocolo registrado");
  };

  const abrir = (id: string) => setDetalheId(id);
  const pedir = (tipo: NonNullable<typeof dialogo>["tipo"], item: ItemProducao) => { setTexto(""); setDialogo({ tipo, item }); };

  const acoesProducao = (i: ItemProducao): Acao[] => [
    { label: "Continuar", icon: PlayCircle, onClick: () => abrir(i.id), variant: "default" },
    { label: "Aguardar documentos", icon: PauseCircle, onClick: () => pedir("aguardar", i) },
    { label: "Enviar para revisão", icon: Send, onClick: () => pedir("revisao", i) },
  ];

  const resumoCards = [
    { label: "Novos", valor: modelo.resumo.novos, id: "novos" },
    { label: "Em produção", valor: modelo.resumo.emProducao, id: "producao" },
    { label: "Aguardando documentos", valor: modelo.resumo.aguardandoDocumentos, id: "documentos" },
    { label: "Ajustes", valor: modelo.resumo.ajustes, id: "ajustes" },
    { label: "Aguardando protocolo", valor: modelo.resumo.aguardandoProtocolo, id: "protocolo" },
    { label: "Atrasados", valor: modelo.resumo.atrasados, id: "tarefas" },
  ];

  if (isLoading) {
    return <div className="space-y-4 p-1">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}</div>;
  }

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="Painel da produção jurídica"
        description="Mesa de trabalho das peças e providências atribuídas a você na Controladoria."
      >
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Atualizar
        </Button>
      </PageHeader>

      {isError && (
        <Card><CardContent className="p-4 text-sm text-destructive">
          Não foi possível carregar suas tarefas. Tente atualizar.
        </CardContent></Card>
      )}

      {!revisorOk && (
        <Card className="border-warning/40">
          <CardContent className="flex items-start gap-2 p-4 text-sm">
            <ShieldAlert className="mt-0.5 h-4 w-4 text-warning" />
            <span>
              <strong>Revisor não configurado.</strong> O envio para revisão fica bloqueado até o gestor
              definir o revisor padrão da produção jurídica nas configurações — nenhum revisor é atribuído automaticamente.
            </span>
          </CardContent>
        </Card>
      )}

      {/* Resumo clicável */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {resumoCards.map((c) => (
          <a key={c.id} href={`#${c.id}`}>
            <Card className="transition hover:border-primary/40">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="text-2xl font-semibold">{c.valor}</p>
              </CardContent>
            </Card>
          </a>
        ))}
      </div>

      {/* 1) Precisa de mim agora */}
      <Secao titulo="Precisa de mim agora" contagem={modelo.agora.length} id="agora">
        {modelo.agora.length === 0 ? (
          <Vazio texto="Nada aguardando ação imediata sua." />
        ) : (
          <div className="space-y-3">
            {modelo.agora.slice(0, 8).map((i) => {
              const etapa = etapaAtualDe(i);
              const acoes: Acao[] =
                etapa === "criacao"
                  ? [{ label: "Iniciar produção", icon: PlayCircle, variant: "default", onClick: () => executar(() => iniciarProducao(i, userId), "Produção iniciada") }]
                  : etapa === "correcao"
                    ? [{ label: "Reenviar para revisão", icon: Undo2, variant: "default", onClick: () => pedir("reenviar", i) }]
                    : etapa === "protocolo"
                      ? [{ label: "Registrar protocolo", icon: Stamp, variant: "default", onClick: () => pedir("protocolo", i) }]
                      : acoesProducao(i);
              return <ItemCard key={i.id} item={i} acoes={acoes} onAbrir={() => abrir(i.id)} />;
            })}
          </div>
        )}
      </Secao>

      {/* 2) Ajustes solicitados */}
      <Secao titulo="Ajustes solicitados" contagem={modelo.f.ajustes.length} id="ajustes">
        {modelo.f.ajustes.length === 0 ? <Vazio texto="Nenhum ajuste devolvido para você." /> : (
          <div className="space-y-3">
            {modelo.f.ajustes.map((i) => (
              <ItemCard
                key={i.id} item={i} onAbrir={() => abrir(i.id)}
                extra={i.comentario_revisao ? (
                  <p className="rounded-md bg-muted p-2 text-xs"><strong>Ajuste pedido:</strong> {i.comentario_revisao}</p>
                ) : null}
                acoes={[
                  { label: "Continuar", icon: PlayCircle, onClick: () => abrir(i.id) },
                  { label: "Reenviar para revisão", icon: Undo2, variant: "default", onClick: () => pedir("reenviar", i) },
                  { label: "Aguardar documentos", icon: PauseCircle, onClick: () => pedir("aguardar", i) },
                ]}
              />
            ))}
          </div>
        )}
      </Secao>

      {/* 3) Novos para produção */}
      <Secao titulo="Novos para produção" contagem={modelo.f.novos.length} id="novos">
        {modelo.f.novos.length === 0 ? <Vazio texto="Nenhum caso novo na sua fila." /> : (
          <div className="space-y-3">
            {modelo.f.novos.map((i) => (
              <ItemCard key={i.id} item={i} onAbrir={() => abrir(i.id)} acoes={[
                { label: "Iniciar produção", icon: PlayCircle, variant: "default", onClick: () => executar(() => iniciarProducao(i, userId), "Produção iniciada") },
              ]} />
            ))}
          </div>
        )}
      </Secao>

      {/* 4) Em produção */}
      <Secao titulo="Em produção" contagem={modelo.f.emProducao.length} id="producao">
        {modelo.f.emProducao.length === 0 ? <Vazio texto="Nenhuma peça em execução no momento." /> : (
          <div className="space-y-3">
            {modelo.f.emProducao.map((i) => (
              <ItemCard key={i.id} item={i} onAbrir={() => abrir(i.id)} acoes={acoesProducao(i)} />
            ))}
          </div>
        )}
      </Secao>

      {/* 5) Aguardando documentos */}
      <Secao titulo="Aguardando documentos" contagem={modelo.f.aguardandoDocumentos.length} id="documentos">
        {modelo.f.aguardandoDocumentos.length === 0 ? <Vazio texto="Nenhuma pendência de documentos." /> : (
          <div className="space-y-3">
            {modelo.f.aguardandoDocumentos.map((i) => (
              <ItemCard
                key={i.id} item={i} onAbrir={() => abrir(i.id)}
                extra={
                  <div className="rounded-md bg-muted p-2 text-xs">
                    <p><strong>Pendência:</strong> {i.sla_pausa_motivo ?? "—"}</p>
                    <p>
                      Solicitado em {i.sla_pausado_em ? formatDate(i.sla_pausado_em) : "—"} ·
                      {" "}aguardando há {diasDesde(i.sla_pausado_em) ?? 0} dia(s) ({horasDesde(i.sla_pausado_em) ?? 0}h)
                    </p>
                  </div>
                }
                acoes={[
                  { label: "Registrar documento recebido", icon: CheckCircle2, variant: "default", onClick: () => pedir("retomar", i) },
                  { label: "Retomar produção", icon: RotateCcw, onClick: () => executar(() => retomarProducao(i.id), "Produção retomada") },
                ]}
              />
            ))}
          </div>
        )}
      </Secao>

      {/* 6) Aguardando protocolo */}
      <Secao titulo="Aguardando protocolo" contagem={modelo.f.aguardandoProtocolo.length} id="protocolo">
        {modelo.f.aguardandoProtocolo.length === 0 ? (
          <Vazio texto="Nenhum protocolo atribuído a você." />
        ) : (
          <div className="space-y-3">
            {modelo.f.aguardandoProtocolo.map((i) => (
              <ItemCard key={i.id} item={i} onAbrir={() => abrir(i.id)} acoes={[
                { label: "Registrar protocolo", icon: Stamp, variant: "default", onClick: () => pedir("protocolo", i) },
              ]} />
            ))}
          </div>
        )}
      </Secao>

      {/* 7) Minhas tarefas */}
      <Secao titulo="Minhas tarefas" contagem={modelo.f.minhas.length} id="tarefas">
        <div className="grid gap-3 lg:grid-cols-3">
          {([
            ["Vencidas", modelo.tarefas.vencidas, AlertTriangle],
            ["Hoje", modelo.tarefas.hoje, Clock],
            ["Próximas", modelo.tarefas.proximas, ArrowRight],
          ] as const).map(([titulo, lista, Icone]) => (
            <Card key={titulo}>
              <CardContent className="space-y-2 p-4">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Icone className="h-4 w-4" />{titulo}
                  <Badge variant="secondary">{lista.length}</Badge>
                </p>
                {lista.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nada aqui.</p>
                ) : lista.slice(0, 6).map((i) => (
                  <button key={i.id} onClick={() => abrir(i.id)} className="block w-full truncate text-left text-xs hover:underline">
                    {i.titulo} · {ETAPA_LABEL[etapaAtualDe(i)]}
                    {aguardandoDocumentos(i) ? " · aguardando docs" : ""}
                  </button>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          SLA operacional de referência: {SLA_PRODUCAO_DIAS_UTEIS} dias úteis por peça. O desconto do tempo
          aguardando documentos está preparado (a pausa já é registrada), mas ainda não homologado — o prazo
          judicial não é alterado por este painel.
        </p>
        {isGestor && (
          <p className="text-xs text-muted-foreground">
            Você está vendo apenas os itens atribuídos a você. A visão geral continua na Controladoria.
          </p>
        )}
      </Secao>

      {/* Detalhe rápido — reutiliza o sheet canônico da Controladoria */}
      <ItemDetalheSheet
        itemId={detalheId}
        onOpenChange={(open) => !open && setDetalheId(null)}
        onEdit={() => {}}
        onChanged={recarregar}
      />

      <Dialog open={!!dialogo} onOpenChange={(o) => !o && setDialogo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogo?.tipo === "aguardar" && "Aguardar documentos do cliente"}
              {dialogo?.tipo === "retomar" && "Registrar documento recebido"}
              {dialogo?.tipo === "revisao" && "Enviar para revisão"}
              {dialogo?.tipo === "reenviar" && "Reenviar para revisão"}
              {dialogo?.tipo === "protocolo" && "Registrar protocolo"}
            </DialogTitle>
            <DialogDescription>
              {dialogo?.tipo === "aguardar" && "Informe o que está sendo aguardado. A produção contata o cliente diretamente; nenhuma tarefa é criada para o comercial."}
              {dialogo?.tipo === "retomar" && "Descreva o documento recebido. O tempo aguardando fica registrado no histórico."}
              {(dialogo?.tipo === "revisao" || dialogo?.tipo === "reenviar") &&
                (revisorOk ? `Revisor configurado: ${revisor?.nome ?? "—"}.` : "Revisor não configurado — ação bloqueada.")}
              {dialogo?.tipo === "protocolo" && "Informe os dados do protocolo. Ao concluir, a comunicação ao cliente é gerada pelo fluxo já existente."}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={dialogo?.tipo === "aguardar" ? "Ex.: aguardando CNIS atualizado" : "Observação (opcional)"}
            rows={4}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogo(null)}>Cancelar</Button>
            <Button
              onClick={confirmarDialogo}
              disabled={
                salvando ||
                (dialogo?.tipo === "aguardar" && !texto.trim()) ||
                ((dialogo?.tipo === "revisao" || dialogo?.tipo === "reenviar") && !revisorOk)
              }
            >
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
