import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ChevronLeft,
  Eye,
  Home,
  Minus,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { buildOffice, type Quality } from "./engine";
import { currentTask, DEPARTAMENTOS, STATUS, CLARA_STATION } from "./model";
import { useClaraLive } from "./useClaraLive";
import type { AgenteIA, ExecucaoAgente } from "../../hooks/useAgentesIA";
import { salaAgente, type SalaId } from "../salas";
import { readPreference, savePreference } from "../design/useOfficeAppearance";
import PlantaEscritorio from "../PlantaEscritorio";
import "./office3d.css";
interface Props {
  agentes: AgenteIA[];
  execucoes: ExecucaoAgente[];
  sala: SalaId;
  selecionarSala: (id: SalaId) => void;
  selecionarAgente: (a: AgenteIA) => void;
}
const links: Record<string, string> = {
  recepcao: "/clientes",
  diretoria: "/dashboard-gestor",
  comando: "/escritorio",
  operacional: "/controladoria",
  controladoria: "/controladoria",
  processos: "/processos",
  diligencias: "/diligencias",
  comercial: "/comercial/contratacoes",
  marketing: "/marketing",
  financeiro: "/financeiro",
  reuniao: "/escritorio/entregas",
  copa: "/escritorio/chat",
};
export default function LiveOffice3D(props: Props) {
  const propsRef = useRef(props);
  propsRef.current = props;
  const host = useRef<HTMLDivElement>(null),
    engine = useRef<ReturnType<typeof buildOffice> | null>(null);
  const { snapshot, error, updated } = useClaraLive();
  const task = currentTask(snapshot?.tarefas ?? []);
  const [fallback, setFallback] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [room, setRoom] = useState<string | null>(null),
    [follow, setFollow] = useState(false),
    [ambient, setAmbient] = useState(false),
    [reduced, setReduced] = useState(false),
    [quality, setQuality] = useState<Quality>(() => {
      const saved = readPreference("jas-office-3d-quality", "media");
      return saved === "alta" || saved === "economica" ? saved : "media";
    });
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(t);
  }, []);
  const stalled =
    task?.estado === "running" && now - Date.parse(task.atualizado_em) > 600000;
  const stale = !!error || !updated || now - updated > 15000 || stalled;
  const native = useMemo(
    () =>
      props.agentes.map((a, i) => {
        const r = DEPARTAMENTOS.find((r) => r.id === salaAgente(a))!;
        const same = props.agentes
          .slice(0, i)
          .filter((p) => salaAgente(p) === salaAgente(a)).length;
        return {
          id: a.id,
          nome: a.nome,
          point: { x: r.x + 1 + same * 1.5, z: r.z + 4 },
          color: ["#355475", "#7a8e7a", "#8e6973"][i % 3],
        };
      }),
    [props.agentes],
  );
  const nativeKey = JSON.stringify(native);
  useEffect(() => {
    if (!host.current || fallback) return;
    try {
      engine.current = buildOffice(
        host.current,
        [
          {
            id: "clara-txt-v1",
            nome: "Clara · Cadastro TXT",
            point: CLARA_STATION,
            color: "#355475",
          },
          ...JSON.parse(nativeKey),
        ],
        (id) => {
          if (id === "clara-txt-v1") {
            setSelected(id);
            setRoom(null);
          } else {
            const a = propsRef.current.agentes.find((a) => a.id === id);
            if (a) propsRef.current.selecionarAgente(a);
          }
        },
        (id) => {
          setRoom(id);
          setSelected(null);
          setFollow(false);
        },
        () => setFallback(true),
      );
    } catch {
      setFallback(true);
    }
    return () => {
      engine.current?.dispose();
      engine.current = null;
    };
  }, [nativeKey, fallback]);
  useEffect(() => {
    engine.current?.state(task?.estado, stale);
  }, [task?.estado, task?.id, stale, nativeKey, fallback]);
  useEffect(() => {
    engine.current?.options({ ambient, reduce: reduced, quality, follow });
    savePreference("jas-office-3d-quality", quality);
  }, [ambient, reduced, quality, follow, nativeKey, fallback]);
  useEffect(() => {
    const root = document.documentElement;
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () =>
      setReduced(
        mq.matches || root.getAttribute("data-office-reduce-motion") === "true",
      );
    const observer = new MutationObserver(update);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-office-reduce-motion"],
    });
    mq.addEventListener("change", update);
    update();
    return () => {
      observer.disconnect();
      mq.removeEventListener("change", update);
    };
  }, []);
  function focusRoom(id: string) {
    setRoom(id);
    setSelected(null);
    setFollow(false);
    const r = DEPARTAMENTOS.find((r) => r.id === id)!;
    engine.current?.focus({ x: r.x + 4, z: r.z + 3 });
  }
  function openTask(id: string) {
    savePreference("jas_clara_m1_tarefa", id);
  }
  return (
    <div
      className="live-office"
      role={fallback ? "region" : "group"}
      aria-label="Planta isométrica do escritório Juliana Araújo. Selecione uma sala ou personagem."
    >
      {fallback ? (
        <div className="live-office-fallback">
          <p role="status">
            Visualização econômica 2D: WebGL indisponível. O acompanhamento da
            Clara permanece ativo.
          </p>
          <PlantaEscritorio {...props} />
        </div>
      ) : (
        <div
          ref={host}
          className="live-office-canvas"
          aria-label="Cena tridimensional interativa do escritório"
        />
      )}
      <div className="live-office-brand">
        <svg
          className="live-office-monogram"
          viewBox="640 440 380 440"
          role="img"
          aria-label="Monograma Juliana Araújo"
        >
          <image href="/logo-juliana-araujo.png" width="1600" height="1600" />
        </svg>
        <div>
          <strong>Juliana Araújo</strong>
          <small>ESCRITÓRIO VIRTUAL · {fallback ? "2D" : "3D"}</small>
        </div>
      </div>
      <div className="live-office-toolbar" aria-label="Controles da cena">
        <button
          title="Aproximar"
          aria-label="Aproximar câmera"
          onClick={() => engine.current?.zoom(0.85)}
        >
          <Plus size={17} />
        </button>
        <button
          title="Afastar"
          aria-label="Afastar câmera"
          onClick={() => engine.current?.zoom(1.15)}
        >
          <Minus size={17} />
        </button>
        <button
          title="Visão geral"
          aria-label="Retornar à visão geral"
          onClick={() => {
            setFollow(false);
            setRoom(null);
            engine.current?.focus();
          }}
        >
          <Home size={17} />
        </button>
        <label>
          <span className="sr-only">Qualidade gráfica</span>
          <select
            aria-label="Qualidade gráfica"
            value={quality}
            onChange={(e) => setQuality(e.target.value as Quality)}
          >
            <option value="alta">Alta</option>
            <option value="media">Média</option>
            <option value="economica">Econômica</option>
          </select>
        </label>
      </div>
      <div className="live-office-state" role="status">
        <i data-stale={stale} />
        <span>
          {stale
            ? error
              ? "Acompanhamento indisponível"
              : "Consultando servidor…"
            : "Estado confirmado no servidor"}
        </span>
        {updated && (
          <time>
            {new Date(updated).toLocaleTimeString("pt-BR", {
              timeZone: "America/Cuiaba",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </time>
        )}
      </div>
      <div className="live-office-agent-shortcut">
        <button
          aria-label="Abrir agente Clara"
          aria-pressed={selected === "clara-txt-v1"}
          onClick={() => {
            setSelected("clara-txt-v1");
            setRoom(null);
          }}
        >
          <span>CL</span>
          <div>
            <strong>Clara</strong>
            <small>
              {stale
                ? "Estado não confirmado"
                : task
                  ? (STATUS[task.estado] ?? task.estado)
                  : snapshot?.habilitado
                    ? "Sem tarefa registrada"
                    : "Homologação desabilitada"}
            </small>
          </div>
          <ChevronLeft size={15} />
        </button>
        <label>
          <input
            type="checkbox"
            checked={ambient}
            disabled={reduced}
            onChange={(e) => setAmbient(e.target.checked)}
          />
          Movimentos ambientais · sem tarefas
        </label>
      </div>
      {(selected || room) && (
        <aside
          className="live-office-panel"
          aria-label={
            selected ? "Acompanhamento da Clara" : "Departamento selecionado"
          }
        >
          <button
            className="live-office-close"
            aria-label="Fechar painel de acompanhamento"
            onClick={() => {
              setSelected(null);
              setRoom(null);
              setFollow(false);
            }}
          >
            <X size={17} />
          </button>
          {selected ? (
            <>
              <p className="live-office-eyebrow">
                AGENTE CONECTADA · HOMOLOGAÇÃO
              </p>
              <h2>Clara</h2>
              <p>Cadastro de clientes · Executor TXT</p>
              <span className="live-office-badge">
                {stale
                  ? "Último estado · sem confirmação atual"
                  : task
                    ? (STATUS[task.estado] ?? task.estado)
                    : "Sem tarefa registrada"}
              </span>
              <div className="live-office-panel-actions">
                <button
                  disabled={fallback}
                  onClick={() => {
                    setFollow((v) => !v);
                  }}
                >
                  <Eye size={14} />
                  {follow ? "Parar de seguir" : "Acompanhar avatar"}
                </button>
                <Link to="/escritorio">
                  Central de Comando <ArrowUpRight size={14} />
                </Link>
              </div>
              {error && (
                <p role="alert" className="live-office-error">
                  {error} As animações de trabalho ficam suspensas.
                </p>
              )}
              {stalled && (
                <p className="live-office-error">
                  Execução sem avanço há mais de dez minutos. Confira a tarefa
                  na Central.
                </p>
              )}
              {task ? (
                <>
                  <h3>Tarefa atual</h3>
                  <code>{task.id}</code>
                  <p>
                    {STATUS[task.estado] ?? task.estado} ·{" "}
                    {task.pendencias_total} pendência(s)
                  </p>
                  <dl>
                    <div>
                      <dt>Tokens confirmados</dt>
                      <dd>{task.tokens_entrada + task.tokens_saida}</dd>
                    </div>
                    <div>
                      <dt>Custo estimado</dt>
                      <dd>US$ {Number(task.custo_estimado_usd).toFixed(6)}</dd>
                    </div>
                    <div>
                      <dt>Tentativas</dt>
                      <dd>{task.tentativas}/3</dd>
                    </div>
                    <div>
                      <dt>Ferramentas</dt>
                      <dd>OpenAI · validação CPF · cadastro isolado</dd>
                    </div>
                  </dl>
                  {task.cadastro_confirmado && (
                    <p className="live-office-success">
                      Cadastro confirmado pelo backend na homologação.
                    </p>
                  )}
                  {task.possui_erro && (
                    <p className="live-office-error">
                      O executor registrou um erro. Abra a tarefa para conferir.
                    </p>
                  )}
                  <Link
                    className="live-office-task-link"
                    to="/escritorio"
                    onClick={() => openTask(task.id)}
                  >
                    Abrir tarefa e revisão <ArrowUpRight size={14} />
                  </Link>
                  <h3>Etapas registradas</h3>
                  <ol>
                    {task.eventos.map((e) => (
                      <li key={e.id}>
                        <strong>{STATUS[e.estado] ?? e.estado}</strong>
                        <time>
                          {new Date(e.criado_em).toLocaleString("pt-BR", {
                            timeZone: "America/Cuiaba",
                          })}
                        </time>
                      </li>
                    ))}
                  </ol>
                </>
              ) : (
                <p>
                  Envie um TXT fictício pela Central de Comando. O avatar
                  acompanhará a execução confirmada pelo servidor.
                </p>
              )}
              <details>
                <summary>Histórico de tarefas</summary>
                {snapshot?.tarefas.map((t) => (
                  <Link
                    key={t.id}
                    to="/escritorio"
                    onClick={() => openTask(t.id)}
                  >
                    {STATUS[t.estado] ?? t.estado}
                    <small>
                      {new Date(t.criado_em).toLocaleString("pt-BR", {
                        timeZone: "America/Cuiaba",
                      })}
                    </small>
                  </Link>
                ))}
              </details>
              <p className="live-office-note">
                O movimento representa o estado; o registro do backend comprova
                a operação. Atualização por consulta a cada 5 segundos, sem
                consumo de IA.
              </p>
            </>
          ) : (
            <>
              <p className="live-office-eyebrow">DEPARTAMENTO</p>
              <h2>{DEPARTAMENTOS.find((r) => r.id === room)?.nome}</h2>
              <p>Ambiente integrado aos módulos existentes do JAS.</p>
              <Link className="live-office-task-link" to={links[room!]}>
                Abrir área do sistema <ArrowUpRight size={14} />
              </Link>
              <h3>Equipe cadastrada</h3>
              {props.agentes
                .filter((a) => salaAgente(a) === room)
                .map((a) => (
                  <button
                    key={a.id}
                    className="live-office-native"
                    onClick={() => props.selecionarAgente(a)}
                  >
                    {a.nome}
                    <span>
                      {a.ativo ? "Ver execução e configuração" : "Pausado"}
                    </span>
                  </button>
                ))}
              {room === "operacional" && (
                <button
                  className="live-office-native"
                  onClick={() => {
                    setSelected("clara-txt-v1");
                    setRoom(null);
                  }}
                >
                  Clara<span>Cadastro TXT em homologação</span>
                </button>
              )}
              <p className="live-office-note">
                Uma sala vazia não implica agentes contratados. Os demais
                funcionários serão integrados gradualmente.
              </p>
            </>
          )}
        </aside>
      )}
      <nav
        className="live-office-dock"
        aria-label="Departamentos do escritório 3D"
      >
        {DEPARTAMENTOS.map((r) => (
          <button
            key={r.id}
            aria-pressed={room === r.id}
            onClick={() => focusRoom(r.id)}
          >
            {r.nome}
          </button>
        ))}
      </nav>
      {!fallback && (
        <p className="live-office-help">
          Arraste para girar · botão direito para mover · rolagem para zoom
        </p>
      )}
    </div>
  );
}
