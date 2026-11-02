import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, Loader2, Pause, Play, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { LABEL_STATUS_EXECUCAO, chamarEscritorio, type AgenteIA, type ExecucaoAgente, type MensagemEscritorio } from "../../hooks/useAgentesIA";
import AgentEditor from "../agent-editor/AgentEditor";
import { OfficeStatus } from "../design/OfficeUI";
import { SALAS } from "../salas";
import { chamarMotor, usePainelMotor } from "../missoes/motor";
import "./central-agentes.css";

type Estado = "trabalhando" | "revisao" | "erro" | "pausado" | "disponivel";
const ROTULO: Record<Estado, { texto: string; tom: "working" | "warning" | "danger" | "neutral" | "success" }> = {
  trabalhando: { texto: "Trabalhando", tom: "working" },
  revisao: { texto: "Aguardando aprovação", tom: "warning" },
  erro: { texto: "Parou com erro", tom: "danger" },
  pausado: { texto: "Pausado", tom: "neutral" },
  disponivel: { texto: "Disponível", tom: "success" },
};
const COR_SALA: Record<string, string> = {
  diretoria: "#c9a45c", operacional: "#3f6fb5", comercial: "#2f8f6b", marketing: "#b5527a", diligencias: "#8a6d3b", reuniao: "#6b6f9e",
};
const ABAS = ["visao", "instrucoes", "ferramentas", "historico", "tarefas", "comunicacoes"] as const;
type Aba = (typeof ABAS)[number];
const NOME_ABA: Record<Aba, string> = {
  visao: "Visão geral", instrucoes: "Instruções e perfil", ferramentas: "Ferramentas e autonomia",
  historico: "Histórico", tarefas: "Tarefas", comunicacoes: "Comunicações",
};
const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Cuiaba" }) : "—");

/** Estado operacional real: última execução e entregas do agente. */
export function estadoAgente(a: AgenteIA, execucoes: ExecucaoAgente[], agora = Date.now()): Estado {
  if (!a.ativo) return "pausado";
  const minhas = execucoes.filter((e) => e.agente_id === a.id);
  if (minhas.some((e) => e.status === "executando" && agora - Date.parse(e.iniciado_em) < 600000)) return "trabalhando";
  if (minhas.some((e) => e.status === "aguardando_aprovacao")) return "revisao";
  const ultima = minhas.slice().sort((x, y) => Date.parse(y.iniciado_em) - Date.parse(x.iniciado_em))[0];
  if (ultima?.status === "erro" && agora - Date.parse(ultima.finalizado_em ?? ultima.iniciado_em) < 1800000) return "erro";
  return "disponivel";
}

function Avatar({ a, grande = false }: { a: AgenteIA; grande?: boolean }) {
  return (
    <span className={grande ? "ca-avatar ca-avatar-g" : "ca-avatar"} style={{ background: COR_SALA[a.sala ?? "operacional"] ?? "#3f6fb5" }} aria-hidden>
      {a.nome.slice(0, 1).toUpperCase()}
    </span>
  );
}

interface Ferramenta { slug: string; nome: string; descricao: string; classe: "leitura" | "escrita_interna" | "sensivel"; concedida: boolean }

