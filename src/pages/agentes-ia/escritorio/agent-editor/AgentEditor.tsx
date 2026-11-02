import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle2,
  FileText,
  Inbox,
  Lock,
  Plus,
  Save,
  Settings2,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { chamarEscritorio, type AgenteIA } from "../../hooks/useAgentesIA";
import {
  validarConfigAgente,
  type ConfigAgente,
  type FonteAgente,
} from "../../../../../supabase/functions/_shared/agentes-config";
import { SALAS } from "../salas";
import "./agent-editor.css";
import { PERSONA_TEMPLATES, templateConfig } from "./personaTemplates";

const inicial: ConfigAgente = {
  nome: "",
  missao: "",
  cargo: "Analista do escritório",
  sala: "operacional",
  prompt_base:
    "Analise as informações disponíveis, identifique prioridades e apresente recomendações claras para minha revisão. Diferencie fatos de hipóteses e cite as fontes consultadas.",
  tom: "objetivo",
  ferramentas: ["indicadores_operacionais", "base_conhecimento"],
  documentos: [],
  intervalo_minutos: null,
  ativo: false,
};
const TABS = [
  { id: "perfil", label: "Perfil", icon: Sparkles },
  { id: "prompt", label: "Instruções", icon: FileText },
  { id: "base", label: "Conhecimento", icon: BookOpen },
  { id: "rotina", label: "Ferramentas e rotina", icon: Settings2 },
  { id: "entrega", label: "Como entrega", icon: Inbox },
] as const;
const FERRAMENTAS = [
  {
    id: "indicadores_operacionais",
    label: "Indicadores operacionais",
    text: "Consulta os totais reais da Controladoria e das execuções.",
  },
  {
    id: "base_conhecimento",
    label: "Consultar base de conhecimento",
    text: "Seleciona até seis trechos das fontes deste agente.",
  },
];
const FREQUENCIAS: { valor: number | null; label: string }[] = [
  { valor: null, label: "Somente quando eu executar" },
  { valor: 1440, label: "A cada 24 horas" },
  { valor: 240, label: "A cada 4 horas" },
  { valor: 60, label: "A cada hora" },
];
const TONS: { valor: ConfigAgente["tom"]; label: string }[] = [
  { valor: "objetivo", label: "Objetivo" },
  { valor: "formal", label: "Formal" },
  { valor: "acolhedor", label: "Acolhedor" },
];
// cor do avatar pela sala, na paleta do escritório
const COR_SALA: Record<string, string> = {
  diretoria: "#c8a45d",
  operacional: "#1f3a5f",
  comercial: "#0f5b4f",
  reuniao: "#5b4a8a",
  diligencias: "#2f5d3a",
  marketing: "#8a3b55",
};
const iniciais = (nome: string) =>
  nome
    .trim()
    .split(/\s+/)
    .filter((p) => !/^[·•-]$/.test(p))
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase() || "IA";

/** Linha do formulário: rótulo à esquerda, controle à direita (quebra no celular). */
function Linha({
  titulo,
  ajuda,
  children,
  bloco,
}: {
  titulo: ReactNode;
  ajuda?: ReactNode;
  children?: ReactNode;
  bloco?: boolean;
}) {
  return (
    <div className={bloco ? "ae-row ae-row-block" : "ae-row"}>
      <div className="ae-row-text">
        <strong>{titulo}</strong>
        {ajuda ? <small>{ajuda}</small> : null}
      </div>
      {children}
    </div>
  );
}

