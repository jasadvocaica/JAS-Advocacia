import { useState } from "react";
import { CheckCircle2, CircleDollarSign, Loader2, MessagesSquare, Power, ShieldCheck, Target, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { useToast } from "@/hooks/use-toast";
import type { AgenteIA, ExecucaoAgente, MensagemEscritorio } from "../../hooks/useAgentesIA";
import { OfficeEmpty, OfficeStatus } from "../design/OfficeUI";
import { Indicador } from "./CentralMissoes";
import GatilhoDjen from "./GatilhoDjen";
import TelegramPainel from "../telegram/TelegramPainel";
import { chamarMotor, dolar, hora, useAprovacoes, usePainelMotor, type Aprovacao } from "./motor";
import "./missoes.css";

const DEZ_MIN = 600000;
const CAMPO: Record<string, string> = {
  titulo: "Título",
  descricao: "Descrição",
  data_vencimento: "Vencimento",
  prioridade: "Prioridade",
  processo_id: "Processo",
  autor: "Para",
  comentario: "Comentário",
  mensagem: "Resposta",
};
const OCULTOS = new Set(["post_id", "conta_id", "comentario_id"]);

function valorCampo(chave: string, v: unknown) {
  if (v == null || v === "") return "—";
  if (chave === "data_vencimento" && typeof v === "string") return v.split("-").reverse().join("/");
  return String(v);
}

function PedidoAcao({ a, decidir, ocupado }: { a: Aprovacao; decidir: (aprovar: boolean) => void; ocupado: boolean }) {
  return (
    <li className="ga-pedido">
      <div className="ga-pedido-topo">
        <strong>{a.resumo}</strong>
        <small>{a.agente ?? "Sistema"} · pedido às {hora(a.criada_em)} · vale até {new Date(a.valida_ate).toLocaleDateString("pt-BR")}</small>
      </div>
      <dl>
        {Object.entries(a.parametros).filter(([k]) => !OCULTOS.has(k)).map(([k, v]) => (
          <div key={k}><dt>{CAMPO[k] ?? k}</dt><dd>{valorCampo(k, v)}</dd></div>
        ))}
      </dl>
      {a.riscos && <p className="ga-riscos">{a.riscos}</p>}
      <div className="ga-botoes">
        <Button size="sm" onClick={() => decidir(true)} disabled={ocupado}>Aprovar e executar</Button>
        <Button size="sm" variant="outline" onClick={() => decidir(false)} disabled={ocupado}>Recusar</Button>
      </div>
    </li>
  );
}

function PedidoOrcamento({ a, decidir, ocupado }: { a: Aprovacao; decidir: (opcao: number | null) => void; ocupado: boolean }) {
  const opcoes = a.parametros.opcoes ?? [];
  return (
    <li className="ga-pedido ga-orcamento">
      <div className="ga-pedido-topo">
        <strong>Orçamento de IA: {a.resumo}</strong>
        <small>Aviso de hoje · nenhuma opção passa do teto mensal</small>
      </div>
      <div className="ga-opcoes">
        {opcoes.map((o, i) => (
          <button key={o.descricao} type="button" className="ga-opcao" disabled={ocupado} onClick={() => decidir(i)}>
            <strong>{o.descricao}</strong>
            <span>Limite do dia passa a {dolar(o.limite_dia_previsto_usd)}</span>
            <span>Com a demanda atual, o mês fecha em {dolar(o.mes_fecharia_em_usd)}</span>
          </button>
        ))}
      </div>
      <div className="ga-botoes">
        <Button size="sm" variant="outline" onClick={() => decidir(null)} disabled={ocupado}>Manter o orçamento</Button>
      </div>
    </li>
  );
}

export default function SalaGestora({
  agentes,
  execucoes,
  mensagens,
}: {
  agentes: AgenteIA[];
  execucoes: ExecucaoAgente[];
  mensagens: MensagemEscritorio[];
}) {
  const { painel, erro, carregando, recarregar } = usePainelMotor();
  const aprovacoes = useAprovacoes();
  const { toast } = useToast();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [confirmarMotor, setConfirmarMotor] = useState(false);

  async function agir(id: string, corpo: Record<string, unknown>, ok: string) {
    setOcupado(id);
    try {
      await chamarMotor(corpo);
      toast({ title: ok });
      await Promise.all([aprovacoes.recarregar(), recarregar()]);
    } catch (e) {
      toast({ title: "Não foi possível concluir", description: e instanceof Error ? e.message : "", variant: "destructive" });
      await aprovacoes.recarregar();
    } finally {
      setOcupado(null);
    }
  }

  if (carregando && !painel) return <div className="mi-carregando"><Loader2 className="animate-spin" /> Abrindo a sala…</div>;
  if (erro && !painel)
    return (
      <OfficeEmpty icon={Target} title="Sala da Gestora indisponível">
        {erro}. O motor de missões precisa estar instalado (Fase 2, homologação).
      </OfficeEmpty>
    );
  if (!painel) return null;

  const o = painel.orcamento;
  const abertas = painel.missoes.filter((m) => m.estado === "aberta");
  const emExecucao = abertas.filter((m) => m.tarefas.some((t) => t.estado === "executando")).length;
  const concluidas = painel.missoes.filter((m) => m.estado === "concluida").length;
  const nome = (id: string | null) => agentes.find((a) => a.id === id)?.nome ?? "Sistema";
  const trabalhando = (id: string) =>
    execucoes.some((e) => e.agente_id === id && e.status === "executando" && Date.now() - Date.parse(e.iniciado_em) < DEZ_MIN);
  const conversas = mensagens.filter((m) => m.agente_id && m.origem !== "usuario").slice(-6).reverse();
  const pctMes = Math.min(100, Math.round((o.gasto_mes_usd / Math.max(0.01, o.orcamento_mensal_usd + o.extras_mes_usd)) * 100));
  const pctDia = Math.min(100, Math.round((o.gasto_dia_usd / Math.max(0.0001, o.limite_dia_usd)) * 100));

  return (
    <section className="mi ga" aria-label="Sala da Gestora">
      <header className="ga-hero">
        <span className="ga-retrato" aria-hidden>M</span>
        <div>
          <h2>Manu · Gestora Geral</h2>
          <p>
            Agora: {abertas.length} {abertas.length === 1 ? "missão aberta" : "missões abertas"}, {emExecucao} em execução e{" "}
            {aprovacoes.lista.length} {aprovacoes.lista.length === 1 ? "pedido esperando" : "pedidos esperando"} sua decisão.
          </p>
        </div>
        <div className="mi-kpis">
          <Indicador icone={Target} valor={abertas.length} rotulo="Missões abertas" />
          <Indicador icone={CheckCircle2} valor={concluidas} rotulo="Concluídas (7 dias)" />
          <Indicador icone={ShieldCheck} valor={aprovacoes.lista.length} rotulo="Para aprovar" />
          <Indicador icone={CircleDollarSign} valor={dolar(o.gasto_mes_usd)} rotulo="Gasto de IA no mês" />
        </div>
      </header>

      <div className="ga-grade">
        <div className="op-panel ga-aprovacoes">
          <h3><ShieldCheck size={18} /> Central de Aprovações</h3>
          {aprovacoes.erro && <p className="mi-aviso">{aprovacoes.erro}</p>}
          {aprovacoes.lista.length ? (
            <ul>
              {aprovacoes.lista.map((a) =>
                a.tipo === "orcamento" ? (
                  <PedidoOrcamento
                    key={a.id}
                    a={a}
                    ocupado={ocupado === a.id}
                    decidir={(opcao) =>
                      void agir(a.id, { acao: "decidir_orcamento", id: a.id, opcao }, opcao === null ? "Orçamento mantido" : "Orçamento ajustado")
                    }
                  />
                ) : (
                  <PedidoAcao
                    key={a.id}
                    a={a}
                    ocupado={ocupado === a.id}
                    decidir={(aprovar) =>
                      void agir(a.id, { acao: "decidir", id: a.id, aprovar, hash: a.escopo_hash }, aprovar ? "Aprovado e executado" : "Pedido recusado")
                    }
                  />
                ),
              )}
            </ul>
          ) : (
            <p className="mi-vazio">Nada esperando por você.</p>
          )}
        </div>

        <div className="op-panel ga-orcamento-painel">
          <h3><CircleDollarSign size={18} /> Orçamento de IA</h3>
          <div className="ga-medidor">
            <span>Mês: {dolar(o.gasto_mes_usd)} de {dolar(o.orcamento_mensal_usd + o.extras_mes_usd)}</span>
            <span className="mi-barra"><i style={{ width: `${pctMes}%` }} /></span>
          </div>
          <div className="ga-medidor">
            <span>Hoje: {dolar(o.gasto_dia_usd)} de {dolar(o.limite_dia_usd)}</span>
            <span className="mi-barra"><i style={{ width: `${pctDia}%` }} /></span>
          </div>
          <p className="ga-nota">
            Teto absoluto {dolar(o.teto_absoluto_usd)}/mês. Limite do dia = saldo do mês ÷ {o.dias_restantes} dias restantes.
            {o.tarefas_na_fila > 0 ? ` ${o.tarefas_na_fila} tarefa(s) na fila.` : ""}
          </p>
          <div className="ga-motor">
            <OfficeStatus tone={painel.motor_ligado ? "success" : "warning"}>
              {painel.motor_ligado ? "Motor ligado" : "Motor desligado"}
            </OfficeStatus>
            <Button size="sm" variant={painel.motor_ligado ? "outline" : "default"} onClick={() => setConfirmarMotor(true)} disabled={ocupado === "motor"}>
              <Power size={14} /> {painel.motor_ligado ? "Desligar" : "Ligar"}
            </Button>
          </div>
        </div>

        <GatilhoDjen agentes={agentes} motorLigado={painel.motor_ligado} />
        <TelegramPainel />

        <div className="op-panel">
          <h3><Users size={18} /> Agentes em operação</h3>
          <ul className="ga-agentes">
            {agentes.map((a) => (
              <li key={a.id}>
                <span className="mi-avatar">{a.nome.slice(0, 1).toUpperCase()}</span>
                <span>{a.nome}</span>
                <OfficeStatus tone={!a.ativo ? "neutral" : trabalhando(a.id) ? "working" : "success"}>
                  {!a.ativo ? "Pausado" : trabalhando(a.id) ? "Trabalhando" : "Disponível"}
                </OfficeStatus>
              </li>
            ))}
          </ul>
        </div>

        <div className="op-panel">
          <h3><MessagesSquare size={18} /> Comunicação entre agentes</h3>
          {conversas.length ? (
            <ul className="ga-conversas">
              {conversas.map((m) => (
                <li key={m.id}>
                  <strong>{nome(m.agente_id)}</strong>
                  <p>{m.texto.length > 220 ? `${m.texto.slice(0, 219)}…` : m.texto}</p>
                  <time>{hora(m.criado_em)}</time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mi-vazio">Nenhuma mensagem dos agentes ainda.</p>
          )}
        </div>
      </div>

      <AlertDialog open={confirmarMotor} onOpenChange={setConfirmarMotor}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{painel.motor_ligado ? "Desligar o motor?" : "Ligar o motor?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {painel.motor_ligado
                ? "Nenhuma tarefa nova começa. O que está em andamento termina ou volta para a fila."
                : `Os agentes passam a executar as missões da fila, gastando até ${dolar(o.limite_dia_usd)} hoje. Ações sensíveis continuam pedindo sua aprovação.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void agir("motor", { acao: "ajustar", ligado: !painel.motor_ligado }, painel.motor_ligado ? "Motor desligado" : "Motor ligado")}
            >
              {painel.motor_ligado ? "Desligar" : "Ligar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