function Ferramentas({ agente }: { agente: AgenteIA }) {
  const { toast } = useToast();
  const [lista, setLista] = useState<Ferramenta[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const carregar = useCallback(async () => {
    try {
      const r = await chamarMotor<{ ferramentas: Ferramenta[] }>({ acao: "ferramentas", agente_id: agente.id });
      setLista(r.ferramentas);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Indisponível");
    }
  }, [agente.id]);
  useEffect(() => { void carregar(); }, [carregar]);
  async function alternar(f: Ferramenta, conceder: boolean) {
    setOcupado(f.slug);
    try {
      await chamarMotor({ acao: "ferramenta", agente_id: agente.id, ferramenta: f.slug, conceder });
      await carregar();
    } catch (e) {
      toast({ title: "Não foi possível alterar", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setOcupado(null);
    }
  }
  if (erro) return <p className="ca-aviso">Ferramentas indisponíveis: {erro}. O motor de missões precisa estar instalado.</p>;
  if (!lista) return <p className="ca-vazio"><Loader2 className="animate-spin" size={14} /> Carregando ferramentas…</p>;
  const grupos: [Ferramenta["classe"], string, string][] = [
    ["leitura", "Consulta", "Só lê dados do escritório e das integrações."],
    ["escrita_interna", "Ação interna", "Cria tarefas e registros internos, dentro dos limites da missão."],
    ["sensivel", "Ação sensível", "Sempre vira pedido na Central de Aprovações. Nada é feito sem a sua aprovação."],
  ];
  return (
    <div className="ca-ferramentas">
      {grupos.map(([classe, titulo, desc]) => (
        <section key={classe}>
          <h4>{titulo}</h4>
          <p className="ca-sub">{desc}</p>
          {lista.filter((f) => f.classe === classe).map((f) => (
            <label key={f.slug} className="ca-ferramenta">
              <span><strong>{f.nome}</strong><small>{f.descricao}</small></span>
              <Switch checked={f.concedida} disabled={!!ocupado} onCheckedChange={(v) => void alternar(f, v)} aria-label={`${f.nome} para ${agente.nome}`} />
            </label>
          ))}
        </section>
      ))}
    </div>
  );
}

export default function CentralAgentes({
  agentes,
  execucoes,
  mensagens,
  rodar,
  revisar,
  recarregar,
  ocupado,
}: {
  agentes: AgenteIA[];
  execucoes: ExecucaoAgente[];
  mensagens: MensagemEscritorio[];
  rodar: (a: AgenteIA) => Promise<void>;
  revisar: (e: ExecucaoAgente) => void;
  recarregar: () => Promise<void>;
  ocupado: boolean;
}) {
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "ativos" | "pausados">("todos");
  const [alternando, setAlternando] = useState(false);
  const { painel } = usePainelMotor();
  const aba = (ABAS.includes(params.get("aba") as Aba) ? params.get("aba") : "visao") as Aba;
  const selecionado = agentes.find((a) => a.id === params.get("agente")) ?? agentes[0] ?? null;
  const ir = (id: string, novaAba: Aba = aba) => setParams({ agente: id, aba: novaAba }, { replace: true });

  const lista = useMemo(() => {
    const q = busca.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    return agentes.filter((a) =>
      (filtro === "todos" || (filtro === "ativos" ? a.ativo : !a.ativo)) &&
      (!q || `${a.nome} ${a.descricao ?? ""} ${a.sala ?? ""}`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes(q)));
  }, [agentes, busca, filtro]);

  if (!selecionado)
    return <p className="ca-vazio">Nenhum agente contratado ainda. Use "Contratar agente".</p>;

  const minhas = execucoes.filter((e) => e.agente_id === selecionado.id);
  const estado = estadoAgente(selecionado, execucoes);
  const sala = SALAS.find((s) => s.id === (selecionado.sala ?? "operacional"));
  const tokens30 = minhas.filter((e) => Date.now() - Date.parse(e.iniciado_em) < 30 * 864e5)
    .reduce((s, e) => s + (typeof e.saida?.tokens === "number" ? (e.saida.tokens as number) : 0), 0);
  const consumoMotor = painel?.consumo_agentes?.[selecionado.id];
  const erros = minhas.filter((e) => e.status === "erro").slice(0, 3);
  const tarefas = (painel?.missoes ?? []).flatMap((m) => m.tarefas.filter((t) => t.agente_id === selecionado.id).map((t) => ({ ...t, missao: m.titulo })));
  const conversa = mensagens.filter((m) => m.agente_id === selecionado.id || m.destinatario_id === selecionado.id).slice(-30).reverse();
  const nome = (id: string | null) => agentes.find((a) => a.id === id)?.nome ?? null;

  async function alternarAtivo() {
    setAlternando(true);
    try {
      await chamarEscritorio({ acao: "alternar", agente_id: selecionado!.id, ativo: !selecionado!.ativo });
      await recarregar();
    } catch (e) {
      toast({ title: "Não foi possível alterar", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setAlternando(false);
    }
  }

  return (
    <div className="ca">
      <aside className="ca-lista" aria-label="Agentes do escritório">
        <div className="ca-busca">
          <Search size={14} aria-hidden />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar agente" aria-label="Buscar agente" />
        </div>
        <div className="ca-filtros" role="group" aria-label="Filtrar agentes">
          {(["todos", "ativos", "pausados"] as const).map((f) => (
            <button key={f} type="button" aria-pressed={filtro === f} onClick={() => setFiltro(f)}>
              {f === "todos" ? `Todos (${agentes.length})` : f === "ativos" ? `Ativos (${agentes.filter((a) => a.ativo).length})` : `Pausados (${agentes.filter((a) => !a.ativo).length})`}
            </button>
          ))}
        </div>
        <ul>
          {lista.map((a) => {
            const e = ROTULO[estadoAgente(a, execucoes)];
            return (
              <li key={a.id}>
                <button type="button" className="ca-item" aria-current={a.id === selecionado.id} onClick={() => ir(a.id)}>
                  <Avatar a={a} />
                  <span className="ca-item-texto">
                    <strong>{a.nome}</strong>
                    <small>{SALAS.find((s) => s.id === (a.sala ?? "operacional"))?.nome ?? a.sala}</small>
                  </span>
                  <OfficeStatus tone={e.tom}>{e.texto}</OfficeStatus>
                </button>
              </li>
            );
          })}
          {!lista.length && <li className="ca-vazio">Nenhum agente encontrado.</li>}
        </ul>
      </aside>

      <section className="ca-detalhe" aria-label={`Agente ${selecionado.nome}`}>
        <header className="ca-topo">
          <Avatar a={selecionado} grande />
          <div className="ca-topo-texto">
            <h2>{selecionado.nome}</h2>
            <p>{sala?.nome ?? selecionado.sala} · {selecionado.executor === "analista_operacional" ? "Analista de IA" : "Rotina do sistema"}</p>
            <OfficeStatus tone={ROTULO[estado].tom}>{ROTULO[estado].texto}</OfficeStatus>
          </div>
          <div className="ca-topo-acoes">
            {selecionado.executor === "analista_operacional" && (
              <Button size="sm" onClick={() => void rodar(selecionado)} disabled={!selecionado.ativo || ocupado}>
                <Play size={14} /> Executar agora
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => void alternarAtivo()} disabled={alternando}>
              {selecionado.ativo ? <><Pause size={14} /> Pausar</> : <><Play size={14} /> Ligar</>}
            </Button>
          </div>
        </header>

        <nav className="ca-abas" role="tablist" aria-label="Seções do agente">
          {ABAS.map((x) => (
            <button key={x} type="button" role="tab" aria-selected={aba === x} onClick={() => ir(selecionado.id, x)}>{NOME_ABA[x]}</button>
          ))}
        </nav>

        <div className="ca-painel" role="tabpanel" aria-label={NOME_ABA[aba]}>
          {aba === "visao" && (
            <div className="ca-grade">
              <div className="ca-bloco">
                <h4>Responsabilidades</h4>
                <p>{selecionado.descricao ?? "Sem descrição. Defina em Instruções e perfil."}</p>
              </div>
              <div className="ca-bloco">
                <h4>Funcionamento</h4>
                <dl>
                  <div><dt>Departamento</dt><dd>{sala?.nome ?? selecionado.sala}</dd></div>
                  <div><dt>Modelo de IA</dt><dd>Modelo do escritório (definido no orçamento de IA, em Aprovações)</dd></div>
                  <div><dt>Rotina</dt><dd>{selecionado.intervalo_minutos ? `a cada ${selecionado.intervalo_minutos >= 1440 ? "24 h" : `${selecionado.intervalo_minutos / 60} h`}` : "Execução manual ou por missão"}</dd></div>
                  <div><dt>Autonomia</dt><dd>{selecionado.exige_aprovacao ? "Entregas e ações sensíveis passam por aprovação" : "Entregas sem revisão obrigatória"}</dd></div>
                </dl>
              </div>
              <div className="ca-bloco">
                <h4>Consumo de IA (30 dias)</h4>
                <dl>
                  <div><dt>Execuções</dt><dd>{minhas.filter((e) => Date.now() - Date.parse(e.iniciado_em) < 30 * 864e5).length}</dd></div>
                  <div><dt>Tokens (analista)</dt><dd>{tokens30 ? tokens30.toLocaleString("pt-BR") : "—"}</dd></div>
                  <div><dt>Missões (custo)</dt><dd>{consumoMotor ? `US$ ${consumoMotor.custo_usd.toFixed(4).replace(".", ",")} · ${Number(consumoMotor.tokens).toLocaleString("pt-BR")} tokens` : "—"}</dd></div>
                </dl>
              </div>
              <div className="ca-bloco">
                <h4>Alertas</h4>
                {erros.length ? (
                  <ul className="ca-alertas">
                    {erros.map((e) => <li key={e.id}><AlertTriangle size={13} /> {quando(e.iniciado_em)} · {e.erro ?? "Falha sem mensagem"}</li>)}
                  </ul>
                ) : <p className="ca-sub">Nenhum erro registrado.</p>}
              </div>
            </div>
          )}

          {aba === "instrucoes" && (
            <AgentEditor agenteId={selecionado.id} agentes={agentes} recarregar={recarregar} />
          )}

          {aba === "ferramentas" && <Ferramentas agente={selecionado} />}

          {aba === "historico" && (
            minhas.length ? (
              <ul className="ca-linhas">
                {minhas.slice(0, 40).map((e) => (
                  <li key={e.id}>
                    <span className={`ca-st ca-st-${e.status}`}>{LABEL_STATUS_EXECUCAO[e.status]}</span>
                    <span className="ca-linha-texto">{e.resumo ?? e.erro ?? "Sem resumo"}</span>
                    <time>{quando(e.iniciado_em)}</time>
                    {e.status === "aguardando_aprovacao" && <Button size="sm" variant="outline" onClick={() => revisar(e)}>Revisar</Button>}
                  </li>
                ))}
              </ul>
            ) : <p className="ca-vazio">Nenhuma execução registrada.</p>
          )}

          {aba === "tarefas" && (
            tarefas.length ? (
              <ul className="ca-linhas">
                {tarefas.map((t) => (
                  <li key={t.id}>
                    <span className={`ca-st ca-st-${t.estado}`}>{t.estado === "executando" ? "Trabalhando" : t.estado === "pendente" ? "Na fila" : t.estado === "concluida" ? "Concluída" : t.estado === "falhou" ? "Falhou" : "Cancelada"}</span>
                    <span className="ca-linha-texto"><strong>{t.titulo}</strong> · {t.missao}{t.resumo ? ` — ${t.resumo}` : ""}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="ca-vazio">Nenhuma tarefa de missão para este agente{painel ? "" : " (motor de missões indisponível)"}.</p>
          )}

          {aba === "comunicacoes" && (
            conversa.length ? (
              <ul className="ca-linhas">
                {conversa.map((m) => (
                  <li key={m.id}>
                    <span className="ca-linha-texto">
                      <strong>{m.origem === "usuario" ? "Diretoria" : nome(m.agente_id) ?? "Sistema"}</strong>
                      {" → "}{m.destinatario_id ? nome(m.destinatario_id) : m.origem === "usuario" ? selecionado.nome : "Diretoria"}: {m.texto.slice(0, 280)}
                    </span>
                    <time>{quando(m.criado_em)}</time>
                  </li>
                ))}
              </ul>
            ) : <p className="ca-vazio">Sem mensagens deste agente.</p>
          )}
        </div>
      </section>
    </div>
  );
}