export default function AgentEditor({
  agenteId,
  agentes,
  recarregar,
}: {
  agenteId?: string;
  agentes: AgenteIA[];
  recarregar: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const [modelo, setModelo] = useState("");
  const agent = agentes.find((a) => a.id === agenteId);
  const agentRef = useRef(agent);
  agentRef.current = agent;
  const [config, setConfig] = useState<ConfigAgente>(inicial),
    [base, setBase] = useState<ConfigAgente>(inicial),
    [rev, setRev] = useState(0),
    [tab, setTab] = useState<string>("perfil"),
    [loading, setLoading] = useState(!!agenteId),
    [saving, setSaving] = useState(false),
    [error, setError] = useState<string | null>(null),
    [saved, setSaved] = useState(false),
    [ready, setReady] = useState(!agenteId),
    [loadKey, setLoadKey] = useState(0);
  const change = <K extends keyof ConfigAgente>(
    key: K,
    value: ConfigAgente[K],
  ) => {
    setConfig((v) => ({ ...v, [key]: value }));
    setSaved(false);
  };
  useEffect(() => {
    let active = true;
    setReady(!agenteId);
    setSaved(false);
    if (!agenteId) {
      setConfig(inicial);
      setBase(inicial);
      setRev(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    void chamarEscritorio({ acao: "configuracao", agente_id: agenteId })
      .then((d) => {
        if (!active) return;
        const currentAgent = agentRef.current;
        setRev(d.revisao);
        const carregada =
          d.revisao > 0
            ? validarConfigAgente(d.config)
            : {
                ...inicial,
                nome: currentAgent?.nome ?? "",
                missao: currentAgent?.descricao ?? "",
                sala: currentAgent?.sala ?? "operacional",
                ativo: currentAgent?.ativo ?? false,
                intervalo_minutos: currentAgent?.intervalo_minutos ?? null,
              };
        setConfig(carregada);
        setBase(carregada);
        setReady(true);
        setError(null);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [agenteId, agent?.id, loadKey]);
  function updateDoc(id: string, patch: Partial<FonteAgente>) {
    change(
      "documentos",
      config.documentos.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    );
  }
  async function attach(files: FileList | null) {
    if (!files) return;
    try {
      const docs = await Promise.all(
        Array.from(files).map(async (f) => {
          if (!/\.(txt|md)$/i.test(f.name) || f.size > 90000)
            throw new Error(
              "Use arquivos TXT ou Markdown UTF-8 de até 90 KB e 20 mil caracteres.",
            );
          const texto = new TextDecoder("utf-8", { fatal: true }).decode(
            await f.arrayBuffer(),
          );
          return {
            id: crypto.randomUUID(),
            titulo: f.name.slice(0, 120),
            texto,
          };
        }),
      );
      const next = { ...config, documentos: [...config.documentos, ...docs] };
      validarConfigAgente({ ...next, nome: next.nome || "Agente em edição" });
      change("documentos", next.documentos);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Arquivo inválido.");
    }
  }
  async function save() {
    setSaving(true);
    setError(null);
    try {
      const validated = validarConfigAgente(config);
      const d = await chamarEscritorio({
        acao: "salvar_configuracao",
        agente_id: agenteId ?? null,
        revisao: rev,
        config: validated,
      });
      setRev(d.revisao);
      setBase(validated);
      setSaved(true);
      await recarregar();
      if (!agenteId)
        navigate(`/escritorio/equipe/${d.agente_id}/editar`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }
  const chars = config.documentos.reduce((s, d) => s + d.texto.length, 0);
  const alterado = useMemo(
    () => ready && JSON.stringify(config) !== JSON.stringify(base),
    [ready, config, base],
  );
  const sala = SALAS.find((s) => s.id === config.sala);
  const comBase = config.ferramentas.includes("base_conhecimento");
  const comIndicadores = config.ferramentas.includes(
    "indicadores_operacionais",
  );
  const frequencia =
    FREQUENCIAS.find((f) => f.valor === config.intervalo_minutos)?.label ??
    "Somente quando eu executar";

  return (
    <section className="agent-editor" aria-label="Editor de agentes">
      <div className="agent-editor-toolbar">
        <Link to="/escritorio/equipe">
          <ArrowLeft size={14} />
          Voltar à equipe
        </Link>
        <div>
          {rev > 0 && <span>Configuração v{rev}</span>}
          <Button
            disabled={saving || loading || !ready}
            onClick={() => void save()}
          >
            <Save size={15} />
            {saving ? "Salvando…" : "Salvar agente"}
          </Button>
        </div>
      </div>
      {error && (
        <div className="agent-editor-alert">
          <p role="alert">{error}</p>
          {agenteId && (
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => setLoadKey((v) => v + 1)}
            >
              Descartar alterações locais e recarregar
            </Button>
          )}
        </div>
      )}
      {saved && (
        <p role="status" className="agent-editor-saved">
          <Check size={14} />
          Configuração salva. As próximas execuções usam esta versão.
        </p>
      )}

      <header className="ae-hero">
        <span
          className="ae-avatar"
          style={{ background: COR_SALA[config.sala] ?? "#1f3a5f" }}
          aria-hidden
        >
          {iniciais(config.nome)}
        </span>
        <div className="ae-hero-text">
          <p className="ae-kicker">
            {agenteId ? "Agente de IA" : "Novo agente de IA"}
            {sala ? ` · ${sala.nome}` : ""}
          </p>
          <h2>{config.nome || (agenteId ? "Agente" : "Novo agente")}</h2>
          <div className="ae-hero-meta">
            <span>{config.cargo}</span>
            <span className={config.ativo ? "ae-pill ae-pill-on" : "ae-pill"}>
              {config.ativo ? "Ligado" : "Pausado"}
            </span>
            {rev > 0 && <span className="ae-pill">v{rev}</span>}
          </div>
          {config.missao ? <p className="ae-mission">{config.missao}</p> : null}
        </div>
        <div className="ae-hero-side">
          <button
            type="button"
            role="switch"
            aria-checked={config.ativo}
            aria-label="Ligado"
            className="ae-switch"
            disabled={!ready || saving}
            onClick={() => change("ativo", !config.ativo)}
          >
            <i />
          </button>
          <span>{config.ativo ? "Ligado após salvar" : "Pausado após salvar"}</span>
        </div>
      </header>

      {!agenteId && (
        <div className="agent-template-picker">
          <div>
            <label>
              Começar com um modelo
              <select
                aria-label="Modelo de agente"
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
              >
                <option value="">Criar do zero</option>
                {PERSONA_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome} · {t.cargo}
                  </option>
                ))}
              </select>
            </label>
            <Button
              variant="outline"
              type="button"
              disabled={!modelo}
              onClick={() => {
                const c = templateConfig(modelo);
                if (c) {
                  setConfig(c);
                  setSaved(false);
                  setError(null);
                  setTab("perfil");
                }
              }}
            >
              Aplicar modelo ao rascunho
            </Button>
          </div>
          <p>
            Preenche o perfil e substitui este rascunho. O agente começa
            pausado, com as ferramentas disponíveis nesta etapa. Fluxos de
            prazo, atendimento e publicação dependem de seus executores
            próprios.
          </p>
        </div>
      )}

      <div
        className="agent-editor-tabs"
        role="tablist"
        aria-label="Configuração do agente"
      >
        {TABS.map((t, i) => (
          <button
            key={t.id}
            role="tab"
            tabIndex={tab === t.id ? 0 : -1}
            onKeyDown={(e) => {
              const n = TABS.length;
              const idx =
                e.key === "ArrowRight"
                  ? (i + 1) % n
                  : e.key === "ArrowLeft"
                    ? (i + n - 1) % n
                    : e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? n - 1
                        : -1;
              if (idx >= 0) {
                e.preventDefault();
                setTab(TABS[idx].id);
                document.getElementById(`tab-${TABS[idx].id}`)?.focus();
              }
            }}
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      <div className="agent-editor-layout">
        <div className="ae-card">
          {loading ? (
            <p role="status">Carregando configuração privada…</p>
          ) : (
            <fieldset
              disabled={!ready || saving}
              className="agent-editor-fields"
              role="tabpanel"
              id={`panel-${tab}`}
              aria-labelledby={`tab-${tab}`}
            >
              {tab === "perfil" && (
                <>
                  <h3>Quem é {config.nome || "este agente"}</h3>
                  <p className="ae-sub">
                    Nome, cargo e missão aparecem na mesa do escritório e nas
                    entregas.
                  </p>
                  <label className="ae-field">
                    Nome do agente
                    <Input
                      value={config.nome}
                      maxLength={80}
                      placeholder="Ex.: Sofia · Operações"
                      onChange={(e) => change("nome", e.target.value)}
                    />
                  </label>
                  <label className="ae-field">
                    Cargo
                    <Input
                      value={config.cargo}
                      maxLength={120}
                      onChange={(e) => change("cargo", e.target.value)}
                    />
                  </label>
                  <label className="ae-field">
                    Missão
                    <Textarea
                      rows={3}
                      maxLength={1000}
                      value={config.missao}
                      placeholder="Qual resultado você espera deste agente?"
                      onChange={(e) => change("missao", e.target.value)}
                    />
                  </label>
                  <Linha titulo="Sala" ajuda="Onde a mesa fica no escritório 3D">
                    <select
                      aria-label="Sala"
                      className="ae-select"
                      value={config.sala}
                      onChange={(e) => change("sala", e.target.value)}
                    >
                      {SALAS.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nome}
                        </option>
                      ))}
                    </select>
                  </Linha>
                  <Linha titulo="Tom das respostas" bloco>
                    <div className="ae-chips" role="group" aria-label="Tom das respostas">
                      {TONS.map((t) => (
                        <button
                          type="button"
                          key={t.valor}
                          aria-pressed={config.tom === t.valor}
                          className={config.tom === t.valor ? "ae-chip on" : "ae-chip"}
                          onClick={() => change("tom", t.valor)}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </Linha>
                </>
              )}
              {tab === "prompt" && (
                <>
                  <h3>Instruções</h3>
                  <p className="ae-sub">
                    O jeito de {config.nome || "o agente"} trabalhar, em
                    português. Cada versão salva fica no histórico.
                  </p>
                  <label className="ae-field">
                    Prompt base
                    <Textarea
                      className="ae-prompt"
                      value={config.prompt_base}
                      rows={14}
                      maxLength={6000}
                      onChange={(e) => change("prompt_base", e.target.value)}
                      placeholder="Descreva papel, critérios, formato de resposta e orientações do seu escritório."
                    />
                  </label>
                  <div className="ae-meter">
                    <span
                      style={{
                        width: `${Math.min(100, (config.prompt_base.length / 6000) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="agent-editor-counter">
                    {config.prompt_base.length}/6.000 caracteres
                  </span>
                  <p className="ae-note">
                    <Lock size={13} /> Use as instruções para critérios e
                    apresentação. Ferramentas e permissões continuam sendo
                    controladas pelo sistema.
                  </p>
                </>
              )}
              {tab === "base" && (
                <>
                  <div className="agent-editor-base-head">
                    <div>
                      <h3>Base de conhecimento</h3>
                      <p>
                        {config.documentos.length}/10 fontes ·{" "}
                        {chars.toLocaleString("pt-BR")}/60.000 caracteres
                      </p>
                    </div>
                    <label className="agent-editor-upload">
                      Importar TXT/MD
                      <input
                        type="file"
                        multiple
                        accept=".txt,.md,text/plain,text/markdown"
                        aria-label="Importar conhecimento TXT ou Markdown"
                        className="sr-only"
                        onChange={(e) => {
                          void attach(e.target.files);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                  <div className="ae-meter">
                    <span style={{ width: `${Math.min(100, (chars / 60000) * 100)}%` }} />
                  </div>
                  <p className="ae-sub">
                    Procedimentos, critérios e orientações internas. Os trechos
                    mais relacionados à demanda são enviados ao agente e
                    identificados como fontes.
                  </p>
                  {!config.documentos.length && (
                    <div className="agent-editor-empty">
                      <BookOpen size={24} />
                      <strong>Nenhuma fonte adicionada</strong>
                      <p>
                        Importe um arquivo de texto ou escreva uma orientação
                        abaixo.
                      </p>
                    </div>
                  )}
                  {config.documentos.map((doc, i) => (
                    <article className="agent-editor-source" key={doc.id}>
                      <div>
                        <strong>Fonte {i + 1}</strong>
                        <button
                          type="button"
                          aria-label={`Remover fonte ${i + 1}`}
                          onClick={() =>
                            change(
                              "documentos",
                              config.documentos.filter((d) => d.id !== doc.id),
                            )
                          }
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <label className="ae-field">
                        Título da fonte {i + 1}
                        <Input
                          value={doc.titulo}
                          maxLength={120}
                          onChange={(e) =>
                            updateDoc(doc.id, { titulo: e.target.value })
                          }
                        />
                      </label>
                      <label className="ae-field">
                        Conteúdo da fonte {i + 1}
                        <Textarea
                          rows={6}
                          value={doc.texto}
                          maxLength={20000}
                          onChange={(e) =>
                            updateDoc(doc.id, { texto: e.target.value })
                          }
                        />
                      </label>
                      <small>
                        {doc.texto.length.toLocaleString("pt-BR")}/20.000
                        caracteres
                      </small>
                    </article>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={config.documentos.length >= 10}
                    onClick={() =>
                      change("documentos", [
                        ...config.documentos,
                        {
                          id: crypto.randomUUID(),
                          titulo: "Nova orientação",
                          texto: "",
                        },
                      ])
                    }
                  >
                    <Plus size={14} />
                    Adicionar fonte de texto
                  </Button>
                  <p className="agent-editor-note">
                    TXT e Markdown disponíveis. PDFs e documentos com imagem
                    precisam ser convertidos em texto nesta etapa. As versões
                    anteriores permanecem no histórico privado de auditoria.
                  </p>
                </>
              )}
              {tab === "rotina" && (
                <>
                  <h3>O que {config.nome || "o agente"} consulta</h3>
                  <p className="ae-sub">
                    Só leitura. Pelo menos uma ferramenta precisa ficar ligada.
                  </p>
                  {FERRAMENTAS.map((tool) => (
                    <label className="agent-editor-tool" key={tool.id}>
                      <div>
                        <strong>{tool.label}</strong>
                        <p>{tool.text}</p>
                      </div>
                      <input
                        type="checkbox"
                        className="ae-check-switch"
                        checked={config.ferramentas.includes(tool.id)}
                        onChange={(e) =>
                          change(
                            "ferramentas",
                            e.target.checked
                              ? [...config.ferramentas, tool.id]
                              : config.ferramentas.filter((t) => t !== tool.id),
                          )
                        }
                      />
                    </label>
                  ))}
                  <h3 className="ae-h3-gap">Quando trabalha</h3>
                  <p className="ae-sub">
                    Rotina no horário de Cuiabá. Uma entrega esperando revisão
                    segura a próxima análise deste agente.
                  </p>
                  <Linha titulo="Frequência" bloco>
                    <div className="ae-chips" role="group" aria-label="Frequência">
                      {FREQUENCIAS.map((f) => (
                        <button
                          type="button"
                          key={String(f.valor)}
                          aria-pressed={config.intervalo_minutos === f.valor}
                          className={
                            config.intervalo_minutos === f.valor ? "ae-chip on" : "ae-chip"
                          }
                          onClick={() => change("intervalo_minutos", f.valor)}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </Linha>
                  <label className="agent-editor-tool ae-tool-strong">
                    <div>
                      <strong>Ativar agente</strong>
                      <p>
                        Permite execução manual e a rotina escolhida. Salvar
                        pausado não inicia chamadas de IA.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      className="ae-check-switch"
                      checked={config.ativo}
                      onChange={(e) => change("ativo", e.target.checked)}
                    />
                  </label>
                </>
              )}
              {tab === "entrega" && (
                <>
                  <h3>Como {config.nome || "o agente"} entrega</h3>
                  <p className="ae-sub">
                    O caminho de cada resultado, do jeito que o sistema funciona
                    hoje.
                  </p>
                  <ol className="ae-steps">
                    <li>
                      <b>Analisa</b>
                      <span>
                        {comIndicadores && comBase
                          ? "Indicadores reais e trechos da base de conhecimento."
                          : comIndicadores
                            ? "Indicadores reais da Controladoria e das execuções."
                            : "Trechos da base de conhecimento deste agente."}
                      </span>
                    </li>
                    <li>
                      <b>Entrega para revisão</b>
                      <span>
                        O relatório fica em Tarefas e Execuções, aguardando
                        aprovação.
                      </span>
                    </li>
                    <li>
                      <b>Avisa no canal</b>
                      <span>O Canal do escritório registra a entrega.</span>
                    </li>
                    <li>
                      <b>Você decide</b>
                      <span>Aprovar ou rejeitar fica registrado. Nada é enviado.</span>
                    </li>
                  </ol>
                  <Linha titulo="Revisão humana" ajuda="Toda entrega passa por uma pessoa">
                    <span className="ae-fixed">
                      <Lock size={12} /> Obrigatória
                    </span>
                  </Linha>
                  <Linha
                    titulo="Orçamento de IA"
                    ajuda="Teto do escritório, dividido entre todos os agentes"
                  >
                    <span className="ae-fixed">50 mil tokens/dia</span>
                  </Linha>
                  <Linha titulo="Rotina" ajuda="Definida na aba Ferramentas e rotina">
                    <span className="ae-fixed">{frequencia}</span>
                  </Linha>
                  <p className="ae-note">
                    <Lock size={13} /> As instruções não habilitam escrita em
                    módulos, mensagens, consultas processuais ou integrações. As
                    rotinas DJEN e a Clara seguem em seus executores próprios.
                  </p>
                </>
              )}
            </fieldset>
          )}
        </div>

        <aside className="agent-editor-summary" aria-label="Prévia da entrega">
          <p className="agent-editor-kicker">PRÉVIA DA ENTREGA</p>
          <div className="ae-preview">
            <div className="ae-preview-head">
              <small>Tarefas e Execuções</small>
              <strong>Relatório · {config.nome || "Novo agente"}</strong>
              <span className="ae-pill ae-pill-warn">Aguardando revisão</span>
            </div>
            <div className="ae-preview-body">
              <span
                className="ae-avatar ae-avatar-sm"
                style={{ background: COR_SALA[config.sala] ?? "#1f3a5f" }}
                aria-hidden
              >
                {iniciais(config.nome)}
              </span>
              <ol>
                <li>Resumo do que importa</li>
                {comIndicadores && <li>Leitura dos indicadores</li>}
                {comBase && <li>Fontes citadas [identificador]</li>}
                <li>Recomendações para sua revisão</li>
                <li>Pendências e CONFERIR</li>
              </ol>
            </div>
            <div className="ae-preview-actions" aria-hidden>
              <span>
                <CheckCircle2 size={13} /> Aprovar
              </span>
              <span>Rejeitar</span>
            </div>
          </div>
          <dl>
            <div>
              <dt>Executor</dt>
              <dd>Analista com OpenAI</dd>
            </div>
            <div>
              <dt>Fontes próprias</dt>
              <dd>{config.documentos.length}</dd>
            </div>
            <div>
              <dt>Rotina</dt>
              <dd>{frequencia}</dd>
            </div>
            <div>
              <dt>Revisão</dt>
              <dd>Humana, obrigatória</dd>
            </div>
          </dl>
          <Link to="/escritorio/chat">Abrir conversas →</Link>
        </aside>
      </div>

      {alterado && !saving ? (
        <div className="ae-savebar" role="region" aria-label="Alterações não salvas">
          <span>Alterações não salvas em {config.nome || "este agente"}.</span>
          <Button
            variant="outline"
            onClick={() => {
              setConfig(base);
              setError(null);
            }}
          >
            <Undo2 size={14} />
            Desfazer
          </Button>
          <Button onClick={() => void save()} disabled={loading || !ready}>
            <Save size={14} />
            Salvar alterações
          </Button>
        </div>
      ) : null}
    </section>
  );
}
