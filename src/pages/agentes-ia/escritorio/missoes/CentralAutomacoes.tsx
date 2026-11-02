import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, Loader2, Pencil, Play, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { AgenteIA } from "../../hooks/useAgentesIA";
import { OfficeEmpty, OfficeStatus } from "../design/OfficeUI";
import { chamarMotor, hora } from "./motor";
import "./missoes.css";

export interface Automacao {
  id: string;
  nome: string;
  setor: string;
  agente_id: string;
  agente: string;
  instrucoes: string;
  frequencia: "intervalo" | "diaria" | "semanal";
  intervalo_minutos: number | null;
  hora: string | null;
  dias_semana: number[] | null;
  prioridade: number;
  ativa: boolean;
  proxima_execucao: string | null;
  ultima_execucao: string | null;
  ultima_missao_estado: string | null;
}
export interface Falha {
  tarefa_id: string;
  titulo: string;
  agente: string;
  missao: string;
  tentativas: number;
  erro: string | null;
  quando: string;
}
type Rascunho = Omit<Automacao, "id" | "agente" | "ativa" | "proxima_execucao" | "ultima_execucao" | "ultima_missao_estado"> & { id?: string };

const SETORES = ["controladoria", "processos", "comercial", "financeiro", "agenda", "marketing", "sistema"];
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const LIMITES =
  " Não calcule data fatal de prazo (cite o prazo como está e peça conferência). Use só dados das ferramentas; diga quando faltar informação. Ações só como pedido de aprovação.";

/** Modelos prontos: nascem desligados e com o agente escolhido por você. */
export const MODELOS: (Omit<Rascunho, "agente_id"> & { cargo: RegExp })[] = [
  { nome: "Relatório diário da Controladoria", setor: "controladoria", frequencia: "diaria", hora: "07:30", intervalo_minutos: null, dias_semana: null, prioridade: 2, cargo: /sofia|opera/i,
    instrucoes: "Prepare o relatório do dia da Controladoria: itens vencidos, que vencem hoje e nesta semana, itens sem responsável e os mais urgentes. Organize por prioridade e diga quem precisa agir." + LIMITES },
  { nome: "Publicações do DJEN não tratadas", setor: "controladoria", frequencia: "diaria", hora: "08:00", intervalo_minutos: null, dias_semana: null, prioridade: 2, cargo: /manu|gestora/i,
    instrucoes: "Consulte as publicações do DJEN dos últimos 3 dias e os itens de triagem abertos. Para cada publicação ainda não tratada, resuma o ato, sugira a classificação e o encaminhamento, e proponha a atualização ou o item na Controladoria." + LIMITES },
  { nome: "Tarefas vencidas — fim do dia", setor: "controladoria", frequencia: "diaria", hora: "17:00", intervalo_minutos: null, dias_semana: null, prioridade: 2, cargo: /sofia|opera/i,
    instrucoes: "Liste os itens da Controladoria vencidos e não concluídos, com processo e responsável, e sugira a ordem de ataque para amanhã." + LIMITES },
  { nome: "Agenda da semana", setor: "agenda", frequencia: "semanal", hora: "07:00", intervalo_minutos: null, dias_semana: [1], prioridade: 3, cargo: /sofia|opera/i,
    instrucoes: "Monte a agenda da semana: audiências, reuniões, perícias, conciliações e diligências. Aponte conflitos de horário e o que falta preparar para cada compromisso." + LIMITES },
  { nome: "Resumo financeiro semanal", setor: "financeiro", frequencia: "semanal", hora: "16:00", intervalo_minutos: null, dias_semana: [5], prioridade: 3, cargo: /sofia|opera/i,
    instrucoes: "Prepare o resumo financeiro da semana: recebido, saídas, parcelas em aberto e as mais atrasadas, e inconsistências que chamem atenção." + LIMITES },
];

const quando = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Cuiaba", dateStyle: "short", timeStyle: "short" }) : "—";
export function descreverFrequencia(a: Pick<Automacao, "frequencia" | "hora" | "intervalo_minutos" | "dias_semana">) {
  if (a.frequencia === "intervalo") return `A cada ${(a.intervalo_minutos ?? 0) / 60} h`;
  if (a.frequencia === "diaria") return `Todo dia às ${a.hora}`;
  return `${(a.dias_semana ?? []).map((d) => DIAS[d]).join(", ")} às ${a.hora}`;
}

