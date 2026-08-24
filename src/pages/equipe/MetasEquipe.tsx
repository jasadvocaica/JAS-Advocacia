import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Loader2, Target, TrendingUp, Pencil, FileText, History } from "lucide-react";
import { cn } from "@/lib/utils";

type MetaTipo = "faturamento_mensal" | "contratos_fechados" | "atendimentos" | "casos_por_area" | "personalizada";
type MetaPeriodo = "mensal" | "trimestral" | "anual";
type MetaStatus = "ativa" | "pausada" | "concluida";

interface Meta {
  id: string;
  nome: string;
  tipo: MetaTipo;
  valor_alvo: number;
  periodo: MetaPeriodo;
  responsavel: string;
  status: MetaStatus;
  data_inicio: string;
  data_fim: string;
  descricao: string | null;
}

interface Progresso {
  id: string;
  meta_id: string;
  valor_lancado: number;
  observacao: string | null;
  data_lancamento: string;
}

const TIPO_LABEL: Record<MetaTipo, string> = {
  faturamento_mensal: "Faturamento mensal",
  contratos_fechados: "Contratos fechados",
  atendimentos: "Atendimentos realizados",
  casos_por_area: "Casos por área",
  personalizada: "Personalizada",
};
const PERIODO_LABEL: Record<MetaPeriodo, string> = {
  mensal: "Mensal", trimestral: "Trimestral", anual: "Anual",
};
const STATUS_LABEL: Record<MetaStatus, string> = {
  ativa: "Ativa", pausada: "Pausada", concluida: "Concluída",
};
const RESPONSAVEIS = ["Juliana", "Alanis", "Valeska", "Escritório geral"];

const FORM_VAZIO = {
  open: false,
  id: undefined as string | undefined,
  nome: "",
  tipo: "faturamento_mensal" as MetaTipo,
  valor_alvo: "",
  periodo: "mensal" as MetaPeriodo,
  responsavel: "Escritório geral",
  status: "ativa" as MetaStatus,
  data_inicio: "",
  data_fim: "",
  descricao: "",
};

function formatBRL(n: number, tipo: MetaTipo) {
  if (tipo === "faturamento_mensal") {
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  return n.toLocaleString("pt-BR");
}

function diasRestantes(dataFim: string) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const fim = new Date(dataFim + "T00:00:00");
  return Math.ceil((fim.getTime() - hoje.getTime()) / 86400000);
}

function corPorPercentual(p: number) {
  if (p >= 80) return "bg-emerald-500";
  if (p >= 50) return "bg-amber-500";
  return "bg-red-500";
}

function badgeStatus(s: MetaStatus) {
  if (s === "ativa") return "bg-emerald-500/15 text-emerald-700 border-emerald-500/30";
  if (s === "pausada") return "bg-amber-500/15 text-amber-700 border-amber-500/30";
  return "bg-muted text-muted-foreground";
}

