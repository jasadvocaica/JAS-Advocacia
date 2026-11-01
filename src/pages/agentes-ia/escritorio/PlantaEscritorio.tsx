import { useId, useState } from "react";
import { Maximize2, Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AgenteIA, ExecucaoAgente } from "../hooks/useAgentesIA";
import { SALAS, salaAgente, aparencia, type SalaId } from "./salas";
import "./escritorio.css";
// Projeção própria: os estados e ocupantes são recebidos do catálogo real do JAS.
const p = (x: number, y: number, z = 0) => [
  420 + (x - y) * 21,
  100 + (x + y) * 11 - z,
];
const pts = (...v: number[][]) => v.map((a) => a.join(",")).join(" ");
function Bloco({
  x,
  y,
  w,
  d,
  h,
  cor,
}: {
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  cor: string;
}) {
  return (
    <g pointerEvents="none">
      <polygon
        points={pts(
          p(x, y + d),
          p(x + w, y + d),
          p(x + w, y + d, h),
          p(x, y + d, h),
        )}
        fill={cor}
        style={{ filter: "brightness(.77)" }}
      />
      <polygon
        points={pts(
          p(x + w, y),
          p(x + w, y + d),
          p(x + w, y + d, h),
          p(x + w, y, h),
        )}
        fill={cor}
        style={{ filter: "brightness(.6)" }}
      />
      <polygon
        points={pts(
          p(x, y, h),
          p(x + w, y, h),
          p(x + w, y + d, h),
          p(x, y + d, h),
        )}
        fill={cor}
      />
    </g>
  );
}
function Planta({ x, y }: { x: number; y: number }) {
  const [cx, cy] = p(x + 0.3, y + 0.3, 20);
  return (
    <g pointerEvents="none">
      <Bloco x={x} y={y} w={0.6} d={0.6} h={16} cor="#d9c8aa" />
      <path d={`M${cx},${cy + 5}v-27`} stroke="#637951" strokeWidth="3" />
      <ellipse
        cx={cx - 7}
        cy={cy - 13}
        rx="8"
        ry="15"
        fill="#6d8a66"
        transform={`rotate(-35 ${cx - 7} ${cy - 13})`}
      />
      <ellipse
        cx={cx + 6}
        cy={cy - 23}
        rx="7"
        ry="13"
        fill="#8da17e"
        transform={`rotate(30 ${cx + 6} ${cy - 23})`}
      />
    </g>
  );
}
function Mesa({
  x,
  y,
  ligada = false,
}: {
  x: number;
  y: number;
  ligada?: boolean;
}) {
  const [mx, my] = p(x + 0.9, y + 0.2, 42);
  return (
    <g pointerEvents="none">
      <Bloco x={x + 0.1} y={y + 0.1} w={0.18} d={0.7} h={24} cor="#a9916a" />
      <Bloco x={x + 1.8} y={y + 0.1} w={0.18} d={0.7} h={24} cor="#a9916a" />
      <Bloco x={x} y={y} w={2.1} d={1.05} h={27} cor="#f2e8d7" />
      <path d={`M${mx + 4},${my + 19}v-7`} stroke="#43516a" strokeWidth="4" />
      <path
        d={`M${mx - 10},${my - 2}l28,14v19l-28,-14z`}
        fill="#182438"
        stroke="#8191a6"
        strokeWidth="2"
      />
      <path
        d={`M${mx - 6},${my + 3}l20,10v11l-20,-10z`}
        fill={ligada ? "#7dc4c3" : "#758499"}
      />
      <path d={`M${mx - 5},${my + 34}l17,8l-9,4l-17,-8z`} fill="#ced0cf" />
    </g>
  );
}
function Personagem({
  x,
  y,
  id,
  chefe = false,
  trabalhando = false,
}: {
  x: number;
  y: number;
  id: string;
  chefe?: boolean;
  trabalhando?: boolean;
}) {
  const [cx, cy] = p(x, y);
  const a = aparencia(id);
  return (
    <g
      transform={`translate(${cx} ${cy})`}
      className={trabalhando ? "jas-avatar-trabalhando" : undefined}
    >
      <ellipse cy="2" rx="13" ry="6" fill="#17263a" opacity=".15" />
      <path
        d="M-7,-15v15h6v-14M2,-15v15h6v-16"
        stroke="#273247"
        strokeWidth="5"
      />
      <path
        d="M-11,-35L-13,-15Q0,-10 12,-16L9,-35Z"
        fill={chefe ? "#141c34" : a.roupa}
      />
      <path d="M-3,-34L0,-20L5,-34" fill="#f8f3e8" />
      <path
        d="M-11,-31L-17,-16M11,-29L17,-20"
        stroke={chefe ? "#141c34" : a.roupa}
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M-16,-16l5,2M17,-20l4,1"
        stroke={a.pele}
        strokeWidth="5"
        strokeLinecap="round"
      />
      <rect x="-3" y="-40" width="8" height="8" fill={a.pele} />
      {(a.longo || chefe) && (
        <path d="M-12,-56Q0,-68 12,-54L14,-31L-12,-32Z" fill={a.cabelo} />
      )}
      <rect x="-10" y="-57" width="21" height="23" rx="8" fill={a.pele} />
      <path d="M-11,-48v-7Q-8,-67 7,-61Q15,-58 12,-49L1,-56Z" fill={a.cabelo} />
      <path d="M-3,-47h2M6,-45h2" stroke="#3e302c" strokeWidth="2" />
      <path d="M0,-39l4,1" stroke="#a46b5c" strokeWidth="1.5" />
      {chefe && <circle cx="10" cy="-38" r="2" fill="#c7a45a" />}
    </g>
  );
}
export default function PlantaEscritorio({
  agentes,
  execucoes,
  sala,
  selecionarSala,
  selecionarAgente,
}: {
  agentes: AgenteIA[];
  execucoes: ExecucaoAgente[];
  sala: SalaId;
  selecionarSala: (sala: SalaId) => void;
  selecionarAgente: (a: AgenteIA) => void;
}) {
  const uid = useId().replace(/:/g, "");
  const [zoom, setZoom] = useState(1);
  const width = 1060 / zoom,
    height = 660 / zoom;
  const ativa = SALAS.find((s) => s.id === sala)!;
  const centro = zoom > 1 ? p(ativa.x + 3.5, ativa.y + 3) : [490, 300];
  return (
    <div className="jas-planta">
      <div className="jas-mapa-ferramentas">
        <span>
          PLANTA DO ESCRITÓRIO <span aria-hidden> / </span> <strong>01</strong>
        </span>
        <div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Diminuir mapa"
            onClick={() => setZoom((z) => Math.max(0.85, z - 0.15))}
          >
            <Minus size={15} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Ampliar mapa"
            onClick={() => setZoom((z) => Math.min(1.6, z + 0.15))}
          >
            <Plus size={15} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Restaurar visão do escritório"
            onClick={() => setZoom(1)}
          >
            <RotateCcw size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Abrir mapa em tela cheia"
            onClick={(e) => {
              const el = e.currentTarget.closest(".jas-planta");
              if (document.fullscreenElement) void document.exitFullscreen?.();
              else void el?.requestFullscreen?.();
            }}
          >
            <Maximize2 size={14} />
          </Button>
        </div>
      </div>
      <svg
        className="jas-mapa-svg"
        viewBox={`${centro[0] - width / 2} ${centro[1] - height / 2} ${width} ${height}`}
        role="group"
        aria-label="Planta isométrica do escritório Juliana Araújo. Selecione uma sala ou personagem."
      >
        <defs>
          <pattern
            id={`${uid}-piso`}
            width="42"
            height="22"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M0,11L21,0L42,11L21,22Z"
              fill="none"
              stroke="#aab6c1"
              strokeOpacity=".17"
            />
          </pattern>
          <filter
            id={`${uid}-sombra`}
            x="-30%"
            y="-30%"
            width="160%"
            height="180%"
          >
            <feDropShadow
              dx="0"
              dy="14"
              stdDeviation="12"
              floodColor="#030719"
              floodOpacity=".23"
            />
          </filter>
        </defs>
        <g filter={`url(#${uid}-sombra)`}>
          <Bloco x={-0.6} y={-0.6} w={24.2} d={15.1} h={-12} cor="#73818a" />
          <polygon
            points={pts(
              p(-0.6, -0.6),
              p(23.6, -0.6),
              p(23.6, 14.5),
              p(-0.6, 14.5),
            )}
            fill="#c4c7c4"
          />
          <polygon
            points={pts(
              p(-0.6, -0.6),
              p(23.6, -0.6),
              p(23.6, 14.5),
              p(-0.6, 14.5),
            )}
            fill={`url(#${uid}-piso)`}
          />
        </g>
        {SALAS.slice()
          .sort((a, b) => a.x + a.y - b.x - b.y)
          .map((room) => {
            const moradores = agentes.filter((a) => salaAgente(a) === room.id);
            const selecionada = sala === room.id;
            const placas = p(room.x + 3.5, room.y + 0.1, 53);
            return (
              <g key={room.id}>
                <g
                  role="button"
                  tabIndex={0}
                  aria-label={`Entrar em ${room.nome}`}
                  aria-pressed={selecionada}
                  onClick={() => selecionarSala(room.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      selecionarSala(room.id);
                    }
                  }}
                  className="jas-sala-alvo"
                >
                  <polygon
                    points={pts(
                      p(room.x, room.y),
                      p(room.x + 7, room.y),
                      p(room.x + 7, room.y + 6),
                      p(room.x, room.y + 6),
                    )}
                    fill={room.piso}
                    stroke={selecionada ? "#c8a75b" : "#b5b4ac"}
                    strokeWidth={selecionada ? 3 : 1}
                  />
                  {Array.from({ length: 6 }, (_, i) => (
                    <path
                      key={i}
                      d={`M${p(room.x + i + 1, room.y)}L${p(room.x + i + 1, room.y + 6)}`}
                      stroke="#7a766d"
                      strokeOpacity=".09"
                    />
                  ))}
                  <polygon
                    points={pts(
                      p(room.x, room.y),
                      p(room.x + 7, room.y),
                      p(room.x + 7, room.y, 44),
                      p(room.x, room.y, 44),
                    )}
                    fill={room.id === "diretoria" ? "#182743" : "#dde3e2"}
                  />
                  <polygon
                    points={pts(
                      p(room.x, room.y),
                      p(room.x, room.y + 6),
                      p(room.x, room.y + 6, 44),
                      p(room.x, room.y, 44),
                    )}
                    fill={room.id === "diretoria" ? "#273951" : "#eef0e9"}
                  />
                  <path
                    d={`M${p(room.x, room.y, 44)}L${p(room.x + 7, room.y, 44)}M${p(room.x, room.y, 44)}L${p(room.x, room.y + 6, 44)}`}
                    stroke="#c4a461"
                    strokeWidth="2"
                  />
                  <g transform={`translate(${placas})`}>
                    <rect
                      x="-67"
                      y="-16"
                      width="134"
                      height="26"
                      rx="6"
                      fill={selecionada ? "#c8a75b" : "#19273d"}
                    />
                    <text
                      textAnchor="middle"
                      y="1"
                      fill={selecionada ? "#132139" : "#faf7ef"}
                      fontSize="12"
                      fontWeight="600"
                    >
                      {room.nome}
                    </text>
                  </g>
                </g>
                <Planta x={room.x + 0.5} y={room.y + 4.8} />
                <Planta x={room.x + 5.9} y={room.y + 0.6} />
                {room.id === "reuniao" ? (
                  <g>
                    <Bloco
                      x={room.x + 2}
                      y={room.y + 2}
                      w={3.4}
                      d={2.4}
                      h={24}
                      cor="#263b50"
                    />
                    {[0, 1, 2].map((i) => (
                      <g key={i}>
                        <Bloco
                          x={room.x + 1.1}
                          y={room.y + 1.8 + i}
                          w={0.65}
                          d={0.65}
                          h={14}
                          cor="#b79c70"
                        />
                        <Bloco
                          x={room.x + 5.5}
                          y={room.y + 1.8 + i}
                          w={0.65}
                          d={0.65}
                          h={14}
                          cor="#b79c70"
                        />
                      </g>
                    ))}
                    <Bloco
                      x={room.x + 3.1}
                      y={room.y + 2.7}
                      w={1}
                      d={0.7}
                      h={26}
                      cor="#eee9db"
                    />
                  </g>
                ) : (
                  <>
                    {room.id === "diretoria" && (
                      <>
                        <Mesa x={room.x + 2} y={room.y + 2.1} />
                        <Personagem
                          x={room.x + 3.3}
                          y={room.y + 1.7}
                          id="juliana-araujo"
                          chefe
                        />

                      </>
                    )}
                    {moradores.length === 0 && room.id !== "diretoria" && (
                      <>
                        <Mesa x={room.x + 2.4} y={room.y + 2.4} />
                        <Bloco
                          x={room.x + 1}
                          y={room.y + 0.4}
                          w={2}
                          d={0.5}
                          h={29}
                          cor="#c4b899"
                        />
                      </>
                    )}
                  </>
                )}
                {moradores
                  .slice(0, room.id === "diretoria" ? 2 : 4)
                  .map((a, i) => {
                    const ultima = execucoes.find((e) => e.agente_id === a.id);
                    const ativo =
                      a.ativo &&
                      ultima?.status === "executando" &&
                      Date.now() - new Date(ultima.iniciado_em).getTime() <
                        600000;
                    const ax = room.x + (i % 2) * 2.8 + 1.5,
                      ay =
                        room.y +
                        Math.floor(i / 2) * 2.2 +
                        2.1 +
                        (room.id === "diretoria" ? 2 : 0);
                    const pos = p(ax + 1, ay + 1.3);
                    const cor = ativo
                      ? "#54c5b0"
                      : ultima?.status === "erro"
                        ? "#e99880"
                        : ultima?.status === "aguardando_aprovacao"
                          ? "#d9b969"
                          : "#9faebc";
                    return (
                      <g
                        key={a.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`Abrir agente ${a.nome}`}
                        onClick={() => selecionarAgente(a)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            selecionarAgente(a);
                          }
                        }}
                        className="jas-personagem-alvo"
                      >
                        <title>
                          {a.nome} ·{" "}
                          {ativo
                            ? "Trabalhando"
                            : (ultima?.status ?? "Sem execução registrada")}
                        </title>
<rect x={pos[0]-60} y={pos[1]-100} width="120" height="140" fill="transparent"/>
                        <Mesa x={ax} y={ay} ligada={ativo} />
                        <Personagem
                          x={ax + 0.8}
                          y={ay + 1.4}
                          id={a.id}
                          trabalhando={ativo}
                        />
                        <g transform={`translate(${pos[0]} ${pos[1] + 15})`}>
                          <rect
                            x="-66"
                            y="0"
                            width="132"
                            height="23"
                            rx="5"
                            fill="#15233c"
                          />
                          <circle cx="-55" cy="11" r="3" fill={cor} />
                          <text
                            x="3"
                            y="15"
                            textAnchor="middle"
                            fill="#faf5e9"
                            fontSize="10"
                          >
                            {a.nome.length > 21
                              ? a.nome.slice(0, 20) + "…"
                              : a.nome}
                          </text>
                        </g>
                      </g>
                    );
                  })}
                {moradores.length > (room.id === "diretoria" ? 2 : 4) && (
                  <text
                    x={p(room.x + 4, room.y + 6)[0]}
                    y={p(room.x + 4, room.y + 6)[1] + 22}
                    fontSize="12"
                    fill="#25364c"
                  >
                    +{moradores.length - (room.id === "diretoria" ? 2 : 4)} na
                    equipe da sala
                  </text>
                )}
              </g>
            );
          })}
        <g transform={`translate(${p(12, 7.1)})`}>
          <text
            textAnchor="middle"
            fill="#6f736b"
            fontSize="10"
            letterSpacing="3"
          >
            JULIANA ARAÚJO · ADVOCACIA
          </text>
        </g>
      </svg>
      <div className="jas-legenda">
        <span>
          <i style={{ background: "#54c5b0" }} />
          Em execução
        </span>
        <span>
          <i style={{ background: "#d9b969" }} />
          Para revisão
        </span>
        <span>
          <i style={{ background: "#e99880" }} />
          Falha registrada
        </span>
        <span>
          <i style={{ background: "#9faebc" }} />
          Sem execução ativa
        </span>
      </div>
    </div>
  );
}
