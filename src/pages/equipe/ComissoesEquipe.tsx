import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Plus, Loader2, Pencil, FileText, CheckCircle2, Trash2, Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type TipoBenef = "estagiaria" | "parceiro";
type TipoEvento = "indicacao_fechada" | "contrato_assinado" | "caso_encaminhado";
type BaseCalc = "honorarios_brutos" | "valor_recebido";
type StatusCom = "a_pagar" | "pago";

interface Regra {
  id: string; beneficiario: string; tipo_beneficiario: TipoBenef;
  tipo_evento: TipoEvento; percentual: number | null; valor_fixo: number | null;
  base_calculo: BaseCalc; ativo: boolean; observacao: string | null;
}
interface Comissao {
  id: string; beneficiario: string; tipo_beneficiario: TipoBenef;
  caso_id: string | null; evento_gerador: TipoEvento;
  valor_honorarios: number; percentual_aplicado: number | null;
  valor_comissao: number; data_competencia: string;
  status: StatusCom; data_pagamento: string | null; forma_pagamento: string | null;
  observacao: string | null;
}
interface ProcessoLite { id: string; numero_cnj: string | null; tipo_acao: string | null; cliente_nome?: string }

const EVENTO_LABEL: Record<TipoEvento, string> = {
  indicacao_fechada: "Indicação fechada",
  contrato_assinado: "Contrato assinado",
  caso_encaminhado: "Caso encaminhado",
};
const BASE_LABEL: Record<BaseCalc, string> = {
  honorarios_brutos: "Honorários brutos",
  valor_recebido: "Valor recebido",
};
const STATUS_LABEL: Record<StatusCom, string> = { a_pagar: "A pagar", pago: "Pago" };

const ESTAGIARIAS = ["Alanis", "Valeska"];
const PARCEIROS = ["Luciana (GO)", "Matheus (PA)", "Gabriel (RJ)", "Francisco (MG)", "Daniela (RO)", "Amanda (local)"];

const fmtBRL = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (d: string | null) => d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

function badgeStatus(s: StatusCom) {
  return s === "pago"
    ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30"
    : "bg-amber-500/15 text-amber-700 border-amber-500/30";
}

const REGRA_VAZIA = {
  open: false, id: undefined as string | undefined,
  tipo_beneficiario: "estagiaria" as TipoBenef,
  beneficiario: "Alanis",
  tipo_evento: "indicacao_fechada" as TipoEvento,
  modo: "percentual" as "percentual" | "fixo",
  percentual: "", valor_fixo: "",
  base_calculo: "honorarios_brutos" as BaseCalc,
  ativo: true, observacao: "",
};

const COM_VAZIA = {
  open: false, id: undefined as string | undefined,
  tipo_beneficiario: "estagiaria" as TipoBenef,
  beneficiario: "Alanis",
  caso_id: "" as string,
  evento_gerador: "indicacao_fechada" as TipoEvento,
  valor_honorarios: "",
  percentual_aplicado: "",
  valor_comissao: "",
  data_competencia: new Date().toISOString().slice(0, 10),
  status: "a_pagar" as StatusCom,
  data_pagamento: "",
  forma_pagamento: "",
  observacao: "",
};

