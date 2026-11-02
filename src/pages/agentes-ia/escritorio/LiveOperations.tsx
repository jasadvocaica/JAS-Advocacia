import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  CheckCheck,
  Pencil,
  Play,
  Users,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AgenteIA, ExecucaoAgente } from "../hooks/useAgentesIA";
import { estadoMesa, latestExecution } from "./agentState";

interface Props {
  agentes: AgenteIA[];
  execucoes: ExecucaoAgente[];
  passos: {
    id: number;
    execucao_id: string;
    mensagem: string;
    criado_em: string;
  }[];
  atualizadoEm: string | null;
  erro: boolean;
  ocupado: boolean;
  rodar: (a: AgenteIA) => Promise<void>;
}
const time = (d: string) =>
  new Date(d).toLocaleTimeString("pt-BR", {
    timeZone: "America/Cuiaba",
    hour: "2-digit",
    minute: "2-digit",
  });
export default function LiveOperations({
  agentes,
  execucoes,
  passos,
  atualizadoEm,
  erro,
  ocupado,
  rodar,
}: Props) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  const fresh =
    !erro && !!atualizadoEm && now - Date.parse(atualizadoEm) < 35000;
  const working = agentes.filter(
    (a) => estadoMesa(a, latestExecution(execucoes, a.id)) === "Trabalhando",
  ).length;
  const review = execucoes.filter(
    (e) => e.status === "aguardando_aprovacao",
  ).length;
  return (
    <aside className="office-live-rail" aria-label="Acompanhamento da operação">
      <header>
        <span className="office-live-eyebrow">
          <Activity size={13} /> OPERAÇÃO DO ESCRITÓRIO
        </span>
        <h2>O que está acontecendo</h2>
        <p>Equipe e atividades registradas no sistema.</p>
      </header>
      <div className="office-live-metrics">
        <Link to="/escritorio/historico">
          <strong>{fresh ? working : "—"}</strong>
          <span>em execução</span>
        </Link>
        <Link to="/escritorio/entregas">
          <strong>{review}</strong>
          <span>para revisar</span>
        </Link>
      </div>
      <div className="office-live-section-title">
        <h3>
          <Users size={15} /> Sua equipe
        </h3>
        <Link to="/escritorio/equipe">
          Gerenciar <ArrowUpRight size={13} />
        </Link>
      </div>
      <div className="office-live-roster">
        {agentes.map((a) => {
          const execution = latestExecution(execucoes, a.id);
          const state = fresh
            ? estadoMesa(a, execution)
            : "Sem confirmação recente";
          const editable = a.executor === "analista_operacional";
          const running = state === "Trabalhando";
          const needsReview = execution?.status === "aguardando_aprovacao";
          return (
            <article key={a.id} data-working={running}>
              <div className="office-live-person">
                <span className="office-live-avatar">
                  {a.nome.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <strong>{a.nome}</strong>
                  <small>
                    <i data-state={state} />
                    {state}
                  </small>
                </div>
              </div>
              <div className="office-live-person-actions">
                {editable ? (
                  <Link
                    to={`/escritorio/equipe/${a.id}/editar`}
                    aria-label={`Editar agente ${a.nome}`}
                  >
                    <Pencil size={13} /> Editar
                  </Link>
                ) : (
                  <span>Rotina nativa</span>
                )}
                {needsReview ? (
                  <Link to="/escritorio/entregas">
                    <CheckCheck size={13} /> Revisar
                  </Link>
                ) : (
                  editable && (
                    <button
                      disabled={ocupado || !a.ativo || running || !fresh}
                      onClick={() => void rodar(a)}
                      aria-label={`Executar ${a.nome}`}
                    >
                      <Play size={12} /> Executar
                    </button>
                  )
                )}
              </div>
            </article>
          );
        })}
        {!agentes.length && (
          <p className="office-live-empty">
            Sua equipe aparecerá aqui após o cadastro.
          </p>
        )}
      </div>
      <Button asChild variant="outline" className="office-live-add">
        <Link to="/escritorio/equipe/novo">
          <Plus size={15} /> Criar novo agente
        </Link>
      </Button>
      <div className="office-live-section-title">
        <h3>
          <Activity size={15} /> Últimos passos
        </h3>
        <Link to="/escritorio/historico">Ver histórico</Link>
      </div>
      <ol className="office-live-timeline">
        {passos
          .slice()
          .sort((a, b) => Date.parse(b.criado_em) - Date.parse(a.criado_em))
          .slice(0, 5)
          .map((p) => {
            const execution = execucoes.find((e) => e.id === p.execucao_id);
            const name = agentes.find(
              (a) => a.id === execution?.agente_id,
            )?.nome;
            return (
              <li key={p.id}>
                <time>{time(p.criado_em)}</time>
                <div>
                  {name && <strong>{name}</strong>}
                  <p>{p.mensagem}</p>
                </div>
              </li>
            );
          })}
        {!passos.length && (
          <li className="office-live-empty">
            Nenhum passo registrado. Configure um agente e execute uma análise
            para acompanhar a entrega.
          </li>
        )}
      </ol>
      <footer data-fresh={fresh}>
        <i />
        {fresh
          ? `Dados atualizados às ${time(atualizadoEm!)}`
          : "Aguardando confirmação do servidor"}
      </footer>
    </aside>
  );
}
