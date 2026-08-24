import { useMemo } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, BellRing, CheckCircle2, ClipboardCheck, Clock,
  Gavel, Loader2, MapPin, Scale, Send, ShieldAlert, Workflow,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ETAPAS_ORDEM, ETAPA_LABEL, etapaAtualDe, type EtapaWorkflow } from "@/pages/controladoria/workflow";
import { usePainelJulianaData } from "./usePainelJulianaData";
import {
  agrupar, classificarUrgencia, contagemPorEtapa, dependenciasDe, filaRevisao,
  horasAguardando, itemAtivo, prazosDaSemana, processoAtivo, saudeDe, slaOperacional,
  type ItemPainel,
} from "./logic";

const SAUDE_INFO = {
  normal: { label: "Normal", cls: "bg-success/15 text-success border-success/30" },
  atencao: { label: "Atenção", cls: "bg-warning/15 text-warning border-warning/30" },
  atrasado: { label: "Atrasado", cls: "bg-destructive/15 text-destructive border-destructive/30" },
} as const;

/** Link canônico para a Controladoria com filtros lidos por query param. */
function linkControladoria(params: Record<string, string>) {
  return `/controladoria?${new URLSearchParams(params).toString()}`;
}

export default function PainelJuliana() {
  const { user, isGestor, profile } = useAuth();
  const { data, isLoading, isError, refetch, isFetching } = usePainelJulianaData(!!user && isGestor);

  const agora = new Date();
  const userId = user?.id ?? "";

  const modelo = useMemo(() => {
    const itens = data?.itens ?? [];
    const ativos = itens.filter(itemAtivo);
    const prazos = prazosDaSemana(itens, agora);
    const revisao = filaRevisao(itens, userId, agora);
    const dependencias = dependenciasDe(itens, userId, agora);
    const sla = slaOperacional(itens, agora);
    const etapas = contagemPorEtapa(itens);
    const protocolo = ativos.filter((i) => etapaAtualDe(i) === "protocolo");
    const protocoloAtrasado = protocolo.filter((i) => classificarUrgencia(i, agora) === "atrasado");
    const processosAtivos = (data?.processos ?? []).filter((p) => processoAtivo(p.status));
    return {
      itens, ativos, prazos, revisao, dependencias, sla, etapas, protocolo, protocoloAtrasado,
      processosAtivos,
      areas: agrupar(processosAtivos, (p) => p.area_direito),
      decisoes: dependencias.filter((i) => etapaAtualDe(i) !== "revisao"),
      saude: saudeDe({ atrasados: prazos.atrasado.length, hoje: prazos.hoje.length, filaRevisao: revisao.length }),
    };
  }, [data, userId]);

  // Acesso restrito: somente gestor. Verificado após os hooks para manter a ordem estável.
  if (!isGestor) return <Navigate to="/" replace />;

  const intimacoes = data?.intimacoes ?? [];
  const pendencias = data?.pendenciasProducao ?? [];
  const precisaAgora = modelo.revisao.length + intimacoes.length + pendencias.length + modelo.prazos.atrasado.length;
  const saudeInfo = SAUDE_INFO[modelo.saude];

  return (
    <div>
      <PageHeader
        title="Painel da Juliana"
        description={`Visão por exceção do que depende de você • ${formatDate(agora)}`}
      >
        <Badge variant="outline" className={cn("h-8 px-3", saudeInfo.cls)}>
          Saúde da operação: {saudeInfo.label}
        </Badge>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching} className="gap-2">
          {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />} Atualizar
        </Button>
      </PageHeader>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 w-full" />)}
        </div>
      ) : isError ? (
        <Card><CardContent className="p-6 text-sm text-destructive">Não foi possível carregar o painel.</CardContent></Card>
      ) : (
        <div className="space-y-6">
          {/* 1 — Precisa de mim agora */}
          <Secao
            icone={<ShieldAlert className="w-4 h-4" />}
            titulo="Precisa de mim agora"
            destaque
            contador={precisaAgora}
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Indicador
                titulo="Na minha revisão"
                valor={modelo.revisao.length}
                tom={modelo.revisao.length ? "destructive" : "muted"}
                icone={<ClipboardCheck className="w-4 h-4" />}
                to={linkControladoria({ etapa: "revisao", responsavel: userId })}
              />
              <Indicador
                titulo="Prazos atrasados"
                valor={modelo.prazos.atrasado.length}
                tom={modelo.prazos.atrasado.length ? "destructive" : "muted"}
                icone={<AlertTriangle className="w-4 h-4" />}
                to={linkControladoria({ prazo: "atrasado" })}
              />
              <Indicador
                titulo="Intimações sem leitura"
                valor={intimacoes.length}
                tom={intimacoes.length ? "warning" : "muted"}
                icone={<BellRing className="w-4 h-4" />}
                to="/ferramentas/publicacoes-pje"
              />
              <Indicador
                titulo="Exceções da produção"
                valor={pendencias.length}
                tom={pendencias.length ? "warning" : "muted"}
                icone={<Workflow className="w-4 h-4" />}
                to="/controladoria"
              />
            </div>
            {modelo.revisao.length > 0 && (
              <ListaItens
                itens={modelo.revisao.slice(0, 5)}
                agora={agora}
                mostrarEspera
                rodape={{ label: "Abrir fila de revisão", to: linkControladoria({ etapa: "revisao", responsavel: userId }) }}
              />
            )}
          </Secao>

          {/* 2 — Riscos e atrasos */}
          <Secao icone={<AlertTriangle className="w-4 h-4" />} titulo="Riscos e atrasos">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Indicador titulo="Atrasados" valor={modelo.prazos.atrasado.length} tom={modelo.prazos.atrasado.length ? "destructive" : "muted"} icone={<AlertTriangle className="w-4 h-4" />} to={linkControladoria({ prazo: "atrasado" })} />
              <Indicador titulo="Vencem hoje" valor={modelo.prazos.hoje.length} tom={modelo.prazos.hoje.length ? "warning" : "muted"} icone={<Clock className="w-4 h-4" />} to={linkControladoria({ prazo: "hoje" })} />
              <Indicador titulo="Protocolo pendente" valor={modelo.protocolo.length} sub={modelo.protocoloAtrasado.length ? `${modelo.protocoloAtrasado.length} com prazo vencido` : undefined} tom={modelo.protocoloAtrasado.length ? "destructive" : "muted"} icone={<Send className="w-4 h-4" />} to={linkControladoria({ etapa: "protocolo" })} />
              {modelo.sla.disponivel ? (
                <Indicador titulo="SLA operacional estourado" valor={modelo.sla.estourados.length} tom={modelo.sla.estourados.length ? "destructive" : "muted"} icone={<Clock className="w-4 h-4" />} to={linkControladoria({ etapa: "execucao" })} />
              ) : (
                <IndicadorPreparado titulo="SLA operacional estourado" motivo="Nenhum item com SLA operacional definido ainda." />
              )}
            </div>
            <IndicadorPreparado
              titulo="Comunicação com cliente atrasada"
              motivo="Sem fonte confiável de última comunicação por cliente."
              linha
            />
          </Secao>

          {/* 3 — Prazos da semana */}
          <Secao icone={<Gavel className="w-4 h-4" />} titulo="Prazos da semana">
            <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
              <Indicador titulo="Vencidos" valor={modelo.prazos.atrasado.length} tom={modelo.prazos.atrasado.length ? "destructive" : "muted"} to={linkControladoria({ prazo: "atrasado" })} />
              <Indicador titulo="Hoje" valor={modelo.prazos.hoje.length} tom={modelo.prazos.hoje.length ? "warning" : "muted"} to={linkControladoria({ prazo: "hoje" })} />
              <Indicador titulo="Amanhã" valor={modelo.prazos.amanha.length} tom="primary" to={linkControladoria({ prazo: "amanha" })} />
              <Indicador titulo="Resto da semana" valor={modelo.prazos.semana.length} tom="muted" to={linkControladoria({ prazo: "semana" })} />
            </div>
          </Secao>

          {/* 4 — Minha fila de revisão */}
          <Secao icone={<ClipboardCheck className="w-4 h-4" />} titulo="Minha fila de revisão" contador={modelo.revisao.length}>
            {modelo.revisao.length === 0 ? (
              <Vazio texto="Nada aguardando sua revisão." />
            ) : (
              <ListaItens itens={modelo.revisao} agora={agora} mostrarEspera mostrarProducao />
            )}
          </Secao>

          {/* 5 — Visão da operação */}
          <Secao icone={<Workflow className="w-4 h-4" />} titulo="Visão da operação">
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
              {ETAPAS_ORDEM.filter((e) => e !== "finalizado").map((etapa) => (
                <Indicador
                  key={etapa}
                  titulo={ETAPA_LABEL[etapa as EtapaWorkflow]}
                  valor={modelo.etapas[etapa as EtapaWorkflow]}
                  tom="muted"
                  to={linkControladoria({ etapa })}
                />
              ))}
              <Indicador titulo="Total ativo" valor={modelo.ativos.length} tom="primary" to="/controladoria" />
            </div>
            <IndicadorPreparado
              titulo="Novas contratações e aguardando documentos"
              motivo="Não há estado próprio para essas fases nas etapas atuais do workflow."
              linha
            />
          </Secao>

          {/* 6 — Carteira */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground flex items-center gap-2"><Scale className="w-4 h-4" /> Processos ativos</p>
                <p className="text-3xl font-semibold mt-2">{modelo.processosAtivos.length}</p>
                <Button variant="link" asChild className="px-0 h-auto mt-2 text-xs">
                  <Link to="/processos">Abrir processos <ArrowRight className="w-3 h-3 ml-1" /></Link>
                </Button>
              </CardContent>
            </Card>
            <Card className="lg:col-span-1">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-3">Distribuição por área</p>
                <div className="space-y-1.5">
                  {modelo.areas.slice(0, 6).map((a) => (
                    <Link key={a.label} to={`/processos?area=${encodeURIComponent(a.label)}`} className="flex items-center justify-between text-sm hover:text-primary">
                      <span className="truncate">{a.label}</span>
                      <span className="font-medium">{a.total}</span>
                    </Link>
                  ))}
                  {modelo.areas.length === 0 && <Vazio texto="Sem área definida nos processos ativos." />}
                </div>
              </CardContent>
            </Card>
            <Card className="lg:col-span-1">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-3 flex items-center gap-2"><MapPin className="w-4 h-4" /> Estados atendidos</p>
                <div className="flex flex-wrap gap-1.5">
                  {(data?.ufs ?? []).slice(0, 12).map((u) => (
                    <Badge key={u.label} variant="outline">{u.label} · {u.total}</Badge>
                  ))}
                  {(data?.ufs ?? []).length === 0 && <Vazio texto="Sem UF confiável cadastrada." />}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 7 e 8 — Meu dia / Dependências */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Secao icone={<CheckCircle2 className="w-4 h-4" />} titulo="Meu dia" contador={modelo.dependencias.filter((i) => ["atrasado", "hoje"].includes(classificarUrgencia(i, agora))).length}>
              {(() => {
                const hojeItens = modelo.dependencias.filter((i) => ["atrasado", "hoje"].includes(classificarUrgencia(i, agora)));
                return hojeItens.length ? <ListaItens itens={hojeItens.slice(0, 8)} agora={agora} /> : <Vazio texto="Nada exige sua ação hoje." />;
              })()}
            </Secao>
            <Secao icone={<ArrowRight className="w-4 h-4" />} titulo="Depende de você" contador={modelo.dependencias.length}>
              {modelo.dependencias.length === 0
                ? <Vazio texto="Nenhuma atividade travada em você." />
                : <ListaItens itens={modelo.dependencias.slice(0, 8)} agora={agora} mostrarEtapa />}
            </Secao>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- componentes

function Secao({ icone, titulo, children, contador, destaque }: {
  icone?: React.ReactNode; titulo: string; children: React.ReactNode; contador?: number; destaque?: boolean;
}) {
  return (
    <section className={cn("rounded-lg border p-4 space-y-3", destaque ? "border-destructive/30 bg-destructive/5" : "border-border bg-card")}>
      <header className="flex items-center gap-2">
        {icone}
        <h2 className="text-sm font-semibold">{titulo}</h2>
        {contador !== undefined && <Badge variant="secondary">{contador}</Badge>}
      </header>
      {children}
    </section>
  );
}

function Indicador({ titulo, valor, sub, tom = "muted", icone, to }: {
  titulo: string; valor: number; sub?: string; tom?: "destructive" | "warning" | "primary" | "muted"; icone?: React.ReactNode; to?: string;
}) {
  const cls = {
    destructive: "border-destructive/30 text-destructive",
    warning: "border-warning/30 text-warning",
    primary: "border-primary/30 text-primary",
    muted: "border-border text-foreground",
  }[tom];
  const conteudo = (
    <div className={cn("rounded-md border bg-background p-3 h-full transition-colors hover:bg-accent/40", cls)}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icone}<span className="truncate">{titulo}</span></div>
      <p className="text-2xl font-semibold mt-1 leading-none">{valor}</p>
      {sub && <p className="text-[11px] mt-1">{sub}</p>}
    </div>
  );
  return to ? <Link to={to} aria-label={titulo}>{conteudo}</Link> : conteudo;
}

function IndicadorPreparado({ titulo, motivo, linha }: { titulo: string; motivo: string; linha?: boolean }) {
  return (
    <div className={cn("rounded-md border border-dashed border-border bg-muted/30 p-3", linha && "mt-1")}>
      <p className="text-xs font-medium">{titulo}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">Indicador preparado, aguardando fonte de dados. {motivo}</p>
    </div>
  );
}

function ListaItens({ itens, agora, mostrarEspera, mostrarProducao, mostrarEtapa, rodape }: {
  itens: ItemPainel[]; agora: Date; mostrarEspera?: boolean; mostrarProducao?: boolean; mostrarEtapa?: boolean;
  rodape?: { label: string; to: string };
}) {
  return (
    <div className="space-y-1.5">
      {itens.map((it) => {
        const urg = classificarUrgencia(it, agora);
        const horas = horasAguardando(it, agora);
        return (
          <Link
            key={it.id}
            to={`/controladoria?item=${it.id}`}
            className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2 hover:bg-accent/40"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{it.titulo}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {[it.cliente_nome, it.processo_cnj, mostrarProducao ? it.responsavel_nome : null]
                  .filter(Boolean).join(" • ") || "Sem vínculo"}
              </p>
            </div>
            {mostrarEtapa && <Badge variant="outline" className="hidden sm:inline-flex">{ETAPA_LABEL[etapaAtualDe(it)]}</Badge>}
            {mostrarEspera && horas !== null && (
              <span className="hidden md:inline text-[11px] text-muted-foreground whitespace-nowrap">{horas}h aguardando</span>
            )}
            <Badge
              variant="outline"
              className={cn(
                "whitespace-nowrap",
                urg === "atrasado" && "bg-destructive/10 text-destructive border-destructive/30",
                urg === "hoje" && "bg-warning/10 text-warning border-warning/30",
              )}
            >
              {it.data_vencimento ? formatDate(it.data_vencimento) : "Sem prazo"}
            </Badge>
          </Link>
        );
      })}
      {rodape && (
        <Button variant="link" asChild className="px-0 h-auto text-xs">
          <Link to={rodape.to}>{rodape.label} <ArrowRight className="w-3 h-3 ml-1" /></Link>
        </Button>
      )}
    </div>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <p className="text-xs text-muted-foreground py-2">{texto}</p>;
}
