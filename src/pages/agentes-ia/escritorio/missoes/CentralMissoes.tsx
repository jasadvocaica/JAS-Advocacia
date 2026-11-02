import { useMemo, useState } from "react";
import { Activity, CheckCircle2, Clock, Loader2, Plus, ShieldCheck, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { AgenteIA } from "../../hooks/useAgentesIA";
import { OfficeEmpty, OfficeStatus } from "../design/OfficeUI";
import {
  COLUNAS,
  chamarMotor,
  colunaDaMissao,
  hora,
  progresso,
  textoAtividade,
  usePainelMotor,
  type Missao,
} from "./motor";
import "./missoes.css";

const PRIORIDADE: Record<number, string> = { 1: "Urgente", 2: "Alta", 3: "Normal", 4: "Baixa", 5: "Baixa" };
const ESTADO_TAREFA: Record<string, { texto: string; tom: "neutral" | "success" | "warning" | "danger" | "working" }> = {
  pendente: { texto: "Na fila", tom: "neutral" },
  executando: { texto: "Trabalhando", tom: "working" },
  concluida: { texto: "Concluída", tom: "success" },
  falhou: { texto: "Falhou", tom: "danger" },
  cancelada: { texto: "Cancelada", tom: "warning" },
};

const iniciais = (nome: string) =>
  nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");

export function Indicador({ icone: Icone, valor, rotulo }: { icone: React.ElementType; valor: string | number; rotulo: string }) {
  return (
    <div className="mi-kpi">
      <Icone size={20} aria-hidden />
      <strong>{valor}</strong>
      <span>{rotulo}</span>
    </div>
  );
}

function CartaoMissao({ m, abrir }: { m: Missao; abrir: () => void }) {
  const agentes = [...new Map(m.tarefas.map((t) => [t.agente_id, t.agente])).values()];
  const pct = progresso(m);
  return (
    <button type="button" className="mi-card" onClick={abrir} aria-label={`Abrir missão ${m.titulo}`}>
      <span className="mi-card-titulo">{m.titulo}</span>
      <span className="mi-card-meta">
        <span className={`mi-prio mi-prio-${m.prioridade <= 2 ? "alta" : "normal"}`}>{PRIORIDADE[m.prioridade]}</span>
        <span>{m.tarefas.length} {m.tarefas.length === 1 ? "tarefa" : "tarefas"}</span>
        {m.aprovacoes_abertas > 0 && <span className="mi-aguarda">{m.aprovacoes_abertas} p/ aprovar</span>}
      </span>
      <span className="mi-barra" aria-label={`${pct}% das tarefas encerradas`}>
        <i style={{ width: `${pct}%` }} />
      </span>
      <span className="mi-avatares">
        {agentes.slice(0, 4).map((nome) => (
          <span key={nome} className="mi-avatar" title={nome}>{iniciais(nome)}</span>
        ))}
        <span className="mi-card-hora">{hora(m.criada_em)}</span>
      </span>
    </button>
  );
}

export default function CentralMissoes({ agentes }: { agentes: AgenteIA[] }) {
  const { painel, erro, carregando, recarregar } = usePainelMotor();
  const { toast } = useToast();
  const [nova, setNova] = useState(false);
  const [aberta, setAberta] = useState<Missao | null>(null);
  const [form, setForm] = useState({ titulo: "", objetivo: "", agente_id: "", prioridade: 3 });
  const [enviando, setEnviando] = useState(false);

  const porColuna = useMemo(() => {
    const mapa = Object.fromEntries(COLUNAS.map((c) => [c.id, [] as Missao[]]));
    for (const m of painel?.missoes ?? []) mapa[colunaDaMissao(m)].push(m);
    return mapa;
  }, [painel]);

  const ativos = agentes.filter((a) => a.ativo);
  const manu = ativos.find((a) => a.slug === "manu" || a.nome.toLowerCase().startsWith("manu"));

  async function criar() {
    setEnviando(true);
    try {
      await chamarMotor({ acao: "criar_missao", ...form, agente_id: form.agente_id || manu?.id, chave: crypto.randomUUID() });
      toast({ title: "Missão criada", description: painel?.motor_ligado ? "Ela entra na fila do motor." : "O motor está desligado: a missão espera até ser ligado." });
      setNova(false);
      setForm({ titulo: "", objetivo: "", agente_id: "", prioridade: 3 });
      await recarregar();
    } catch (e) {
      toast({ title: "Não foi possível criar", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  }

  if (carregando && !painel) return <div className="mi-carregando"><Loader2 className="animate-spin" /> Carregando missões…</div>;
  if (erro && !painel)
    return (
      <OfficeEmpty icon={Target} title="Central de Missões indisponível">
        {erro}. O motor de missões precisa estar instalado (Fase 2, homologação).
      </OfficeEmpty>
    );
  if (!painel) return null;

  const abertas = painel.missoes.filter((m) => m.estado === "aberta");
  return (
    <section className="mi" aria-label="Central de Missões">
      <header className="mi-topo">
        <div>
          <p className="mi-sobre">Missões que os agentes executam, do pedido à entrega aprovada.</p>
          <OfficeStatus tone={painel.motor_ligado ? "success" : "warning"}>
            {painel.motor_ligado ? "Motor ligado" : "Motor desligado: nada é executado"}
          </OfficeStatus>
        </div>
        <div className="mi-kpis">
          <Indicador icone={Target} valor={abertas.length} rotulo="Missões abertas" />
          <Indicador icone={Activity} valor={porColuna.execucao.length} rotulo="Em execução" />
          <Indicador icone={ShieldCheck} valor={porColuna.aprovacao.length} rotulo="Aguardando aprovação" />
          <Indicador icone={CheckCircle2} valor={porColuna.concluida.length} rotulo="Concluídas (7 dias)" />
        </div>
        <Button onClick={() => setNova(true)} disabled={!ativos.length}>
          <Plus size={16} /> Nova missão
        </Button>
      </header>

      <div className="mi-corpo">
        <div className="mi-quadro">
          {COLUNAS.map((c) => (
            <div key={c.id} className="mi-coluna" aria-label={c.titulo}>
              <h3>
                {c.titulo} <span>{porColuna[c.id].length}</span>
              </h3>
              {porColuna[c.id].length ? (
                porColuna[c.id].map((m) => <CartaoMissao key={m.id} m={m} abrir={() => setAberta(m)} />)
              ) : (
                <p className="mi-vazio">{c.vazio}</p>
              )}
            </div>
          ))}
        </div>

        <aside className="mi-lateral" aria-label="Atividades recentes">
          <h3><Clock size={16} /> Atividades recentes</h3>
          {painel.atividades.length ? (
            <ol>
              {painel.atividades.map((a) => (
                <li key={a.id}>
                  <time>{hora(a.criado_em)}</time>
                  <span>{textoAtividade(a)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mi-vazio">Nada registrado ainda.</p>
          )}
        </aside>
      </div>

      <Dialog open={nova} onOpenChange={setNova}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova missão</DialogTitle>
            <DialogDescription>
              A missão vai para um agente, que pode delegar partes a outros. Ações sensíveis sempre voltam para aprovação.
            </DialogDescription>
          </DialogHeader>
          <label className="mi-campo">
            Título
            <Input value={form.titulo} maxLength={200} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
          </label>
          <label className="mi-campo">
            O que precisa ser feito
            <Textarea rows={4} value={form.objetivo} maxLength={4000} onChange={(e) => setForm({ ...form, objetivo: e.target.value })} />
          </label>
          <div className="mi-campos">
            <label className="mi-campo">
              Responsável
              <select value={form.agente_id || manu?.id || ""} onChange={(e) => setForm({ ...form, agente_id: e.target.value })}>
                {ativos.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
            </label>
            <label className="mi-campo">
              Prioridade
              <select value={form.prioridade} onChange={(e) => setForm({ ...form, prioridade: Number(e.target.value) })}>
                <option value={1}>Urgente</option>
                <option value={2}>Alta</option>
                <option value={3}>Normal</option>
                <option value={4}>Baixa</option>
              </select>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNova(false)}>Cancelar</Button>
            <Button onClick={() => void criar()} disabled={enviando || form.titulo.trim().length < 3 || !form.objetivo.trim()}>
              {enviando && <Loader2 className="animate-spin" size={16} />} Criar missão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!aberta} onOpenChange={(v) => !v && setAberta(null)}>
        <DialogContent className="mi-detalhe">
          {aberta && (
            <>
              <DialogHeader>
                <DialogTitle>{aberta.titulo}</DialogTitle>
                <DialogDescription>{aberta.objetivo}</DialogDescription>
              </DialogHeader>
              <ol className="mi-tarefas">
                {aberta.tarefas.map((t) => (
                  <li key={t.id} style={{ marginLeft: t.profundidade * 16 }}>
                    <span className="mi-avatar">{iniciais(t.agente)}</span>
                    <div>
                      <strong>{t.titulo}</strong>
                      <small>{t.agente}{t.tentativas > 1 ? ` · tentativa ${t.tentativas}` : ""}</small>
                      {(t.resumo || t.erro) && <p>{t.resumo ?? t.erro}</p>}
                    </div>
                    <OfficeStatus tone={ESTADO_TAREFA[t.estado].tom}>{ESTADO_TAREFA[t.estado].texto}</OfficeStatus>
                  </li>
                ))}
              </ol>
              {aberta.aprovacoes_abertas > 0 && (
                <p className="mi-aviso">Esta missão tem {aberta.aprovacoes_abertas} pedido(s) na Central de Aprovações, na Sala da Gestora.</p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