export default function MetasEquipe() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [progressos, setProgressos] = useState<Progresso[]>([]);
  const [filtroPeriodo, setFiltroPeriodo] = useState<string>("todos");
  const [filtroResp, setFiltroResp] = useState<string>("todos");

  const [form, setForm] = useState(FORM_VAZIO);
  const [progForm, setProgForm] = useState<{
    open: boolean; meta?: Meta; valor: string; observacao: string; data: string;
  }>({ open: false, valor: "", observacao: "", data: new Date().toISOString().slice(0, 10) });

  const [historico, setHistorico] = useState<{ open: boolean; meta?: Meta }>({ open: false });

  async function carregar() {
    setLoading(true);
    const [m, p] = await Promise.all([
      supabase.from("metas").select("*").order("created_at", { ascending: false }),
      supabase.from("progresso_metas").select("*").order("data_lancamento", { ascending: false }),
    ]);
    if (m.error) toast.error("Erro ao carregar metas: " + m.error.message);
    if (p.error) toast.error("Erro ao carregar progresso: " + p.error.message);
    setMetas((m.data ?? []) as Meta[]);
    setProgressos((p.data ?? []) as Progresso[]);
    setLoading(false);
  }

  useEffect(() => { carregar(); }, []);

  const totalPorMeta = useMemo(() => {
    const t: Record<string, number> = {};
    for (const pr of progressos) t[pr.meta_id] = (t[pr.meta_id] ?? 0) + Number(pr.valor_lancado);
    return t;
  }, [progressos]);

  const metasFiltradas = useMemo(() => {
    return metas.filter(m =>
      (filtroPeriodo === "todos" || m.periodo === filtroPeriodo) &&
      (filtroResp === "todos" || m.responsavel === filtroResp)
    );
  }, [metas, filtroPeriodo, filtroResp]);

  function abrirCriar() {
    const hoje = new Date().toISOString().slice(0, 10);
    setForm({ ...FORM_VAZIO, open: true, data_inicio: hoje, data_fim: hoje });
  }

  function abrirEditar(m: Meta) {
    setForm({
      open: true, id: m.id, nome: m.nome, tipo: m.tipo,
      valor_alvo: String(m.valor_alvo), periodo: m.periodo,
      responsavel: m.responsavel, status: m.status,
      data_inicio: m.data_inicio, data_fim: m.data_fim,
      descricao: m.descricao ?? "",
    });
  }

  async function salvarMeta() {
    if (!form.nome.trim()) return toast.error("Informe o nome da meta");
    if (!form.valor_alvo || Number(form.valor_alvo) <= 0) return toast.error("Informe um valor-alvo válido");
    if (!form.data_inicio || !form.data_fim) return toast.error("Informe as datas");
    if (form.data_fim < form.data_inicio) return toast.error("Data-limite anterior à data de início");

    const payload = {
      nome: form.nome.trim(),
      tipo: form.tipo,
      valor_alvo: Number(form.valor_alvo),
      periodo: form.periodo,
      responsavel: form.responsavel,
      status: form.status,
      data_inicio: form.data_inicio,
      data_fim: form.data_fim,
      descricao: form.descricao.trim() || null,
    };

    const res = form.id
      ? await supabase.from("metas").update(payload).eq("id", form.id)
      : await supabase.from("metas").insert({ ...payload, created_by: user?.id });
    if (res.error) return toast.error(res.error.message);
    toast.success(form.id ? "Meta atualizada" : "Meta criada");
    setForm(FORM_VAZIO);
    carregar();
  }

  function abrirProgresso(m: Meta) {
    setProgForm({ open: true, meta: m, valor: "", observacao: "", data: new Date().toISOString().slice(0, 10) });
  }

  async function salvarProgresso() {
    if (!progForm.meta) return;
    if (!progForm.valor || Number(progForm.valor) <= 0) return toast.error("Informe um valor válido");
    const { error } = await supabase.from("progresso_metas").insert({
      meta_id: progForm.meta.id,
      valor_lancado: Number(progForm.valor),
      observacao: progForm.observacao.trim() || null,
      data_lancamento: progForm.data,
      created_by: user?.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Progresso registrado");
    setProgForm({ open: false, valor: "", observacao: "", data: new Date().toISOString().slice(0, 10) });
    carregar();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Metas"
        description="Crie e acompanhe metas estratégicas do escritório."
      >
        <Button asChild variant="outline" className="gap-2">
          <Link to="/equipe/metas/relatorio"><FileText className="w-4 h-4" /> Relatório mensal</Link>
        </Button>
        <Button onClick={abrirCriar} className="gap-2">
          <Plus className="w-4 h-4" /> Nova meta
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="pt-6 flex flex-wrap gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Período</Label>
            <Select value={filtroPeriodo} onValueChange={setFiltroPeriodo}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="mensal">Mensal</SelectItem>
                <SelectItem value="trimestral">Trimestral</SelectItem>
                <SelectItem value="anual">Anual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Responsável</Label>
            <Select value={filtroResp} onValueChange={setFiltroResp}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {RESPONSAVEIS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-gold" />
        </div>
      ) : metasFiltradas.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center space-y-4">
            <Target className="w-12 h-12 mx-auto text-muted-foreground/50" />
            <div>
              <h3 className="font-display text-2xl">Nenhuma meta cadastrada</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Comece criando sua primeira meta para acompanhar o desempenho do escritório.
              </p>
            </div>
            <Button onClick={abrirCriar} className="gap-2">
              <Plus className="w-4 h-4" /> Criar primeira meta
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {metasFiltradas.map((m) => {
            const realizado = totalPorMeta[m.id] ?? 0;
            const pct = m.valor_alvo > 0 ? Math.min(100, (realizado / m.valor_alvo) * 100) : 0;
            const dias = diasRestantes(m.data_fim);
            return (
              <Card key={m.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <CardTitle className="font-display text-xl truncate">{m.nome}</CardTitle>
                      <p className="text-xs text-muted-foreground">{TIPO_LABEL[m.tipo]} · {PERIODO_LABEL[m.periodo]}</p>
                    </div>
                    <Badge variant="outline" className={cn("border", badgeStatus(m.status))}>
                      {STATUS_LABEL[m.status]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-muted-foreground">{m.responsavel}</span>
                    <span className="text-2xl font-display text-foreground">{pct.toFixed(0)}%</span>
                  </div>
                  <div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div className={cn("h-full transition-all", corPorPercentual(pct))} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                      <span>{formatBRL(realizado, m.tipo)} de {formatBRL(m.valor_alvo, m.tipo)}</span>
                      <span className={cn(dias < 0 && "text-red-600", dias >= 0 && dias <= 7 && "text-amber-600")}>
                        {dias < 0 ? `${Math.abs(dias)} d em atraso` : `${dias} d restantes`}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                    <Button size="sm" onClick={() => abrirProgresso(m)} className="gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5" /> Registrar progresso
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setHistorico({ open: true, meta: m })} className="gap-1.5">
                      <History className="w-3.5 h-3.5" /> Histórico
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => abrirEditar(m)} className="gap-1.5 ml-auto">
                      <Pencil className="w-3.5 h-3.5" /> Editar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Formulário de meta */}
      <Dialog open={form.open} onOpenChange={(o) => !o && setForm(FORM_VAZIO)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">
              {form.id ? "Editar meta" : "Nova meta"}
            </DialogTitle>
            <DialogDescription>
              Defina objetivo, período e responsável pela meta.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Nome da meta *</Label>
              <Input value={form.nome} onChange={(e) => setForm(f => ({ ...f, nome: e.target.value }))}
                placeholder="Ex.: Faturamento de novembro" maxLength={120} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tipo *</Label>
                <Select value={form.tipo} onValueChange={(v: MetaTipo) => setForm(f => ({ ...f, tipo: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TIPO_LABEL) as MetaTipo[]).map(t =>
                      <SelectItem key={t} value={t}>{TIPO_LABEL[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Valor-alvo *</Label>
                <Input type="number" min="0" step="0.01" value={form.valor_alvo}
                  onChange={(e) => setForm(f => ({ ...f, valor_alvo: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Período *</Label>
                <Select value={form.periodo} onValueChange={(v: MetaPeriodo) => setForm(f => ({ ...f, periodo: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PERIODO_LABEL) as MetaPeriodo[]).map(p =>
                      <SelectItem key={p} value={p}>{PERIODO_LABEL[p]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Responsável *</Label>
                <Select value={form.responsavel} onValueChange={(v) => setForm(f => ({ ...f, responsavel: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RESPONSAVEIS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Data de início *</Label>
                <Input type="date" value={form.data_inicio}
                  onChange={(e) => setForm(f => ({ ...f, data_inicio: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Data-limite *</Label>
                <Input type="date" value={form.data_fim}
                  onChange={(e) => setForm(f => ({ ...f, data_fim: e.target.value }))} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v: MetaStatus) => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_LABEL) as MetaStatus[]).map(s =>
                      <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição (opcional)</Label>
              <Textarea value={form.descricao} maxLength={500}
                onChange={(e) => setForm(f => ({ ...f, descricao: e.target.value }))}
                placeholder="Contexto, premissas ou métricas complementares" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(FORM_VAZIO)}>Cancelar</Button>
            <Button onClick={salvarMeta}>{form.id ? "Salvar alterações" : "Criar meta"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Registrar progresso */}
      <Dialog open={progForm.open} onOpenChange={(o) => !o && setProgForm(s => ({ ...s, open: false }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Registrar progresso</DialogTitle>
            <DialogDescription>{progForm.meta?.nome}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Valor realizado *</Label>
              <Input type="number" min="0" step="0.01" value={progForm.valor}
                onChange={(e) => setProgForm(s => ({ ...s, valor: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Data do lançamento</Label>
              <Input type="date" value={progForm.data}
                onChange={(e) => setProgForm(s => ({ ...s, data: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Observação</Label>
              <Textarea value={progForm.observacao} maxLength={500} rows={3}
                onChange={(e) => setProgForm(s => ({ ...s, observacao: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProgForm(s => ({ ...s, open: false }))}>Cancelar</Button>
            <Button onClick={salvarProgresso}>Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Histórico */}
      <Dialog open={historico.open} onOpenChange={(o) => !o && setHistorico({ open: false })}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Histórico de progresso</DialogTitle>
            <DialogDescription>{historico.meta?.nome}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {progressos.filter(p => p.meta_id === historico.meta?.id).length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhum lançamento ainda.</p>
            ) : (
              progressos.filter(p => p.meta_id === historico.meta?.id).map(p => (
                <div key={p.id} className="flex justify-between gap-4 border-b border-border pb-2 text-sm">
                  <div>
                    <p className="font-medium">{formatBRL(Number(p.valor_lancado), historico.meta?.tipo ?? "personalizada")}</p>
                    {p.observacao && <p className="text-xs text-muted-foreground">{p.observacao}</p>}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(p.data_lancamento + "T00:00:00").toLocaleDateString("pt-BR")}
                  </span>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