function Formulario({ inicial, agentes, salvar, cancelar, ocupado }: {
  inicial: Rascunho; agentes: AgenteIA[]; salvar: (r: Rascunho) => void; cancelar: () => void; ocupado: boolean;
}) {
  const [r, setR] = useState<Rascunho>(inicial);
  const set = <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => setR((x) => ({ ...x, [k]: v }));
  const valido = r.nome.trim().length >= 3 && r.instrucoes.trim().length >= 10 && !!r.agente_id &&
    (r.frequencia === "intervalo" ? !!r.intervalo_minutos : !!r.hora) && (r.frequencia !== "semanal" || (r.dias_semana ?? []).length > 0);
  return (
    <form className="op-panel au-form" aria-label="Automação" onSubmit={(e) => { e.preventDefault(); if (valido) salvar(r); }}>
      <label>Nome<Input value={r.nome} onChange={(e) => set("nome", e.target.value)} maxLength={120} /></label>
      <div className="au-linha">
        <label>Agente
          <select value={r.agente_id} onChange={(e) => set("agente_id", e.target.value)}>
            <option value="">Escolha</option>
            {agentes.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
        </label>
        <label>Setor
          <select value={r.setor} onChange={(e) => set("setor", e.target.value)}>
            {SETORES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
        </label>
        <label>Frequência
          <select value={r.frequencia} onChange={(e) => set("frequencia", e.target.value as Rascunho["frequencia"])}>
            <option value="diaria">Todo dia</option>
            <option value="semanal">Dias da semana</option>
            <option value="intervalo">A cada X horas</option>
          </select>
        </label>
        {r.frequencia === "intervalo" ? (
          <label>Horas
            <Input type="number" min={1} max={168} value={(r.intervalo_minutos ?? 0) / 60 || ""}
              onChange={(e) => set("intervalo_minutos", Math.min(168, Math.max(1, Number(e.target.value) || 1)) * 60)} />
          </label>
        ) : (
          <label>Hora (Cuiabá)<Input type="time" value={r.hora ?? ""} onChange={(e) => set("hora", e.target.value)} /></label>
        )}
      </div>
      {r.frequencia === "semanal" && (
        <fieldset className="au-dias"><legend>Dias</legend>
          {DIAS.map((d, i) => (
            <label key={d}>
              <input type="checkbox" checked={(r.dias_semana ?? []).includes(i)}
                onChange={() => set("dias_semana", (r.dias_semana ?? []).includes(i)
                  ? (r.dias_semana ?? []).filter((x) => x !== i) : [...(r.dias_semana ?? []), i].sort())} />{d}
            </label>
          ))}
        </fieldset>
      )}
      <label>O que o agente deve fazer
        <Textarea rows={5} value={r.instrucoes} onChange={(e) => set("instrucoes", e.target.value)} maxLength={4000} />
      </label>
      <div className="au-botoes">
        <Button type="submit" size="sm" disabled={!valido || ocupado}>Salvar</Button>
        <Button type="button" size="sm" variant="outline" onClick={cancelar}>Cancelar</Button>
        <small>Nova automação começa desligada.</small>
      </div>
    </form>
  );
}

/** Central de Automações: rotinas programadas dos agentes e fila de falhas. Tudo roda no servidor. */
export default function CentralAutomacoes({ agentes }: { agentes: AgenteIA[] }) {
  const { toast } = useToast();
  const [dados, setDados] = useState<{ automacoes: Automacao[]; falhas: Falha[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<Rascunho | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const contratados = agentes.filter((a) => a.ativo && a.executor === "analista_operacional");

  const carregar = useCallback(async () => {
    try {
      setDados(await chamarMotor<{ automacoes: Automacao[]; falhas: Falha[] }>({ acao: "automacoes" }));
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Automações indisponíveis.");
    }
  }, []);
  useEffect(() => void carregar(), [carregar]);

  async function agir(id: string, corpo: Record<string, unknown>, ok: string) {
    setOcupado(id);
    try {
      await chamarMotor(corpo);
      toast({ title: ok });
      setEditando(null);
      await carregar();
    } catch (e) {
      toast({ title: "Não foi possível concluir", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setOcupado(null);
    }
  }
  const novoDoModelo = (m: (typeof MODELOS)[number]) => {
    const { cargo, ...resto } = m;
    setEditando({ ...resto, agente_id: contratados.find((a) => cargo.test(a.nome))?.id ?? contratados[0]?.id ?? "" });
  };

  if (erro && !dados)
    return <OfficeEmpty icon={CalendarClock} title="Automações indisponíveis">{erro}. O motor precisa estar atualizado.</OfficeEmpty>;
  if (!dados) return <div className="mi-carregando"><Loader2 className="animate-spin" /> Abrindo as automações…</div>;

  return (
    <section className="mi au" aria-label="Automações">
      {editando ? (
        <Formulario inicial={editando} agentes={contratados} ocupado={ocupado === "form"} cancelar={() => setEditando(null)}
          salvar={(r) => {
            const { id, ...dadosForm } = r;
            void agir("form", { acao: "salvar_automacao", id: id ?? null, dados: dadosForm }, "Automação salva");
          }} />
      ) : (
        <div className="op-panel au-modelos">
          <h3><Plus size={18} /> Nova automação</h3>
          <div>
            {MODELOS.map((m) => (
              <Button key={m.nome} size="sm" variant="outline" onClick={() => novoDoModelo(m)}>{m.nome}</Button>
            ))}
            <Button size="sm" onClick={() => setEditando({ nome: "", setor: "controladoria", agente_id: contratados[0]?.id ?? "",
              instrucoes: "", frequencia: "diaria", hora: "08:00", intervalo_minutos: null, dias_semana: null, prioridade: 3 })}>
              Em branco
            </Button>
          </div>
        </div>
      )}

      <div className="op-panel">
        <h3><CalendarClock size={18} /> Automações programadas</h3>
        {dados.automacoes.length === 0 ? (
          <p className="mi-vazio">Nenhuma automação ainda. Comece por um modelo acima.</p>
        ) : (
          <ul className="au-lista">
            {dados.automacoes.map((a) => (
              <li key={a.id}>
                <div>
                  <strong>{a.nome}</strong>
                  <small>{a.agente} · {a.setor} · {descreverFrequencia(a)}</small>
                  <small>Próxima: {a.ativa ? quando(a.proxima_execucao) : "desligada"} · Última: {quando(a.ultima_execucao)}
                    {a.ultima_missao_estado ? ` (${a.ultima_missao_estado})` : ""}</small>
                </div>
                <OfficeStatus tone={a.ativa ? "success" : "neutral"}>{a.ativa ? "Ligada" : "Desligada"}</OfficeStatus>
                <div className="au-botoes">
                  <Button size="sm" variant={a.ativa ? "outline" : "default"} disabled={ocupado === a.id}
                    aria-label={`${a.ativa ? "Desligar" : "Ligar"} ${a.nome}`}
                    onClick={() => void agir(a.id, { acao: "alternar_automacao", id: a.id, ativa: !a.ativa }, a.ativa ? "Automação desligada" : "Automação ligada")}>
                    {a.ativa ? "Desligar" : "Ligar"}
                  </Button>
                  <Button size="sm" variant="outline" disabled={ocupado === a.id} aria-label={`Executar agora ${a.nome}`}
                    onClick={() => void agir(a.id, { acao: "executar_automacao", id: a.id }, "Missão criada; o motor executa em até 5 minutos")}>
                    <Play size={13} />
                  </Button>
                  <Button size="sm" variant="outline" aria-label={`Editar ${a.nome}`}
                    onClick={() => setEditando({ id: a.id, nome: a.nome, setor: a.setor, agente_id: a.agente_id, instrucoes: a.instrucoes,
                      frequencia: a.frequencia, hora: a.hora, intervalo_minutos: a.intervalo_minutos, dias_semana: a.dias_semana, prioridade: a.prioridade })}>
                    <Pencil size={13} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="op-panel">
        <h3><AlertTriangle size={18} /> Fila de falhas (30 dias)</h3>
        {dados.falhas.length === 0 ? (
          <p className="mi-vazio">Nenhuma tarefa esgotou as tentativas.</p>
        ) : (
          <ul className="au-lista">
            {dados.falhas.map((f) => (
              <li key={f.tarefa_id}>
                <div>
                  <strong>{f.titulo}</strong>
                  <small>{f.agente} · {f.missao} · {f.tentativas} tentativa(s) · {hora(f.quando)}</small>
                  {f.erro && <small className="au-erro">{f.erro}</small>}
                </div>
                <Button size="sm" variant="outline" disabled={ocupado === f.tarefa_id} aria-label={`Tentar de novo ${f.titulo}`}
                  onClick={() => void agir(f.tarefa_id, { acao: "retentar_tarefa", id: f.tarefa_id }, "Tarefa voltou para a fila")}>
                  <RotateCcw size={13} /> Tentar de novo
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
