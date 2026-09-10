import { useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, CheckCircle2, ClipboardList, Loader2, PhoneCall,
  ShieldAlert, UserPlus, Users, CalendarClock,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ETAPA_LABEL, etapaAtualDe, type EtapaWorkflow } from "@/pages/controladoria/workflow";
import { usePainelValeskaData } from "./usePainelValeskaData";
import {
  comunicacoesDoPainel, comunicacoesSemResponsavel, contratacoesEmAberto, funilFichas,
  funilLeads, podeVerPainelComercial, precisaDeMimAgora, tarefasCriticas, tarefasDoUsuario,
  urgenciaComunicacao, type ComunicacaoPendente,
} from "./logic";

const URGENCIA_CLS = {
  atrasada: "bg-destructive/15 text-destructive border-destructive/30",
  hoje: "bg-warning/15 text-warning border-warning/30",
  no_prazo: "bg-muted text-muted-foreground",
} as const;

const URGENCIA_LABEL = { atrasada: "Atrasada", hoje: "Hoje", no_prazo: "No prazo" } as const;

function Secao({ titulo, icone: Icone, children, acao }: {
  titulo: string; icone: any; children: React.ReactNode; acao?: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Icone className="h-4 w-4 text-primary" /> {titulo}
        </h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{texto}</p>;
}

export default function PainelValeska() {
  const { user, isGestor } = useAuth();
  const { data, isLoading, isError, refetch, isFetching } = usePainelValeskaData(!!user);
  const [marcando, setMarcando] = useState<string | null>(null);
  const [comunicacaoSelecionada, setComunicacaoSelecionada] = useState<ComunicacaoPendente | null>(null);
  const [observacaoComunicacao, setObservacaoComunicacao] = useState("");

  const agora = new Date();
  const userId = user?.id ?? "";

  const modelo = useMemo(() => {
    const comunicacoesTodas = data?.comunicacoes ?? [];
    const responsavelId = data?.responsavel.user_id ?? null;
    // Comercial vê a própria fila; gestor supervisiona tudo.
    const minhas = comunicacoesDoPainel(comunicacoesTodas, agora).filter(
      (c) => isGestor || c.responsavel_id === userId,
    );
    const tarefas = tarefasDoUsuario(data?.tarefas ?? [], userId);
    const contratacoes = contratacoesEmAberto(data?.fichas ?? []);
    const semResponsavel = comunicacoesSemResponsavel(comunicacoesTodas);
    const followups = (data?.followups ?? [])
      .filter((f) => isGestor || f.responsavel_id === userId)
      .sort((a, b) => a.agendado_para.localeCompare(b.agendado_para));
    const followupsVencidos = followups.filter((f) => new Date(f.agendado_para).getTime() < agora.getTime());
    const pendenciasGerenciais = (data?.pendencias ?? []).filter(
      (p) => isGestor || p.codigo === "SEM_RESPONSAVEL_COMUNICACAO",
    );
    return {
      responsavelId,
      comunicacoes: minhas,
      atrasadas: minhas.filter((c) => urgenciaComunicacao(c, agora) === "atrasada"),
      tarefas,
      tarefasCriticas: tarefasCriticas(tarefas, agora),
      contratacoes,
      semResponsavel,
      pendenciasGerenciais,
      followups,
      followupsVencidos,
      funilFichas: funilFichas(data?.fichas ?? []),
      funilLeads: funilLeads(data?.leads ?? []),
      total: precisaDeMimAgora({
        comunicacoes: minhas, tarefas: tarefasCriticas(tarefas, agora),
        contratacoes, pendencias: pendenciasGerenciais,
      }) + followups.length,
    };
  }, [data, userId, isGestor]);

  const autorizado = podeVerPainelComercial({
    userId, responsavelConfigurado: data?.responsavel.user_id ?? null, isGestor,
  });

  async function marcarComunicado(c: ComunicacaoPendente) {
    setMarcando(c.id);
    const { error } = await (supabase as any).rpc("comunicacao_marcar_comunicada", {
      _id: c.id,
      _observacao: observacaoComunicacao.trim() || null,
    });
    setMarcando(null);
    if (error) { toast.error(error.message); return; }
    setComunicacaoSelecionada(null);
    setObservacaoComunicacao("");
    toast.success("Comunicação registrada no histórico da tarefa");
    refetch();
  }

  if (isLoading) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!autorizado) return <Navigate to="/sem-permissao" replace />;

  if (isError) {
    return (
      <div className="p-4 md:p-6">
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          Não foi possível carregar o painel. <Button variant="link" onClick={() => refetch()}>Tentar novamente</Button>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title="Painel comercial"
        description="Fichas, negociações registradas, tarefas e comunicação com o cliente após o protocolo."
      >
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Atualizar
        </Button>
      </PageHeader>

      {/* 1) Precisa de mim agora */}
      <Secao titulo={`Precisa de mim agora (${modelo.total})`} icone={AlertTriangle}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Clientes para avisar</p>
            <p className="text-2xl font-semibold">{modelo.comunicacoes.length}</p>
            <p className="text-xs text-destructive">{modelo.atrasadas.length} atrasadas</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Minhas tarefas críticas</p>
            <p className="text-2xl font-semibold">{modelo.tarefasCriticas.length}</p>
            <p className="text-xs text-muted-foreground">de {modelo.tarefas.length} atribuídas</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Contratações em aberto</p>
            <p className="text-2xl font-semibold">{modelo.contratacoes.length}</p>
            <p className="text-xs text-muted-foreground">fichas não convertidas</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Meus retornos comerciais</p>
            <p className="text-2xl font-semibold">{modelo.followups.length}</p>
            <p className="text-xs text-destructive">{modelo.followupsVencidos.length} vencidos</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Pendências registradas</p>
            <p className="text-2xl font-semibold">{modelo.pendenciasGerenciais.length}</p>
            <p className="text-xs text-muted-foreground">exceções da produção</p>
          </CardContent></Card>
        </div>
      </Secao>

      {/* Alerta gerencial: comunicação sem responsável configurado (sem fallback) */}
      {modelo.semResponsavel.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-2 text-sm">
              <ShieldAlert className="mt-0.5 h-4 w-4 text-destructive" />
              <span>
                <strong>{modelo.semResponsavel.length}</strong> comunicação(ões) sem responsável configurado.
                Defina o responsável comercial em Configurações — o sistema não repassa automaticamente para outra pessoa.
              </span>
            </div>
            {isGestor && (
              <Button asChild size="sm" variant="outline">
                <Link to="/configuracoes">Configurar responsável</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* 2) Clientes para avisar */}
      <Secao titulo="Clientes para avisar (pós-protocolo)" icone={PhoneCall}>
        {modelo.comunicacoes.length === 0 ? (
          <Vazio texto="Nenhuma comunicação pendente." />
        ) : (
          <div className="space-y-2">
            {modelo.comunicacoes.map((c) => {
              const u = urgenciaComunicacao(c, agora);
              return (
                <Card key={c.id}>
                  <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={cn("text-xs", URGENCIA_CLS[u])}>{URGENCIA_LABEL[u]}</Badge>
                        <span className="truncate text-sm font-medium">{c.cliente_nome ?? "Cliente não informado"}</span>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.item_titulo ?? "Tarefa protocolada"}
                        {c.processo_cnj ? ` · ${c.processo_cnj}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Ideal até {c.sla_preferencial_em ? formatDate(c.sla_preferencial_em) : "—"} ·
                        {" "}limite {c.sla_limite_em ? formatDate(c.sla_limite_em) : "—"} (prazo operacional, não judicial)
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {c.cliente_id && (
                        <Button asChild size="sm" variant="secondary">
                          <Link to={`/comercial?cliente=${c.cliente_id}`}>
                            <PhoneCall className="mr-1 h-3 w-3" />Comunicar
                          </Link>
                        </Button>
                      )}
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/controladoria?item=${c.item_id}`}>Abrir tarefa <ArrowRight className="ml-1 h-3 w-3" /></Link>
                      </Button>
                      {c.cliente_id && (
                        <Button asChild size="sm" variant="ghost">
                          <Link to={`/clientes/${c.cliente_id}`}>Cliente</Link>
                        </Button>
                      )}
                      <Button size="sm" disabled={marcando === c.id} onClick={() => setComunicacaoSelecionada(c)}>
                        {marcando === c.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <CheckCircle2 className="mr-1 h-3 w-3" />}
                        Cliente comunicado
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </Secao>

      <Secao titulo="Próximos contatos comerciais" icone={CalendarClock}>
        {modelo.followups.length === 0 ? (
          <Vazio texto="Nenhum retorno comercial atribuído a você." />
        ) : (
          <div className="space-y-2">
            {modelo.followups.slice(0, 10).map((f) => {
              const vencido = new Date(f.agendado_para).getTime() < agora.getTime();
              return (
                <Card key={f.id}>
                  <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={vencido ? "destructive" : "outline"}>{vencido ? "Vencido" : "Agendado"}</Badge>
                        <p className="truncate text-sm font-medium">{f.descricao}</p>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {f.conversa_nome || f.conversa_telefone || "Conversa vinculada"} ·{" "}
                        {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(f.agendado_para))}
                      </p>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/comercial?conversa=${f.conversa_id}`}>Abrir conversa</Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </Secao>

      {/* 3) Contratações em aberto */}
      <Secao
        titulo="Contratações iniciadas e não concluídas"
        icone={UserPlus}
        acao={<Button asChild size="sm" variant="ghost"><Link to="/clientes">Ver clientes</Link></Button>}
      >
        {modelo.contratacoes.length === 0 ? (
          <Vazio texto="Nenhuma ficha em aberto." />
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {modelo.contratacoes.slice(0, 8).map((f) => (
              <Card key={f.id}>
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{f.titulo ?? "Ficha de atendimento"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {f.cliente_nome ?? "Sem cliente"} · {f.area ?? "área não informada"}
                      {f.subtipo ? ` / ${f.subtipo}` : ""} · {formatDate(f.criado_em)}
                    </p>
                  </div>
                  {f.cliente_id && (
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/clientes/${f.cliente_id}?atendimento=${f.id}`}>Abrir ficha</Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </Secao>

      {/* 4) Funil comercial (somente registros internos) */}
      <Secao titulo="Funil comercial (registros internos)" icone={Users}>
        <div className="grid gap-3 md:grid-cols-2">
          <Card><CardContent className="space-y-2 p-4">
            <p className="text-xs font-medium text-muted-foreground">Fichas por estado</p>
            {modelo.funilFichas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem fichas cadastradas.</p>
            ) : modelo.funilFichas.map((f) => (
              <div key={f.chave} className="flex items-center justify-between text-sm">
                <span className="capitalize">{f.chave.replace(/_/g, " ")}</span>
                <Badge variant="secondary">{f.total}</Badge>
              </div>
            ))}
          </CardContent></Card>
          <Card><CardContent className="space-y-2 p-4">
            <p className="text-xs font-medium text-muted-foreground">Negociações registradas por estado</p>
            {modelo.funilLeads.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma negociação cadastrada.</p>
            ) : modelo.funilLeads.map((f) => (
              <div key={f.chave} className="flex items-center justify-between text-sm">
                <span className="capitalize">{f.chave.replace(/_/g, " ")}</span>
                <Badge variant="secondary">{f.total}</Badge>
              </div>
            ))}
          </CardContent></Card>
        </div>
      </Secao>

      {/* 5) Minhas tarefas */}
      <Secao
        titulo="Minhas tarefas"
        icone={ClipboardList}
        acao={
          <Button asChild size="sm" variant="ghost">
            <Link to={`/controladoria?responsavel=${userId}`}>Ver na Controladoria</Link>
          </Button>
        }
      >
        {modelo.tarefas.length === 0 ? (
          <Vazio texto="Nenhuma tarefa atribuída a você." />
        ) : (
          <div className="space-y-2">
            {modelo.tarefas.slice(0, 8).map((t) => (
              <Card key={t.id}>
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.titulo}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {ETAPA_LABEL[etapaAtualDe(t) as EtapaWorkflow]} · vence {formatDate(t.data_vencimento)}
                      {t.cliente_nome ? ` · ${t.cliente_nome}` : ""}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/controladoria?item=${t.id}`}>Abrir</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </Secao>

      {/* 6) Suporte interno — sem fonte de dados nesta fase */}
      <Secao titulo="Suporte interno" icone={ShieldAlert}>
        <Vazio texto="Indicador preparado, aguardando fonte de dados (não há registro interno de chamados de suporte)." />
      </Secao>
      <Dialog
        open={!!comunicacaoSelecionada}
        onOpenChange={(aberto) => {
          if (!aberto && !marcando) {
            setComunicacaoSelecionada(null);
            setObservacaoComunicacao("");
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirmar comunicação ao cliente</DialogTitle>
            <DialogDescription>
              Confirme somente depois de realizar a comunicação pelo canal escolhido. A data, o horário e seu usuário serão registrados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-md bg-muted p-3 text-sm">
              <p className="font-medium">{comunicacaoSelecionada?.cliente_nome || "Cliente não informado"}</p>
              <p className="mt-1 text-xs text-muted-foreground">{comunicacaoSelecionada?.item_titulo || "Tarefa protocolada"}</p>
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Observação opcional</span>
              <textarea
                value={observacaoComunicacao}
                onChange={(evento) => setObservacaoComunicacao(evento.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Ex.: comunicado por ligação; cliente confirmou recebimento."
                className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none"
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComunicacaoSelecionada(null)} disabled={!!marcando}>Cancelar</Button>
            <Button
              onClick={() => comunicacaoSelecionada && marcarComunicado(comunicacaoSelecionada)}
              disabled={!comunicacaoSelecionada || !!marcando}
            >
              {marcando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Confirmar comunicação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
