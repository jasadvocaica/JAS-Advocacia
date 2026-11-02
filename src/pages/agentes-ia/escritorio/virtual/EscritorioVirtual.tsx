import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Box, Grid3x3, Maximize, MessageSquare, Minimize, PanelTopClose, PanelTopOpen } from "lucide-react";
import type { AgenteIA, ExecucaoAgente, MensagemEscritorio } from "../../hooks/useAgentesIA";
import EscritorioIsometrico from "../EscritorioIsometrico";
import ChatOperacao from "./ChatOperacao";
import "./escritorio-virtual.css";

type Modo = "isometrico" | "3d";
const lerPref = (k: string, padrao: string) => {
  try { return localStorage.getItem(k) ?? padrao; } catch { return padrao; }
};
const gravarPref = (k: string, v: string) => {
  try { localStorage.setItem(k, v); } catch { /* navegador sem armazenamento */ }
};

/**
 * Escritório Virtual único: isométrico (principal) ou 3D, tela cheia, modo imersivo e
 * painel lateral com as conversas e eventos reais dos agentes.
 */
export default function EscritorioVirtual({
  agentes,
  execucoes,
  mensagens,
  atualizadoEm,
  ocupado,
  rodar,
  revisar,
  imersivo,
  setImersivo,
  cena3d,
}: {
  agentes: AgenteIA[];
  execucoes: ExecucaoAgente[];
  mensagens: MensagemEscritorio[];
  atualizadoEm: string | null;
  ocupado: boolean;
  rodar: (a: AgenteIA) => Promise<void> | void;
  revisar: (e: ExecucaoAgente) => void;
  imersivo: boolean;
  setImersivo: (v: boolean) => void;
  cena3d: () => ReactNode;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const [modo, setModoEstado] = useState<Modo>(() => (lerPref("jas-escritorio-modo", "isometrico") === "3d" ? "3d" : "isometrico"));
  // em tela pequena o chat começa fechado para não cobrir o escritório
  const [chat, setChatEstado] = useState(() => lerPref("jas-escritorio-chat", window.innerWidth >= 900 ? "aberto" : "fechado") === "aberto");
  const [telaCheia, setTelaCheia] = useState(false);
  const setModo = (m: Modo) => { setModoEstado(m); gravarPref("jas-escritorio-modo", m); };
  const setChat = (v: boolean) => { setChatEstado(v); gravarPref("jas-escritorio-chat", v ? "aberto" : "fechado"); };

  useEffect(() => {
    const aoMudar = () => setTelaCheia(document.fullscreenElement === raiz.current);
    document.addEventListener("fullscreenchange", aoMudar);
    return () => document.removeEventListener("fullscreenchange", aoMudar);
  }, []);
  useEffect(() => {
    if (!imersivo) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.fullscreenElement) setImersivo(false); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [imersivo, setImersivo]);
  useEffect(() => () => setImersivo(false), [setImersivo]);

  const alternarTelaCheia = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (raiz.current?.requestFullscreen) await raiz.current.requestFullscreen();
      else setImersivo(!imersivo); // navegador sem Fullscreen API: usa o modo imersivo
    } catch {
      setImersivo(!imersivo);
    }
  }, [imersivo, setImersivo]);

  const trabalhando = execucoes.filter((e) => e.status === "executando" && Date.now() - Date.parse(e.iniciado_em) < 600000).length;
  const revisao = execucoes.filter((e) => e.status === "aguardando_aprovacao").length;

  return (
    <div ref={raiz} className="ev" data-chat={chat} data-tela-cheia={telaCheia}>
      <div className="ev-palco">
        {modo === "isometrico" ? (
          <EscritorioIsometrico
            agentes={agentes}
            execucoes={execucoes}
            mensagens={mensagens}
            atualizadoEm={atualizadoEm}
            ocupado={ocupado}
            rodar={rodar}
            revisar={revisar}
            preencher
          />
        ) : (
          <div className="ev-3d">{cena3d()}</div>
        )}
        <div className="ev-barra" role="toolbar" aria-label="Controles do escritório">
          <div className="ev-modos" role="radiogroup" aria-label="Visualização">
            <button type="button" role="radio" aria-checked={modo === "isometrico"} onClick={() => setModo("isometrico")}>
              <Grid3x3 size={14} /> Isométrico
            </button>
            <button type="button" role="radio" aria-checked={modo === "3d"} onClick={() => setModo("3d")}>
              <Box size={14} /> 3D
            </button>
          </div>
          <span className="ev-resumo" aria-live="polite">{trabalhando} trabalhando · {revisao} para revisar</span>
          <button type="button" onClick={() => setChat(!chat)} aria-pressed={chat} title="Conversas e eventos">
            <MessageSquare size={15} /> <span>Conversas</span>
          </button>
          <button type="button" onClick={() => setImersivo(!imersivo)} aria-pressed={imersivo}
            title={imersivo ? "Mostrar a barra do escritório (Esc)" : "Esconder a barra do escritório"}>
            {imersivo ? <PanelTopOpen size={15} /> : <PanelTopClose size={15} />} <span>{imersivo ? "Sair do imersivo" : "Imersivo"}</span>
          </button>
          <button type="button" onClick={() => void alternarTelaCheia()} aria-pressed={telaCheia}
            title={telaCheia ? "Sair da tela cheia (Esc)" : "Tela cheia"}>
            {telaCheia ? <Minimize size={15} /> : <Maximize size={15} />} <span>{telaCheia ? "Sair da tela cheia" : "Tela cheia"}</span>
          </button>
        </div>
      </div>
      {chat && <ChatOperacao agentes={agentes} execucoes={execucoes} mensagens={mensagens} fechar={() => setChat(false)} />}
    </div>
  );
}
