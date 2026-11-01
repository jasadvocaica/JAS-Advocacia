import PlantaEscritorio from "./escritorio/PlantaEscritorio";
import { SALAS, salaAgente, type SalaId } from "./escritorio/salas";
import { useState } from "react";
import {
  Bot,
  Monitor,
  Play,
  Pause,
  CheckCircle2,
  AlertTriangle,
  Clock3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { agenteNativo } from "../../../supabase/functions/_shared/agentes";
import {
  chamarEscritorio,
  type AgenteIA,
  type ExecucaoAgente,
} from "./hooks/useAgentesIA";
export function estadoMesa(a: AgenteIA, ultima?: ExecucaoAgente) {
  if (!a.ativo) return "Pausado";
  if (
    !agenteNativo(a.slug) &&
    a.executor !== "analista_operacional" &&
    !a.webhook_url
  )
    return "Precisa configurar";
  if (ultima?.status === "executando")
    return Date.now() - new Date(ultima.iniciado_em).getTime() > 600000
      ? "Execução sem confirmação"
      : "Trabalhando";
  if (ultima?.status === "pendente") return "Na fila";
  if (ultima?.status === "erro") return "Precisa de atenção";
  if (ultima?.status === "aguardando_aprovacao") return "Aguarda sua revisão";
  return "Disponível";
}
export const horario = (d: string) =>
  new Date(d).toLocaleString("pt-BR", {
    timeZone: "America/Cuiaba",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
export default function EscritorioVisual({
  agentes,
  execucoes,
  rodar,
  ocupado,
  recarregar,
  revisar,
  modo = "planta",
  contratarAberto,
  onContratarAberto,
}: {
  agentes: AgenteIA[];
  execucoes: ExecucaoAgente[];
  rodar: (a: AgenteIA) => Promise<void>;
  ocupado: boolean;
  recarregar: () => Promise<void>;
  revisar?: (e: ExecucaoAgente) => void;
  modo?: "planta" | "equipe" | "somente-dialogos";
  contratarAberto?: boolean;
  onContratarAberto?: (aberto: boolean) => void;
}) {
  const [contratarLocal, setContratarLocal] = useState(false),
    [nome, setNome] = useState(""),
    [missao, setMissao] = useState(""),
    [intervalo, setIntervalo] = useState("1440"),
    [salvando, setSalvando] = useState(false);
  const contratar = contratarAberto ?? contratarLocal;
  const setContratar = onContratarAberto ?? setContratarLocal;
  const [detalhesSala, setDetalhesSala] = useState(false);
  function entrarSala(id: SalaId) {
    setSala(id);
    setDetalhesSala(true);
  }
  const [sala, setSala] = useState<SalaId>("diretoria");
  const [selecionado, setSelecionado] = useState<AgenteIA | null>(null);

  const [movendo, setMovendo] = useState(false);
  const salaAtual = SALAS.find((s) => s.id === sala)!;
  const equipe = agentes.filter((a) => salaAgente(a) === sala);
  const ultima = selecionado
    ? execucoes.find((e) => e.agente_id === selecionado.id)
    : undefined;
  const { toast } = useToast();
  async function mover(a: AgenteIA, nova: SalaId) {
    setMovendo(true);
    try {
      await chamarEscritorio({ acao: "mover", agente_id: a.id, sala: nova });
      setSelecionado({ ...a, sala: nova });
      setSala(nova);
      await recarregar();
    } catch (e) {
      toast({
        title: "Não foi possível mudar a sala",
        description: e instanceof Error ? e.message : "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setMovendo(false);
    }
  }
  async function criar() {
    setSalvando(true);
    try {
      await chamarEscritorio({
        acao: "contratar",
        nome,
        missao,
        intervalo_minutos: intervalo === "manual" ? null : Number(intervalo),
        sala,
      });
      setContratar(false);
      setNome("");
      setMissao("");
      await recarregar();
      toast({
        title: "Agente contratado",
        description:
          "A mesa foi criada. Execute agora ou aguarde a rotina escolhida.",
      });
    } catch (e) {
      toast({
        title: "Falha na contratação",
        description: e instanceof Error ? e.message : "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setSalvando(false);
    }
  }
  async function alternar(a: AgenteIA) {
    try {
      await chamarEscritorio({
        acao: "alternar",
        agente_id: a.id,
        ativo: !a.ativo,
      });
      await recarregar();
    } catch (e) {
      toast({
        title: "Falha ao alterar agente",
        description: e instanceof Error ? e.message : "Tente novamente",
        variant: "destructive",
      });
    }
  }
  return (
    <section
      aria-label={
        modo === "equipe" ? "Equipe de agentes" : "Escritório virtual"
      }
      className={
        modo === "planta"
          ? "jas-office-scene"
          : modo === "equipe"
            ? "jas-office-equipe"
            : "jas-dialogs-host"
      }
    >
      {modo === "planta" && (
        <>
          <PlantaEscritorio
            agentes={agentes}
            execucoes={execucoes}
            sala={sala}
            selecionarSala={entrarSala}
            selecionarAgente={setSelecionado}
          />
          {detalhesSala && (
            <aside
              className="jas-room-float"
              aria-label={`Detalhes de ${salaAtual.nome}`}
            >
              <button
                type="button"
                className="jas-room-close"
                aria-label="Fechar detalhes da sala"
                onClick={() => setDetalhesSala(false)}
              >
                ×
              </button>
              <span className="jas-room-kicker">Sala selecionada</span>
              <h3>{salaAtual.nome}</h3>
              <p>{salaAtual.detalhe}</p>
              {sala === "diretoria" && (
                <div className="jas-room-member">
                  <span className="jas-room-initial">J</span>
                  <div>
                    <strong>Juliana Araújo</strong>
                    <small>Proprietária · Diretora</small>
                  </div>
                </div>
              )}
              {equipe.map((a) => (
                <button
                  key={a.id}
                  className="jas-room-member"
                  onClick={() => setSelecionado(a)}
                >
                  <span className="jas-room-initial">{a.nome.charAt(0)}</span>
                  <span>
                    <strong>{a.nome}</strong>
                    <small>
                      {estadoMesa(
                        a,
                        execucoes.find((e) => e.agente_id === a.id),
                      )}
                    </small>
                  </span>
                </button>
              ))}
              {!equipe.length && (
                <p className="jas-room-no-team">
                  Sala disponível para receber agentes.
                </p>
              )}
              <a className="jas-room-action" href={salaAtual.link}>
                {salaAtual.acao} →
              </a>
            </aside>
          )}
          <nav aria-label="Salas do escritório" className="jas-room-dock">
            {SALAS.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={sala === s.id}
                onClick={() => entrarSala(s.id)}
              >
                {s.nome}
              </button>
            ))}
          </nav>
        </>
      )}
      {modo === "equipe" && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agentes.map((a) => {
            const e = execucoes.find((e) => e.agente_id === a.id);
            const estado = estadoMesa(a, e);
            const trabalhando = estado === "Trabalhando";
            const configurado = estado !== "Precisa configurar";
            return (
              <article
                key={a.id}
                className={cn(
                  "relative flex flex-col rounded-xl border bg-background p-4 shadow-sm",
                  trabalhando && "border-primary ring-2 ring-primary/15",
                  !a.ativo && "opacity-65",
                )}
              >
                <div className="mb-4 flex items-center justify-between">
                  <span className="rounded bg-muted px-2 py-1 text-[10px] uppercase tracking-widest">
                    {a.area === "gestao" ? "Gestão" : a.area}
                  </span>
                  <span
                    className={cn(
                      "flex items-center gap-1.5 text-xs",
                      trabalhando ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        trabalhando
                          ? "bg-primary motion-safe:animate-pulse"
                          : estado.includes("atenção")
                            ? "bg-destructive"
                            : "bg-muted-foreground/40",
                      )}
                    />
                    {estado}
                  </span>
                </div>
                <div className="relative mx-auto mb-4 flex h-24 w-40 items-end justify-center rounded-lg border-b-8 border-muted bg-muted/25">
                  <Monitor className="absolute left-3 top-3 h-8 w-8 text-muted-foreground/40" />
                  <div
                    className={cn(
                      "z-10 mb-2 rounded-full border bg-background p-3",
                      trabalhando && "text-primary",
                    )}
                  >
                    <Bot className="h-9 w-9" />
                  </div>
                </div>
                <h3 className="font-medium">{a.nome}</h3>
                <p className="mt-1 min-h-10 text-xs leading-relaxed text-muted-foreground">
                  {a.descricao}
                </p>
                <div className="my-3 min-h-16 rounded-lg bg-muted/40 p-3 text-xs">
                  <p className="mb-1 font-medium">
                    Última atividade registrada
                  </p>
                  <p className="line-clamp-3">
                    {e?.erro ??
                      e?.resumo ??
                      (e
                        ? `Execução ${e.status}`
                        : "Nenhuma execução individual registrada.")}
                  </p>
                  {e && (
                    <time className="mt-1 block text-[10px] text-muted-foreground">
                      {horario(e.iniciado_em)}
                    </time>
                  )}
                </div>
                <p className="mb-3 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Clock3 className="h-3 w-3" />
                  {agenteNativo(a.slug)
                    ? "Rotina automática DJEN · ver consultas abaixo"
                    : a.intervalo_minutos
                      ? `A cada ${a.intervalo_minutos / 60}h${a.proxima_execucao ? ` · próxima ${horario(a.proxima_execucao)}` : ""}`
                      : "Execução manual"}
                </p>
                <div className="mt-auto flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={
                      ocupado || trabalhando || !a.ativo || !configurado
                    }
                    onClick={() => void rodar(a)}
                  >
                    <Play className="mr-2 h-3 w-3" />
                    Executar agora
                  </Button>
                  {a.executor === "analista_operacional" && (
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label={
                        a.ativo ? `Pausar ${a.nome}` : `Ativar ${a.nome}`
                      }
                      onClick={() => void alternar(a)}
                    >
                      {a.ativo ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </div>
                {a.executor === "analista_operacional" && (
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    OpenAI · teto compartilhado · entrega sujeita à revisão
                  </p>
                )}
              </article>
            );
          })}
          {agentes.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground">
              Nenhum agente cadastrado.
            </p>
          )}
        </div>
      )}
      <Dialog open={contratar} onOpenChange={setContratar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Contratar agente</DialogTitle>
            <DialogDescription>
              Analista operacional: lê indicadores reais, produz um relatório e
              entrega para sua revisão.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/40 p-3 text-xs">
              <CheckCircle2 className="mb-1 h-4 w-4" />
              Função disponível: análise da Controladoria e das execuções do
              escritório. A consulta DJEN e a triagem já possuem agentes
              próprios.
            </div>
            <label className="block text-sm">
              Nome do agente
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                maxLength={80}
                placeholder="Ex.: Sofia · Analista de operações"
              />
            </label>
            <label className="block text-sm">
              Missão
              <Textarea
                value={missao}
                onChange={(e) => setMissao(e.target.value)}
                maxLength={1000}
                placeholder="Ex.: apontar acúmulo de tarefas e falhas que precisam da minha atenção"
              />
            </label>
            <label className="block text-sm">
              Sala
              <select
                className="mt-1 h-10 w-full rounded-md border bg-background px-3"
                value={sala}
                onChange={(e) => setSala(e.target.value as SalaId)}
              >
                {SALAS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Rotina
              <select
                className="mt-1 h-10 w-full rounded-md border bg-background px-3"
                value={intervalo}
                onChange={(e) => setIntervalo(e.target.value)}
              >
                <option value="1440">Diária · a cada 24 horas</option>
                <option value="240">A cada 4 horas</option>
                <option value="60">A cada hora</option>
                <option value="manual">Somente quando eu executar</option>
              </select>
            </label>
            <p className="flex gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Usa a API paga dentro dos 50.000 tokens/dia compartilhados e dos
              demais limites do sistema. Não altera tarefas nem calcula prazos.
              Você será a supervisora.
            </p>
            <Button
              className="w-full"
              disabled={salvando || nome.trim().length < 3}
              onClick={() => void criar()}
            >
              {salvando ? "Contratando…" : "Contratar e ativar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!selecionado}
        onOpenChange={(o) => {
          if (!o) setSelecionado(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selecionado?.nome}</DialogTitle>
            <DialogDescription>
              {selecionado?.descricao ?? "Agente do escritório"}
            </DialogDescription>
          </DialogHeader>
          {selecionado && (
            <div className="space-y-4">
              <p className="text-sm font-medium">
                {estadoMesa(selecionado, ultima)}
              </p>
              <label className="block text-sm">
                Sala do agente
                <select
                  className="mt-1 h-10 w-full rounded-md border bg-background px-3"
                  value={salaAgente(selecionado)}
                  disabled={movendo}
                  onChange={(e) =>
                    void mover(selecionado, e.target.value as SalaId)
                  }
                >
                  {SALAS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome}
                    </option>
                  ))}
                </select>
              </label>
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="mb-2 text-xs font-medium">Último registro</p>
                <p className="whitespace-pre-wrap text-xs">
                  {ultima?.erro ??
                    ultima?.resumo ??
                    "Nenhuma execução registrada para este agente."}
                </p>
                {ultima && (
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    {horario(ultima.iniciado_em)}
                  </p>
                )}
                {ultima?.saida && (
                  <details className="mt-3 text-xs">
                    <summary className="cursor-pointer">
                      Abrir entrega registrada
                    </summary>
                    <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap">
                      {typeof ultima.saida.relatorio === "string"
                        ? ultima.saida.relatorio
                        : JSON.stringify(ultima.saida, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
              {ultima?.status === "aguardando_aprovacao" && revisar && (
                <Button
                  className="w-full"
                  onClick={() => {
                    revisar(ultima);
                    setSelecionado(null);
                  }}
                >
                  Revisar entrega
                </Button>
              )}
              <Button
                variant="outline"
                className="w-full"
                disabled={
                  ocupado ||
                  !selecionado.ativo ||
                  estadoMesa(selecionado, ultima) === "Trabalhando" ||
                  estadoMesa(selecionado, ultima) === "Precisa configurar"
                }
                onClick={() => void rodar(selecionado)}
              >
                <Play className="mr-2 h-4 w-4" />
                Executar agora
              </Button>
              <p className="text-[10px] text-muted-foreground">
                A sala organiza o escritório. Mover um agente não altera suas
                permissões ou habilidades.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
