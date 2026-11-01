import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  Check,
  FileText,
  Plus,
  Save,
  Settings2,
  Sparkles,
  Trash2,
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
] as const;
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
  const agent = agentes.find((a) => a.id === agenteId);
  const agentRef=useRef(agent);agentRef.current=agent;
  const [config, setConfig] = useState<ConfigAgente>(inicial),
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
      setRev(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    void chamarEscritorio({ acao: "configuracao", agente_id: agenteId })
      .then((d) => {
        if (!active) return;
        const currentAgent=agentRef.current;
        setRev(d.revisao);
        setConfig(
          d.revisao > 0
            ? validarConfigAgente(d.config)
            : {
                ...inicial,
                nome: currentAgent?.nome ?? "",
                missao: currentAgent?.descricao ?? "",
                sala: currentAgent?.sala ?? "operacional",
                ativo: currentAgent?.ativo ?? false,
                intervalo_minutos: currentAgent?.intervalo_minutos ?? null,
              },
        );
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
      <div className="agent-editor-layout">
        <div className="op-panel">
          <div className="agent-editor-intro">
            <span className="agent-editor-avatar">
              {config.nome.trim().slice(0, 2).toUpperCase() || "IA"}
            </span>
            <div>
              <h2>
                {agenteId ? "Personalizar agente" : "Criar um novo agente"}
              </h2>
              <p>Defina como ele analisa, o que consulta e quando trabalha.</p>
            </div>
          </div>
          <div
            className="agent-editor-tabs"
            role="tablist"
            aria-label="Configuração do agente"
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                tabIndex={tab === t.id ? 0 : -1}
                onKeyDown={(e) => {
                  const i = TABS.findIndex((x) => x.id === tab);
                  const idx =
                    e.key === "ArrowRight"
                      ? (i + 1) % 4
                      : e.key === "ArrowLeft"
                        ? (i + 3) % 4
                        : e.key === "Home"
                          ? 0
                          : e.key === "End"
                            ? 3
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
                  <label>
                    Nome do agente
                    <Input
                      value={config.nome}
                      maxLength={80}
                      placeholder="Ex.: Sofia · Operações"
                      onChange={(e) => change("nome", e.target.value)}
                    />
                  </label>
                  <label>
                    Cargo
                    <Input
                      value={config.cargo}
                      maxLength={120}
                      onChange={(e) => change("cargo", e.target.value)}
                    />
                  </label>
                  <label>
                    Missão
                    <Textarea
                      rows={3}
                      maxLength={1000}
                      value={config.missao}
                      placeholder="Qual resultado você espera deste agente?"
                      onChange={(e) => change("missao", e.target.value)}
                    />
                  </label>
                  <div className="agent-editor-two">
                    <label>
                      Sala
                      <select
                        value={config.sala}
                        onChange={(e) => change("sala", e.target.value)}
                      >
                        {SALAS.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nome}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Tom das respostas
                      <select
                        value={config.tom}
                        onChange={(e) =>
                          change("tom", e.target.value as ConfigAgente["tom"])
                        }
                      >
                        <option value="objetivo">Objetivo</option>
                        <option value="formal">Formal</option>
                        <option value="acolhedor">Acolhedor</option>
                      </select>
                    </label>
                  </div>
                </>
              )}
              {tab === "prompt" && (
                <>
                  <label>
                    Prompt base
                    <Textarea
                      value={config.prompt_base}
                      rows={13}
                      maxLength={6000}
                      onChange={(e) => change("prompt_base", e.target.value)}
                      placeholder="Descreva papel, critérios, formato de resposta e orientações do seu escritório."
                    />
                  </label>
                  <span className="agent-editor-counter">
                    {config.prompt_base.length}/6.000 caracteres
                  </span>
                  <p>
                    Use o prompt para definir critérios e apresentação. As
                    ferramentas e permissões continuam sendo controladas pelo
                    sistema.
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
                  <p>
                    Adicione procedimentos, critérios e orientações internas. Os
                    trechos mais relacionados à demanda são enviados ao agente e
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
                      <label>
                        Título da fonte {i + 1}
                        <Input
                          value={doc.titulo}
                          maxLength={120}
                          onChange={(e) =>
                            updateDoc(doc.id, { titulo: e.target.value })
                          }
                        />
                      </label>
                      <label>
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
                  <h3>Ferramentas disponíveis</h3>
                  {[
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
                  ].map((tool) => (
                    <label className="agent-editor-tool" key={tool.id}>
                      <input
                        type="checkbox"
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
                      <div>
                        <strong>{tool.label}</strong>
                        <p>{tool.text}</p>
                      </div>
                    </label>
                  ))}
                  <label>
                    Frequência
                    <select
                      value={config.intervalo_minutos ?? "manual"}
                      onChange={(e) =>
                        change(
                          "intervalo_minutos",
                          e.target.value === "manual"
                            ? null
                            : Number(e.target.value),
                        )
                      }
                    >
                      <option value="manual">Somente quando eu executar</option>
                      <option value="1440">A cada 24 horas</option>
                      <option value="240">A cada 4 horas</option>
                      <option value="60">A cada hora</option>
                    </select>
                  </label>
                  <label className="agent-editor-tool">
                    <input
                      type="checkbox"
                      checked={config.ativo}
                      onChange={(e) => change("ativo", e.target.checked)}
                    />
                    <div>
                      <strong>Ativar agente</strong>
                      <p>
                        Permite execução manual e a rotina escolhida. Salvar
                        pausado não inicia chamadas de IA.
                      </p>
                    </div>
                  </label>
                </>
              )}
            </fieldset>
          )}
        </div>
        <aside className="op-panel agent-editor-summary">
          <p className="agent-editor-kicker">SEU FUNCIONÁRIO DE IA</p>
          <h3>{config.nome || "Novo agente"}</h3>
          <p>{config.cargo}</p>
          <span className="agent-editor-state">
            {config.ativo ? "Ativo após salvar" : "Pausado após salvar"}
          </span>
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
              <dt>Revisão</dt>
              <dd>Humana, obrigatória</dd>
            </div>
            <div>
              <dt>Orçamento</dt>
              <dd>50 mil tokens/dia compartilhados</dd>
            </div>
          </dl>
          <h4>O que funciona nesta etapa</h4>
          <p>
            Análise dos indicadores e das referências que você cadastrar,
            relatórios e conversa no canal do agente.
          </p>
          <p>
            O prompt não habilita ações de escrita, consultas processuais ou
            integrações externas. As rotinas DJEN e a Clara continuam em seus
            executores próprios.
          </p>
          <Link to="/escritorio/chat">Abrir conversas →</Link>
        </aside>
      </div>
    </section>
  );
}