export default function ComissoesEquipe() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [regras, setRegras] = useState<Regra[]>([]);
  const [comissoes, setComissoes] = useState<Comissao[]>([]);
  const [processos, setProcessos] = useState<ProcessoLite[]>([]);

  const [filtroPeriodo, setFiltroPeriodo] = useState<string>(
    new Date().toISOString().slice(0, 7)
  );
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");

  const [regraForm, setRegraForm] = useState(REGRA_VAZIA);
  const [comForm, setComForm] = useState(COM_VAZIA);
  const [pagar, setPagar] = useState<{ open: boolean; com?: Comissao; data: string; forma: string }>({
    open: false, data: new Date().toISOString().slice(0, 10), forma: "PIX",
  });

  const [buscaProcesso, setBuscaProcesso] = useState("");

  async function carregar() {
    setLoading(true);
    const [r, c, p] = await Promise.all([
      supabase.from("regras_comissao").select("*").order("beneficiario"),
      supabase.from("comissoes").select("*").order("data_competencia", { ascending: false }),
      supabase.from("processos")
        .select("id, numero_cnj, tipo_acao, clientes:cliente_id(nome)")
        .order("criado_em", { ascending: false }).limit(500),
    ]);
    if (r.error) toast.error("Regras: " + r.error.message);
    if (c.error) toast.error("Comissões: " + c.error.message);
    if (p.error) toast.error("Processos: " + p.error.message);
    setRegras((r.data ?? []) as Regra[]);
    setComissoes((c.data ?? []) as Comissao[]);
    setProcessos(((p.data ?? []) as any[]).map(x => ({
      id: x.id, numero_cnj: x.numero_cnj, tipo_acao: x.tipo_acao,
      cliente_nome: x.clientes?.nome,
    })));
    setLoading(false);
  }
  useEffect(() => { carregar(); }, []);

  const processosFiltrados = useMemo(() => {
    if (!buscaProcesso.trim()) return processos.slice(0, 50);
    const q = buscaProcesso.toLowerCase();
    return processos.filter(p =>
      p.numero_cnj?.toLowerCase().includes(q) ||
      p.tipo_acao?.toLowerCase().includes(q) ||
      p.cliente_nome?.toLowerCase().includes(q)
    ).slice(0, 50);
  }, [processos, buscaProcesso]);

  const comissoesFiltradas = useMemo(() => {
    return comissoes.filter(c => {
      const dentroMes = !filtroPeriodo || c.data_competencia.startsWith(filtroPeriodo);
      const okStatus = filtroStatus === "todos" || c.status === filtroStatus;
      return dentroMes && okStatus;
    });
  }, [comissoes, filtroPeriodo, filtroStatus]);

  const totalMesAPagar = useMemo(() =>
    comissoesFiltradas.filter(c => c.status === "a_pagar")
      .reduce((s, c) => s + Number(c.valor_comissao), 0)
  , [comissoesFiltradas]);

  function listarBeneficiarios(tipo: TipoBenef) {
    return tipo === "estagiaria" ? ESTAGIARIAS : PARCEIROS;
  }

  // ========= REGRAS =========
  function abrirNovaRegra() { setRegraForm({ ...REGRA_VAZIA, open: true }); }
  function abrirEditarRegra(r: Regra) {
    setRegraForm({
      open: true, id: r.id, tipo_beneficiario: r.tipo_beneficiario,
      beneficiario: r.beneficiario, tipo_evento: r.tipo_evento,
      modo: r.percentual != null ? "percentual" : "fixo",
      percentual: r.percentual?.toString() ?? "",
      valor_fixo: r.valor_fixo?.toString() ?? "",
      base_calculo: r.base_calculo, ativo: r.ativo,
      observacao: r.observacao ?? "",
    });
  }
  async function salvarRegra() {
    if (!regraForm.beneficiario) return toast.error("Selecione o beneficiário");
    const ehPerc = regraForm.modo === "percentual";
    if (ehPerc && (!regraForm.percentual || Number(regraForm.percentual) <= 0))
      return toast.error("Informe o percentual");
    if (!ehPerc && (!regraForm.valor_fixo || Number(regraForm.valor_fixo) <= 0))
      return toast.error("Informe o valor fixo");

    const payload = {
      beneficiario: regraForm.beneficiario,
      tipo_beneficiario: regraForm.tipo_beneficiario,
      tipo_evento: regraForm.tipo_evento,
      percentual: ehPerc ? Number(regraForm.percentual) : null,
      valor_fixo: ehPerc ? null : Number(regraForm.valor_fixo),
      base_calculo: regraForm.base_calculo,
      ativo: regraForm.ativo,
      observacao: regraForm.observacao.trim() || null,
    };
    const res = regraForm.id
      ? await supabase.from("regras_comissao").update(payload).eq("id", regraForm.id)
      : await supabase.from("regras_comissao").insert({ ...payload, created_by: user?.id });
    if (res.error) return toast.error(res.error.message);
    toast.success("Regra salva");
    setRegraForm(REGRA_VAZIA);
    carregar();
  }
  async function excluirRegra(id: string) {
    if (!confirm("Excluir esta regra?")) return;
    const { error } = await supabase.from("regras_comissao").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Regra excluída"); carregar();
  }

  // ========= COMISSÕES =========
  function abrirNovaComissao() { setComForm({ ...COM_VAZIA, open: true }); }
  function abrirEditarComissao(c: Comissao) {
    setComForm({
      open: true, id: c.id, tipo_beneficiario: c.tipo_beneficiario,
      beneficiario: c.beneficiario, caso_id: c.caso_id ?? "",
      evento_gerador: c.evento_gerador,
      valor_honorarios: c.valor_honorarios.toString(),
      percentual_aplicado: c.percentual_aplicado?.toString() ?? "",
      valor_comissao: c.valor_comissao.toString(),
      data_competencia: c.data_competencia,
      status: c.status,
      data_pagamento: c.data_pagamento ?? "",
      forma_pagamento: c.forma_pagamento ?? "",
      observacao: c.observacao ?? "",
    });
  }

  function recalcularValor(hon: string, perc: string) {
    const h = Number(hon), p = Number(perc);
    if (!isNaN(h) && !isNaN(p) && h > 0 && p > 0) {
      return ((h * p) / 100).toFixed(2);
    }
    return "";
  }

  async function salvarComissao() {
    if (!comForm.beneficiario) return toast.error("Beneficiário obrigatório");
    if (!comForm.valor_honorarios || Number(comForm.valor_honorarios) < 0)
      return toast.error("Informe o valor de honorários");
    if (!comForm.valor_comissao || Number(comForm.valor_comissao) < 0)
      return toast.error("Valor da comissão inválido");

    const payload = {
      beneficiario: comForm.beneficiario,
      tipo_beneficiario: comForm.tipo_beneficiario,
      caso_id: comForm.caso_id || null,
      evento_gerador: comForm.evento_gerador,
      valor_honorarios: Number(comForm.valor_honorarios),
      percentual_aplicado: comForm.percentual_aplicado ? Number(comForm.percentual_aplicado) : null,
      valor_comissao: Number(comForm.valor_comissao),
      data_competencia: comForm.data_competencia,
      status: comForm.status,
      data_pagamento: comForm.status === "pago" ? (comForm.data_pagamento || null) : null,
      forma_pagamento: comForm.status === "pago" ? (comForm.forma_pagamento || null) : null,
      observacao: comForm.observacao.trim() || null,
    };
    const res = comForm.id
      ? await supabase.from("comissoes").update(payload).eq("id", comForm.id)
      : await supabase.from("comissoes").insert({ ...payload, created_by: user?.id });
    if (res.error) return toast.error(res.error.message);
    toast.success("Comissão salva");
    setComForm(COM_VAZIA); carregar();
  }

  async function marcarPaga() {
    if (!pagar.com) return;
    const { error } = await supabase.from("comissoes").update({
      status: "pago", data_pagamento: pagar.data, forma_pagamento: pagar.forma,
    }).eq("id", pagar.com.id);
    if (error) return toast.error(error.message);
    toast.success("Comissão marcada como paga");
    setPagar({ open: false, data: new Date().toISOString().slice(0, 10), forma: "PIX" });
    carregar();
  }

  async function excluirComissao(id: string) {
    if (!confirm("Excluir esta comissão?")) return;
    const { error } = await supabase.from("comissoes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Comissão excluída"); carregar();
  }

  function processoLabel(id: string | null) {
    if (!id) return "—";
    const p = processos.find(x => x.id === id);
    if (!p) return "Processo";
    return p.numero_cnj || p.tipo_acao || p.cliente_nome || "Processo";
  }

  // ====== Subseções =======
  const comEstagiarias = comissoesFiltradas.filter(c => c.tipo_beneficiario === "estagiaria");
  const comParceiros = comissoesFiltradas.filter(c => c.tipo_beneficiario === "parceiro");

  const totaisPorParceiro = useMemo(() => {
    const map: Record<string, { aPagar: number; pago: number }> = {};
    for (const c of comissoesFiltradas.filter(c => c.tipo_beneficiario === "parceiro")) {
      if (!map[c.beneficiario]) map[c.beneficiario] = { aPagar: 0, pago: 0 };
      if (c.status === "pago") map[c.beneficiario].pago += Number(c.valor_comissao);
      else map[c.beneficiario].aPagar += Number(c.valor_comissao);
    }
    return map;
  }, [comissoesFiltradas]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comissões"
        description="Configure regras e acompanhe comissões da equipe e parceiros."
      >
        <Button asChild variant="outline" className="gap-2">
          <Link to="/equipe/comissoes/extrato"><FileText className="w-4 h-4" /> Extrato</Link>
        </Button>
        <Button onClick={abrirNovaComissao} className="gap-2">
          <Plus className="w-4 h-4" /> Lançar comissão
        </Button>
      </PageHeader>

      {/* Total destaque */}
      <Card className="border-gold/40 bg-gradient-to-br from-background to-gold/5">
        <CardContent className="pt-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Total a pagar no período</p>
            <p className="font-display text-4xl text-gold mt-1">{fmtBRL(totalMesAPagar)}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Mês</Label>
              <Input type="month" value={filtroPeriodo} onChange={(e) => setFiltroPeriodo(e.target.value)} className="w-44" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="a_pagar">A pagar</SelectItem>
                  <SelectItem value="pago">Pago</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-gold" />
        </div>
      ) : (
        <Tabs defaultValue="estagiarias">
          <TabsList>
            <TabsTrigger value="estagiarias">Estagiárias</TabsTrigger>
            <TabsTrigger value="parceiros">Parceiros externos</TabsTrigger>
            <TabsTrigger value="regras">Regras</TabsTrigger>
          </TabsList>

          <TabsContent value="estagiarias" className="mt-4">
            <Card><CardContent className="pt-6">
              <TabelaComissoes
                items={comEstagiarias}
                processoLabel={processoLabel}
                onPagar={(c) => setPagar({ open: true, com: c, data: new Date().toISOString().slice(0, 10), forma: "PIX" })}
                onEditar={abrirEditarComissao}
                onExcluir={excluirComissao}
              />
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="parceiros" className="mt-4 space-y-4">
            {Object.keys(totaisPorParceiro).length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(totaisPorParceiro).map(([nome, t]) => (
                  <Card key={nome}><CardContent className="pt-6">
                    <p className="font-medium">{nome}</p>
                    <div className="flex justify-between mt-2 text-sm">
                      <span className="text-amber-700">A pagar: {fmtBRL(t.aPagar)}</span>
                      <span className="text-emerald-700">Pago: {fmtBRL(t.pago)}</span>
                    </div>
                  </CardContent></Card>
                ))}
              </div>
            )}
            <Card><CardContent className="pt-6">
              <TabelaComissoes
                items={comParceiros}
                processoLabel={processoLabel}
                onPagar={(c) => setPagar({ open: true, com: c, data: new Date().toISOString().slice(0, 10), forma: "PIX" })}
                onEditar={abrirEditarComissao}
                onExcluir={excluirComissao}
              />
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="regras" className="mt-4">
            <Card><CardContent className="pt-6 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-display text-xl">Regras de comissão</h3>
                <Button size="sm" onClick={abrirNovaRegra} className="gap-1.5">
                  <Settings2 className="w-4 h-4" /> Nova regra
                </Button>
              </div>
              {regras.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma regra cadastrada.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Beneficiário</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Evento</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Base</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {regras.map(r => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.beneficiario}</TableCell>
                          <TableCell className="capitalize">{r.tipo_beneficiario}</TableCell>
                          <TableCell>{EVENTO_LABEL[r.tipo_evento]}</TableCell>
                          <TableCell>
                            {r.percentual != null ? `${r.percentual}%` : fmtBRL(Number(r.valor_fixo ?? 0))}
                          </TableCell>
                          <TableCell className="text-xs">{BASE_LABEL[r.base_calculo]}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={r.ativo ? "border-emerald-500/40 text-emerald-700" : ""}>
                              {r.ativo ? "Ativa" : "Inativa"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button size="icon" variant="ghost" onClick={() => abrirEditarRegra(r)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => excluirRegra(r.id)}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent></Card>
          </TabsContent>
        </Tabs>
      )}

      {/* DIALOG REGRA */}
      <Dialog open={regraForm.open} onOpenChange={(o) => !o && setRegraForm(REGRA_VAZIA)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">
              {regraForm.id ? "Editar regra" : "Nova regra de comissão"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tipo de beneficiário *</Label>
                <Select value={regraForm.tipo_beneficiario}
                  onValueChange={(v: TipoBenef) => setRegraForm(f => ({
                    ...f, tipo_beneficiario: v,
                    beneficiario: listarBeneficiarios(v)[0],
                  }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="estagiaria">Estagiária</SelectItem>
                    <SelectItem value="parceiro">Parceiro externo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Beneficiário *</Label>
                <Select value={regraForm.beneficiario}
                  onValueChange={(v) => setRegraForm(f => ({ ...f, beneficiario: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {listarBeneficiarios(regraForm.tipo_beneficiario).map(n =>
                      <SelectItem key={n} value={n}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Evento gerador *</Label>
                <Select value={regraForm.tipo_evento}
                  onValueChange={(v: TipoEvento) => setRegraForm(f => ({ ...f, tipo_evento: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(EVENTO_LABEL) as TipoEvento[]).map(e =>
                      <SelectItem key={e} value={e}>{EVENTO_LABEL[e]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Modo</Label>
                <Select value={regraForm.modo}
                  onValueChange={(v: "percentual" | "fixo") => setRegraForm(f => ({ ...f, modo: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentual">Percentual (%)</SelectItem>
                    <SelectItem value="fixo">Valor fixo (R$)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {regraForm.modo === "percentual" ? (
                <div className="space-y-1.5">
                  <Label>Percentual (%) *</Label>
                  <Input type="number" min="0" step="0.01" value={regraForm.percentual}
                    onChange={(e) => setRegraForm(f => ({ ...f, percentual: e.target.value }))} />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>Valor fixo (R$) *</Label>
                  <Input type="number" min="0" step="0.01" value={regraForm.valor_fixo}
                    onChange={(e) => setRegraForm(f => ({ ...f, valor_fixo: e.target.value }))} />
                </div>
              )}
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Base de cálculo</Label>
                <Select value={regraForm.base_calculo}
                  onValueChange={(v: BaseCalc) => setRegraForm(f => ({ ...f, base_calculo: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(BASE_LABEL) as BaseCalc[]).map(b =>
                      <SelectItem key={b} value={b}>{BASE_LABEL[b]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Status</Label>
                <Select value={regraForm.ativo ? "1" : "0"}
                  onValueChange={(v) => setRegraForm(f => ({ ...f, ativo: v === "1" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Ativa</SelectItem>
                    <SelectItem value="0">Inativa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Observação</Label>
              <Textarea rows={2} value={regraForm.observacao} maxLength={300}
                onChange={(e) => setRegraForm(f => ({ ...f, observacao: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegraForm(REGRA_VAZIA)}>Cancelar</Button>
            <Button onClick={salvarRegra}>{regraForm.id ? "Salvar" : "Criar regra"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG COMISSÃO */}
      <Dialog open={comForm.open} onOpenChange={(o) => !o && setComForm(COM_VAZIA)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">
              {comForm.id ? "Editar comissão" : "Lançar comissão"}
            </DialogTitle>
            <DialogDescription>
              Vincule a um caso já cadastrado e o valor da comissão será calculado automaticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tipo *</Label>
                <Select value={comForm.tipo_beneficiario}
                  onValueChange={(v: TipoBenef) => setComForm(f => ({
                    ...f, tipo_beneficiario: v,
                    beneficiario: listarBeneficiarios(v)[0],
                  }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="estagiaria">Estagiária</SelectItem>
                    <SelectItem value="parceiro">Parceiro externo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Beneficiário *</Label>
                <Select value={comForm.beneficiario}
                  onValueChange={(v) => setComForm(f => ({ ...f, beneficiario: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {listarBeneficiarios(comForm.tipo_beneficiario).map(n =>
                      <SelectItem key={n} value={n}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Buscar caso (CNJ, ação ou cliente)</Label>
              <Input value={buscaProcesso} onChange={(e) => setBuscaProcesso(e.target.value)}
                placeholder="Digite para filtrar..." />
              <Select value={comForm.caso_id} onValueChange={(v) => setComForm(f => ({ ...f, caso_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione um caso (opcional)" /></SelectTrigger>
                <SelectContent>
                  {processosFiltrados.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {(p.numero_cnj || "Sem CNJ")} — {p.cliente_nome ?? p.tipo_acao ?? "—"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Evento gerador *</Label>
                <Select value={comForm.evento_gerador}
                  onValueChange={(v: TipoEvento) => setComForm(f => ({ ...f, evento_gerador: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(EVENTO_LABEL) as TipoEvento[]).map(e =>
                      <SelectItem key={e} value={e}>{EVENTO_LABEL[e]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Data de competência *</Label>
                <Input type="date" value={comForm.data_competencia}
                  onChange={(e) => setComForm(f => ({ ...f, data_competencia: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Valor de honorários (R$) *</Label>
                <Input type="number" min="0" step="0.01" value={comForm.valor_honorarios}
                  onChange={(e) => {
                    const v = e.target.value;
                    setComForm(f => ({
                      ...f, valor_honorarios: v,
                      valor_comissao: recalcularValor(v, f.percentual_aplicado) || f.valor_comissao,
                    }));
                  }} />
              </div>
              <div className="space-y-1.5">
                <Label>Percentual aplicado (%)</Label>
                <Input type="number" min="0" step="0.01" value={comForm.percentual_aplicado}
                  onChange={(e) => {
                    const v = e.target.value;
                    setComForm(f => ({
                      ...f, percentual_aplicado: v,
                      valor_comissao: recalcularValor(f.valor_honorarios, v) || f.valor_comissao,
                    }));
                  }} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Valor da comissão (R$) *</Label>
                <Input type="number" min="0" step="0.01" value={comForm.valor_comissao}
                  onChange={(e) => setComForm(f => ({ ...f, valor_comissao: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={comForm.status}
                  onValueChange={(v: StatusCom) => setComForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="a_pagar">A pagar</SelectItem>
                    <SelectItem value="pago">Pago</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {comForm.status === "pago" && (
                <>
                  <div className="space-y-1.5">
                    <Label>Data de pagamento</Label>
                    <Input type="date" value={comForm.data_pagamento}
                      onChange={(e) => setComForm(f => ({ ...f, data_pagamento: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Forma de pagamento</Label>
                    <Select value={comForm.forma_pagamento || ""}
                      onValueChange={(v) => setComForm(f => ({ ...f, forma_pagamento: v }))}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PIX">PIX</SelectItem>
                        <SelectItem value="Transferência">Transferência</SelectItem>
                        <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                        <SelectItem value="Outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Observação</Label>
              <Textarea rows={2} value={comForm.observacao} maxLength={500}
                onChange={(e) => setComForm(f => ({ ...f, observacao: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComForm(COM_VAZIA)}>Cancelar</Button>
            <Button onClick={salvarComissao}>{comForm.id ? "Salvar" : "Lançar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG MARCAR PAGA */}
      <Dialog open={pagar.open} onOpenChange={(o) => !o && setPagar(p => ({ ...p, open: false }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Registrar pagamento</DialogTitle>
            <DialogDescription>
              {pagar.com?.beneficiario} — {pagar.com && fmtBRL(Number(pagar.com.valor_comissao))}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Data do pagamento</Label>
              <Input type="date" value={pagar.data}
                onChange={(e) => setPagar(p => ({ ...p, data: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Forma de pagamento</Label>
              <Select value={pagar.forma} onValueChange={(v) => setPagar(p => ({ ...p, forma: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PIX">PIX</SelectItem>
                  <SelectItem value="Transferência">Transferência</SelectItem>
                  <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="Outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPagar(p => ({ ...p, open: false }))}>Cancelar</Button>
            <Button onClick={marcarPaga} className="gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> Confirmar pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TabelaComissoes({
  items, processoLabel, onPagar, onEditar, onExcluir,
}: {
  items: Comissao[];
  processoLabel: (id: string | null) => string;
  onPagar: (c: Comissao) => void;
  onEditar: (c: Comissao) => void;
  onExcluir: (id: string) => void;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma comissão no período.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader><TableRow>
          <TableHead>Competência</TableHead>
          <TableHead>Beneficiário</TableHead>
          <TableHead>Caso</TableHead>
          <TableHead>Evento</TableHead>
          <TableHead className="text-right">Honorários</TableHead>
          <TableHead className="text-right">%</TableHead>
          <TableHead className="text-right">Comissão</TableHead>
          <TableHead>Status</TableHead>
          <TableHead></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {items.map(c => (
            <TableRow key={c.id}>
              <TableCell className="text-xs whitespace-nowrap">{fmtData(c.data_competencia)}</TableCell>
              <TableCell className="font-medium">{c.beneficiario}</TableCell>
              <TableCell className="text-xs max-w-[200px] truncate">{processoLabel(c.caso_id)}</TableCell>
              <TableCell className="text-xs">{EVENTO_LABEL[c.evento_gerador]}</TableCell>
              <TableCell className="text-right text-xs">{fmtBRL(Number(c.valor_honorarios))}</TableCell>
              <TableCell className="text-right text-xs">{c.percentual_aplicado != null ? `${c.percentual_aplicado}%` : "—"}</TableCell>
              <TableCell className="text-right font-semibold">{fmtBRL(Number(c.valor_comissao))}</TableCell>
              <TableCell>
                <Badge variant="outline" className={cn("border", badgeStatus(c.status))}>
                  {STATUS_LABEL[c.status]}
                </Badge>
              </TableCell>
              <TableCell className="text-right whitespace-nowrap">
                {c.status === "a_pagar" && (
                  <Button size="icon" variant="ghost" onClick={() => onPagar(c)} title="Marcar como pago">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  </Button>
                )}
                <Button size="icon" variant="ghost" onClick={() => onEditar(c)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => onExcluir(c.id)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
