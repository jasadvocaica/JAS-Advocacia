import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Calculator, Lock, Unlock, Loader2, Save, RefreshCw, TrendingUp,
  TrendingDown, Receipt, Megaphone, UserCircle2, ChevronLeft, ChevronRight,
  AlertCircle, CheckCircle2, FileDown, ListChecks,
} from "lucide-react";
import { gerarPdfFechamento } from "./fechamento-pdf";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format";
import {
  calcularSimplesNacional, calcularMarketing, calcularResultadoLiquido,
  nomeMes, ANEXO_IV,
} from "@/lib/simples-nacional";
import { toast } from "sonner";

interface Fechamento {
  id?: string;
  mes: number;
  ano: number;
  receita_honorarios_fixo: number;
  receita_honorarios_exito: number;
  receita_consultoria: number;
  receita_outros: number;
  receita_total?: number;
  repasses_parceiros: number;
  rbt12: number;
  faixa_simples: number | null;
  aliquota_nominal: number | null;
  aliquota_efetiva: number | null;
  valor_simples: number;
  detalhamento_tributos: Record<string, number>;
  percentual_marketing: number;
  valor_marketing: number;
  valor_pro_labore: number;
  outras_despesas: number;
  resultado_liquido?: number;
  status: "aberto" | "fechado" | "revisao";
  observacoes: string | null;
  fechado_em?: string | null;
}

function vazio(mes: number, ano: number, pctMkt = 5): Fechamento {
  return {
    mes, ano,
    receita_honorarios_fixo: 0, receita_honorarios_exito: 0,
    receita_consultoria: 0, receita_outros: 0,
    repasses_parceiros: 0, rbt12: 0,
    faixa_simples: null, aliquota_nominal: null, aliquota_efetiva: null,
    valor_simples: 0, detalhamento_tributos: {},
    percentual_marketing: pctMkt, valor_marketing: 0, valor_pro_labore: 0,
    outras_despesas: 0, status: "aberto", observacoes: null,
  };
}

export default function FechamentoMensal() {
  const { isGestor } = useAuth();
  const hoje = new Date();
  const [mes, setMes] = useState<number>(hoje.getMonth() + 1);
  const [ano, setAno] = useState<number>(hoje.getFullYear());
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [fech, setFech] = useState<Fechamento>(vazio(mes, ano));
  const [pctMktPadrao, setPctMktPadrao] = useState<number>(5);

  // Resumo por competência (entradas, saídas, repasses do mês)
  const [resumo, setResumo] = useState<{
    entradas: Array<{ id: string; data: string; cliente: string | null; tipo: string | null; forma: string | null; valor: number }>;
    saidas: Array<{ id: string; data: string; descricao: string; categoria: string | null; fornecedor: string | null; valor: number }>;
    repasses: Array<{ id: string; data: string; parceiro: string | null; cliente: string | null; valor: number }>;
  }>({ entradas: [], saidas: [], repasses: [] });
  const [loadingResumo, setLoadingResumo] = useState(false);

  const fechado = fech.status === "fechado";

  // Carrega config + fechamento + sugestões
  useEffect(() => {
    if (!isGestor) { setLoading(false); return; }
    let alive = true;
    (async () => {
      setLoading(true);

      const cfgRes = await supabase
        .from("financeiro_config_tributaria")
        .select("percentual_marketing_padrao, rbt12_manual")
        .order("atualizado_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      const pctPadrao = Number(cfgRes.data?.percentual_marketing_padrao ?? 5);
      if (alive) setPctMktPadrao(pctPadrao);

      const { data } = await supabase
        .from("financeiro_fechamento")
        .select("*")
        .eq("mes", mes).eq("ano", ano)
        .maybeSingle();

      if (data) {
        if (alive) setFech({
          ...vazio(mes, ano, pctPadrao),
          ...data,
          detalhamento_tributos: (data.detalhamento_tributos as any) ?? {},
        } as Fechamento);
      } else {
        // Sugere a partir de pagamentos do mês + repasses + RBT12 calculado
        const inicio = new Date(ano, mes - 1, 1).toISOString().slice(0, 10);
        const fim = new Date(ano, mes, 0).toISOString().slice(0, 10);
        const [pagsRes, repRes, rbt12Res, mktRes, plRes] = await Promise.all([
          supabase.from("honorarios_pagamentos")
            .select("valor_recebido, tipo_pagamento")
            .gte("data_pagamento", inicio).lte("data_pagamento", fim),
          supabase.from("honorarios_repasses")
            .select("valor_repasse")
            .gte("criado_em", inicio).lte("criado_em", fim + "T23:59:59"),
          supabase.rpc("calcular_rbt12", { _mes: mes, _ano: ano }),
          supabase.from("financeiro_marketing_lancamentos")
            .select("valor").eq("mes", mes).eq("ano", ano),
          supabase.from("financeiro_pro_labore")
            .select("valor").eq("mes", mes).eq("ano", ano),
        ]);

        const pags = (pagsRes.data ?? []) as any[];
        const recExito = pags.filter(p => p.tipo_pagamento === "exito")
          .reduce((s, p) => s + Number(p.valor_recebido || 0), 0);
        const recOutros = pags.filter(p => p.tipo_pagamento !== "exito")
          .reduce((s, p) => s + Number(p.valor_recebido || 0), 0);
        const repTotal = (repRes.data ?? []).reduce((s: number, r: any) => s + Number(r.valor_repasse || 0), 0);
        const mktTotal = (mktRes.data ?? []).reduce((s: number, m: any) => s + Number(m.valor || 0), 0);
        const plTotal = (plRes.data ?? []).reduce((s: number, p: any) => s + Number(p.valor || 0), 0);
        const rbt12 = Number((rbt12Res.data as any) ?? cfgRes.data?.rbt12_manual ?? 0);

        if (alive) setFech({
          ...vazio(mes, ano, pctPadrao),
          receita_honorarios_fixo: recOutros,
          receita_honorarios_exito: recExito,
          repasses_parceiros: repTotal,
          rbt12,
          valor_marketing: mktTotal,
          valor_pro_labore: plTotal,
        });
      }

      setLoading(false);
    })();
    return () => { alive = false; };
  }, [mes, ano, isGestor]);

  // Carrega resumo por competência
  useEffect(() => {
    if (!isGestor) return;
    let alive = true;
    (async () => {
      setLoadingResumo(true);
      const inicio = new Date(ano, mes - 1, 1).toISOString().slice(0, 10);
      const fim = new Date(ano, mes, 0).toISOString().slice(0, 10);

      const [entRes, saiRes, repRes] = await Promise.all([
        supabase.from("honorarios_pagamentos")
          .select("id, data_pagamento, valor_recebido, tipo_pagamento, forma_pagamento, cliente:cliente_id(nome)")
          .gte("data_pagamento", inicio).lte("data_pagamento", fim)
          .order("data_pagamento", { ascending: true }),
        supabase.from("financeiro_saidas")
          .select("id, descricao, categoria, fornecedor, valor, data_competencia, data_pagamento")
          .gte("data_competencia", inicio).lte("data_competencia", fim)
          .order("data_competencia", { ascending: true }),
        supabase.from("honorarios_repasses")
          .select("id, valor_repasse, data_repasse, criado_em, parceiro:parceiro_id(nome), cliente:cliente_id(nome)")
          .or(`and(data_repasse.gte.${inicio},data_repasse.lte.${fim}),and(data_repasse.is.null,criado_em.gte.${inicio},criado_em.lte.${fim}T23:59:59)`)
          .order("criado_em", { ascending: true }),
      ]);

      if (!alive) return;
      setResumo({
        entradas: (entRes.data ?? []).map((e: any) => ({
          id: e.id, data: e.data_pagamento, cliente: e.cliente?.nome ?? null,
          tipo: e.tipo_pagamento, forma: e.forma_pagamento, valor: Number(e.valor_recebido || 0),
        })),
        saidas: (saiRes.data ?? []).map((s: any) => ({
          id: s.id, data: s.data_competencia ?? s.data_pagamento, descricao: s.descricao,
          categoria: s.categoria, fornecedor: s.fornecedor, valor: Number(s.valor || 0),
        })),
        repasses: (repRes.data ?? []).map((r: any) => ({
          id: r.id, data: r.data_repasse ?? (r.criado_em ?? "").slice(0, 10),
          parceiro: r.parceiro?.nome ?? null, cliente: r.cliente?.nome ?? null,
          valor: Number(r.valor_repasse || 0),
        })),
      });
      setLoadingResumo(false);
    })();
    return () => { alive = false; };
  }, [mes, ano, isGestor]);

  // Recalcula tudo quando inputs mudam
  const calc = useMemo(() => {
    const receitaTotal =
      Number(fech.receita_honorarios_fixo || 0) +
      Number(fech.receita_honorarios_exito || 0) +
      Number(fech.receita_consultoria || 0) +
      Number(fech.receita_outros || 0);

    const simples = calcularSimplesNacional(receitaTotal, Number(fech.rbt12 || 0));
    const marketing = calcularMarketing(receitaTotal, Number(fech.percentual_marketing || 0));
    const usaMktManual = Number(fech.valor_marketing || 0) > 0;
    const valorMkt = usaMktManual ? Number(fech.valor_marketing) : marketing;

    const liquido = calcularResultadoLiquido({
      receitaTotal,
      repassesParceiros: Number(fech.repasses_parceiros || 0),
      valorSimples: simples.valorSimples,
      valorMarketing: valorMkt,
      valorProLabore: Number(fech.valor_pro_labore || 0),
      outrasDespesas: Number(fech.outras_despesas || 0),
    });

    const margem = receitaTotal > 0 ? (liquido / receitaTotal) * 100 : 0;

    return { receitaTotal, simples, valorMkt, liquido, margem };
  }, [fech]);

  function alterar<K extends keyof Fechamento>(k: K, v: Fechamento[K]) {
    if (fechado) return;
    setFech(prev => ({ ...prev, [k]: v }));
  }

  function alterarNum(k: keyof Fechamento, raw: string) {
    const n = Number(raw.replace(",", ".")) || 0;
    alterar(k as any, n as any);
  }

  async function salvar(novoStatus?: "aberto" | "fechado") {
    if (!isGestor) return;
    setSalvando(true);
    try {
      const payload: any = {
        mes, ano,
        receita_honorarios_fixo: fech.receita_honorarios_fixo,
        receita_honorarios_exito: fech.receita_honorarios_exito,
        receita_consultoria: fech.receita_consultoria,
        receita_outros: fech.receita_outros,
        repasses_parceiros: fech.repasses_parceiros,
        rbt12: fech.rbt12,
        faixa_simples: calc.simples.faixa,
        aliquota_nominal: calc.simples.aliquotaNominal / 100,
        aliquota_efetiva: calc.simples.aliquotaEfetiva / 100,
        valor_simples: calc.simples.valorSimples,
        detalhamento_tributos: calc.simples.detalhamento,
        percentual_marketing: fech.percentual_marketing,
        valor_marketing: calc.valorMkt,
        valor_pro_labore: fech.valor_pro_labore,
        outras_despesas: fech.outras_despesas,
        observacoes: fech.observacoes,
        status: novoStatus ?? fech.status,
        fechado_em: novoStatus === "fechado" ? new Date().toISOString() : (novoStatus === "aberto" ? null : fech.fechado_em),
      };

      const { data, error } = await supabase
        .from("financeiro_fechamento")
        .upsert(payload, { onConflict: "mes,ano" })
        .select()
        .single();

      if (error) throw error;

      setFech(prev => ({
        ...prev,
        ...(data as any),
        detalhamento_tributos: ((data as any)?.detalhamento_tributos as any) ?? {},
        status: ((data as any)?.status as Fechamento["status"]) ?? prev.status,
      }));
      toast.success(novoStatus === "fechado" ? "Mês fechado" : novoStatus === "aberto" ? "Mês reaberto" : "Salvo");
    } catch (e: any) {
      toast.error("Erro ao salvar: " + (e.message || "desconhecido"));
    } finally {
      setSalvando(false);
    }
  }

  function navegar(delta: number) {
    let m = mes + delta;
    let a = ano;
    if (m > 12) { m = 1; a++; }
    if (m < 1) { m = 12; a--; }
    setMes(m); setAno(a);
  }

  async function exportarPdf() {
    try {
      let escritorio = "Relatório Financeiro";
      const { data: cfg } = await supabase
        .from("configuracoes_sistema")
        .select("valor")
        .eq("chave", "escritorio_nome")
        .maybeSingle();
      if (cfg?.valor) escritorio = cfg.valor;

      const doc = gerarPdfFechamento({
        mes, ano,
        status: fech.status,
        fechado_em: fech.fechado_em,
        escritorio_nome: escritorio,
        receitas: {
          fixo: Number(fech.receita_honorarios_fixo || 0),
          exito: Number(fech.receita_honorarios_exito || 0),
          consultoria: Number(fech.receita_consultoria || 0),
          outros: Number(fech.receita_outros || 0),
          total: calc.receitaTotal,
        },
        simples: {
          rbt12: Number(fech.rbt12 || 0),
          faixa: calc.simples.faixa,
          aliquotaNominal: calc.simples.aliquotaNominal,
          aliquotaEfetiva: calc.simples.aliquotaEfetiva,
          valorSimples: calc.simples.valorSimples,
          detalhamento: calc.simples.detalhamento,
        },
        marketing: {
          percentual: Number(fech.percentual_marketing || 0),
          valor: calc.valorMkt,
        },
        proLabore: Number(fech.valor_pro_labore || 0),
        repassesParceiros: Number(fech.repasses_parceiros || 0),
        outrasDespesas: Number(fech.outras_despesas || 0),
        resultadoLiquido: calc.liquido,
        margem: calc.margem,
        observacoes: fech.observacoes,
      });
      doc.save(`fechamento-${ano}-${String(mes).padStart(2, "0")}.pdf`);
      toast.success("PDF gerado");
    } catch (e: any) {
      toast.error("Erro ao gerar PDF: " + (e.message || "desconhecido"));
    }
  }

  if (!isGestor) {
    return (
      <div className="space-y-6">
        <PageHeader title="Fechamento Mensal" description="Acesso restrito" />
        <Card className="p-12 text-center">
          <Lock className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            Apenas gestor pode visualizar o fechamento mensal e a DRE.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/financeiro">Voltar ao Financeiro</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fechamento Mensal"
        description="DRE simplificada · Simples Nacional Anexo IV · Marketing · Pró-labore · Resultado líquido"
      >
        <Button variant="outline" size="sm" asChild>
          <Link to="/financeiro">← Voltar</Link>
        </Button>
        <Button variant="outline" size="sm" onClick={exportarPdf} disabled={loading}>
          <FileDown className="w-4 h-4" /> Exportar PDF
        </Button>
        {fechado ? (
          <Button variant="outline" onClick={() => salvar("aberto")} disabled={salvando}>
            <Unlock className="w-4 h-4" /> Reabrir mês
          </Button>
        ) : (
          <>
            <Button variant="outline" onClick={() => salvar()} disabled={salvando}>
              {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
            </Button>
            <Button variant="gold" onClick={() => salvar("fechado")} disabled={salvando}>
              <Lock className="w-4 h-4" /> Fechar mês
            </Button>
          </>
        )}
      </PageHeader>

      {/* Navegador de período */}
      <Card className="p-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navegar(-1)}><ChevronLeft className="w-4 h-4" /></Button>
          <div className="font-display text-xl px-2 min-w-[200px] text-center">
            {nomeMes(mes)} / {ano}
          </div>
          <Button variant="ghost" size="icon" onClick={() => navegar(1)}><ChevronRight className="w-4 h-4" /></Button>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }).map((_, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{nomeMes(i + 1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 6 }).map((_, i) => {
                const a = hoje.getFullYear() - 3 + i;
                return <SelectItem key={a} value={String(a)}>{a}</SelectItem>;
              })}
            </SelectContent>
          </Select>
          {fechado ? (
            <Badge className="bg-success/15 text-success border-success/30 gap-1">
              <CheckCircle2 className="w-3 h-3" /> Fechado
            </Badge>
          ) : (
            <Badge variant="outline">Aberto</Badge>
          )}
        </div>
      </Card>

      {loading ? (
        <Card className="p-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </Card>
      ) : (
        <>
          {/* KPIs do mês */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              icon={<TrendingUp className="w-3.5 h-3.5 text-success" />}
              label="Receita total"
              value={formatBRL(calc.receitaTotal)}
            />
            <KpiCard
              icon={<Receipt className="w-3.5 h-3.5 text-warning" />}
              label={`Simples (faixa ${calc.simples.faixa})`}
              value={formatBRL(calc.simples.valorSimples)}
              sub={`${calc.simples.aliquotaEfetiva.toFixed(2)}% efetiva`}
            />
            <KpiCard
              icon={<TrendingDown className="w-3.5 h-3.5 text-destructive" />}
              label="Repasses parceiros"
              value={formatBRL(Number(fech.repasses_parceiros || 0))}
            />
            <KpiCard
              icon={<TrendingUp className="w-3.5 h-3.5 text-gold" />}
              label="Resultado líquido"
              value={formatBRL(calc.liquido)}
              sub={`${calc.margem.toFixed(1)}% margem`}
            />
          </div>

          <Tabs defaultValue="dre" className="w-full">
            <TabsList>
              <TabsTrigger value="dre"><Calculator className="w-3.5 h-3.5 mr-1" /> DRE</TabsTrigger>
              <TabsTrigger value="competencia"><ListChecks className="w-3.5 h-3.5 mr-1" /> Competência</TabsTrigger>
              <TabsTrigger value="simples"><Receipt className="w-3.5 h-3.5 mr-1" /> Simples Nacional</TabsTrigger>
              <TabsTrigger value="marketing"><Megaphone className="w-3.5 h-3.5 mr-1" /> Marketing</TabsTrigger>
              <TabsTrigger value="prolabore"><UserCircle2 className="w-3.5 h-3.5 mr-1" /> Pró-labore</TabsTrigger>
            </TabsList>

            {/* ============== DRE ============== */}
            <TabsContent value="dre" className="space-y-4">
              <Card className="p-6">
                <h3 className="font-display text-lg mb-4">Receitas</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  <CampoNum label="Honorários fixos / mensalidades" value={fech.receita_honorarios_fixo} disabled={fechado} onChange={(v) => alterarNum("receita_honorarios_fixo", v)} />
                  <CampoNum label="Honorários de êxito" value={fech.receita_honorarios_exito} disabled={fechado} onChange={(v) => alterarNum("receita_honorarios_exito", v)} />
                  <CampoNum label="Consultoria" value={fech.receita_consultoria} disabled={fechado} onChange={(v) => alterarNum("receita_consultoria", v)} />
                  <CampoNum label="Outras receitas" value={fech.receita_outros} disabled={fechado} onChange={(v) => alterarNum("receita_outros", v)} />
                </div>
                <Separator className="my-4" />
                <Linha label="(=) Receita total" value={calc.receitaTotal} bold />
              </Card>

              <Card className="p-6">
                <h3 className="font-display text-lg mb-4">Deduções e despesas</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  <CampoNum label="Repasses a parceiros" value={fech.repasses_parceiros} disabled={fechado} onChange={(v) => alterarNum("repasses_parceiros", v)} />
                  <CampoNum label="Outras despesas operacionais" value={fech.outras_despesas} disabled={fechado} onChange={(v) => alterarNum("outras_despesas", v)} />
                </div>
                <Separator className="my-4" />
                <div className="space-y-1.5">
                  <Linha label="(−) Repasses a parceiros" value={-Number(fech.repasses_parceiros || 0)} />
                  <Linha label={`(−) Simples Nacional (${calc.simples.aliquotaEfetiva.toFixed(2)}%)`} value={-calc.simples.valorSimples} />
                  <Linha label={`(−) Marketing (${fech.percentual_marketing}%)`} value={-calc.valorMkt} />
                  <Linha label="(−) Pró-labore" value={-Number(fech.valor_pro_labore || 0)} />
                  <Linha label="(−) Outras despesas" value={-Number(fech.outras_despesas || 0)} />
                  <Separator className="my-2" />
                  <Linha
                    label="(=) Resultado líquido"
                    value={calc.liquido}
                    bold
                    color={calc.liquido >= 0 ? "text-success" : "text-destructive"}
                  />
                </div>
              </Card>

              <Card className="p-6">
                <Label htmlFor="obs">Observações do mês</Label>
                <Textarea
                  id="obs"
                  className="mt-2"
                  rows={3}
                  disabled={fechado}
                  value={fech.observacoes ?? ""}
                  onChange={(e) => alterar("observacoes", e.target.value)}
                />
              </Card>
            </TabsContent>

            {/* ============== COMPETÊNCIA ============== */}
            <TabsContent value="competencia" className="space-y-4">
              <ResumoCompetencia
                loading={loadingResumo}
                entradas={resumo.entradas}
                saidas={resumo.saidas}
                repasses={resumo.repasses}
              />
            </TabsContent>

            {/* ============== SIMPLES ============== */}
            <TabsContent value="simples" className="space-y-4">
              <Card className="p-6">
                <h3 className="font-display text-lg mb-4">Apuração — Anexo IV</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  <CampoNum
                    label="RBT12 (receita bruta últimos 12 meses)"
                    value={fech.rbt12}
                    disabled={fechado}
                    onChange={(v) => alterarNum("rbt12", v)}
                    hint="Calculado automaticamente a partir dos meses anteriores fechados; pode ajustar."
                  />
                  <div>
                    <Label>Receita do mês</Label>
                    <div className="h-10 px-3 mt-2 flex items-center bg-muted/50 rounded-md font-mono">
                      {formatBRL(calc.receitaTotal)}
                    </div>
                  </div>
                </div>
                <Separator className="my-4" />
                <div className="grid sm:grid-cols-3 gap-3">
                  <Mini label="Faixa" value={`${calc.simples.faixa} de 6`} />
                  <Mini label="Alíquota nominal" value={`${calc.simples.aliquotaNominal.toFixed(2)}%`} />
                  <Mini label="Alíquota efetiva" value={`${calc.simples.aliquotaEfetiva.toFixed(2)}%`} highlight />
                </div>
                <Separator className="my-4" />
                <Linha label="Simples a recolher (DAS)" value={calc.simples.valorSimples} bold />

                <h4 className="font-medium mt-6 mb-2 text-sm">Distribuição por tributo</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {Object.entries(calc.simples.detalhamento).map(([trib, val]) => (
                    <div key={trib} className="flex justify-between p-2 bg-muted/40 rounded text-sm">
                      <span className="text-muted-foreground">{trib}</span>
                      <span className="font-mono">{formatBRL(val)}</span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-6">
                <h4 className="font-medium mb-3 text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-warning" /> Tabela vigente (Anexo IV)
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
                        <th className="py-2">Faixa</th>
                        <th>RBT12 até</th>
                        <th>Alíquota</th>
                        <th>Dedução</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ANEXO_IV.map((f) => (
                        <tr key={f.faixa} className={`border-b ${f.faixa === calc.simples.faixa ? "bg-gold/10 font-medium" : ""}`}>
                          <td className="py-2">{f.faixa}ª</td>
                          <td>{formatBRL(f.faixaMax)}</td>
                          <td>{(f.aliquota * 100).toFixed(2)}%</td>
                          <td className="font-mono">{formatBRL(f.deducao)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </TabsContent>

            {/* ============== MARKETING ============== */}
            <TabsContent value="marketing" className="space-y-4">
              <Card className="p-6">
                <h3 className="font-display text-lg mb-4">Verba de marketing</h3>
                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <Label>% sobre faturamento</Label>
                    <Input
                      type="number" step="0.5" min="0" max="100"
                      className="mt-2"
                      disabled={fechado}
                      value={fech.percentual_marketing}
                      onChange={(e) => alterarNum("percentual_marketing", e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Padrão configurado: {pctMktPadrao}%
                    </p>
                  </div>
                  <div>
                    <Label>Calculado (% × receita)</Label>
                    <div className="h-10 px-3 mt-2 flex items-center bg-muted/50 rounded-md font-mono">
                      {formatBRL(calcularMarketing(calc.receitaTotal, Number(fech.percentual_marketing || 0)))}
                    </div>
                  </div>
                  <div>
                    <Label>Gasto efetivo (lançamentos)</Label>
                    <Input
                      type="number" step="0.01" min="0"
                      className="mt-2"
                      disabled={fechado}
                      value={fech.valor_marketing}
                      onChange={(e) => alterarNum("valor_marketing", e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Se {">"} 0, prevalece sobre o cálculo automático.
                    </p>
                  </div>
                </div>
                <Separator className="my-4" />
                <Linha label="Considerado no fechamento" value={calc.valorMkt} bold />
                <p className="text-xs text-muted-foreground mt-3">
                  Lançamentos detalhados de marketing (campanhas, ferramentas, ads) podem ser registrados em uma próxima etapa, listados a partir da tabela <code>financeiro_marketing_lancamentos</code>.
                </p>
              </Card>
            </TabsContent>

            {/* ============== PRÓ-LABORE ============== */}
            <TabsContent value="prolabore" className="space-y-4">
              <Card className="p-6">
                <h3 className="font-display text-lg mb-4">Pró-labore do mês</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  <CampoNum
                    label="Valor pago aos sócios neste mês"
                    value={fech.valor_pro_labore}
                    disabled={fechado}
                    onChange={(v) => alterarNum("valor_pro_labore", v)}
                  />
                  <div>
                    <Label>% sobre receita</Label>
                    <div className="h-10 px-3 mt-2 flex items-center bg-muted/50 rounded-md font-mono">
                      {calc.receitaTotal > 0
                        ? `${((Number(fech.valor_pro_labore || 0) / calc.receitaTotal) * 100).toFixed(1)}%`
                        : "—"}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Para histórico individual por sócio, registre na tabela <code>financeiro_pro_labore</code>.
                </p>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

// ============== Subcomponents ==============

function KpiCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <p className="font-display text-2xl mt-1">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </Card>
  );
}

function CampoNum({
  label, value, onChange, disabled, hint,
}: { label: string; value: number; onChange: (v: string) => void; disabled?: boolean; hint?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        type="number" step="0.01" min="0"
        className="mt-2"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

function Linha({ label, value, bold, color }: { label: string; value: number; bold?: boolean; color?: string }) {
  return (
    <div className={`flex justify-between items-center py-1 ${bold ? "text-base" : "text-sm"}`}>
      <span className={bold ? "font-medium" : "text-muted-foreground"}>{label}</span>
      <span className={`font-mono ${bold ? "font-semibold" : ""} ${color ?? ""}`}>{formatBRL(value)}</span>
    </div>
  );
}

function Mini({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`p-3 rounded-md border ${highlight ? "bg-gold/10 border-gold/30" : "bg-muted/40 border-transparent"}`}>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`font-display text-lg mt-0.5 ${highlight ? "text-gold-dark" : ""}`}>{value}</p>
    </div>
  );
}

// ============== ResumoCompetencia ==============

interface LinhaEntrada { id: string; data: string; cliente: string | null; tipo: string | null; forma: string | null; valor: number }
interface LinhaSaida { id: string; data: string; descricao: string; categoria: string | null; fornecedor: string | null; valor: number }
interface LinhaRepasse { id: string; data: string; parceiro: string | null; cliente: string | null; valor: number }

function fmtData(d: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function ResumoCompetencia({
  loading, entradas, saidas, repasses,
}: { loading: boolean; entradas: LinhaEntrada[]; saidas: LinhaSaida[]; repasses: LinhaRepasse[] }) {
  const totalEnt = entradas.reduce((s, e) => s + e.valor, 0);
  const totalSai = saidas.reduce((s, e) => s + e.valor, 0);
  const totalRep = repasses.reduce((s, e) => s + e.valor, 0);
  const saldo = totalEnt - totalSai - totalRep;

  // Agrupamentos
  const porTipoEntrada = entradas.reduce<Record<string, number>>((acc, e) => {
    const k = e.tipo ?? "outros";
    acc[k] = (acc[k] ?? 0) + e.valor; return acc;
  }, {});
  const porCategoriaSaida = saidas.reduce<Record<string, number>>((acc, s) => {
    const k = s.categoria ?? "outros";
    acc[k] = (acc[k] ?? 0) + s.valor; return acc;
  }, {});
  const porParceiro = repasses.reduce<Record<string, number>>((acc, r) => {
    const k = r.parceiro ?? "—";
    acc[k] = (acc[k] ?? 0) + r.valor; return acc;
  }, {});

  if (loading) {
    return (
      <Card className="p-12 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={<TrendingUp className="w-3.5 h-3.5 text-success" />} label="Entradas" value={formatBRL(totalEnt)} sub={`${entradas.length} pagamento(s)`} />
        <KpiCard icon={<TrendingDown className="w-3.5 h-3.5 text-destructive" />} label="Saídas" value={formatBRL(totalSai)} sub={`${saidas.length} lançamento(s)`} />
        <KpiCard icon={<TrendingDown className="w-3.5 h-3.5 text-warning" />} label="Repasses parceiros" value={formatBRL(totalRep)} sub={`${repasses.length} repasse(s)`} />
        <KpiCard icon={<TrendingUp className={`w-3.5 h-3.5 ${saldo >= 0 ? "text-success" : "text-destructive"}`} />} label="Saldo (entradas − saídas − repasses)" value={formatBRL(saldo)} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-4">
          <h4 className="font-display text-sm mb-2">Entradas por tipo</h4>
          {Object.keys(porTipoEntrada).length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma entrada.</p>
          ) : Object.entries(porTipoEntrada).map(([k, v]) => (
            <div key={k} className="flex justify-between text-sm py-1">
              <span className="text-muted-foreground capitalize">{k}</span>
              <span className="font-mono">{formatBRL(v)}</span>
            </div>
          ))}
        </Card>
        <Card className="p-4">
          <h4 className="font-display text-sm mb-2">Saídas por categoria</h4>
          {Object.keys(porCategoriaSaida).length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma saída.</p>
          ) : Object.entries(porCategoriaSaida).map(([k, v]) => (
            <div key={k} className="flex justify-between text-sm py-1">
              <span className="text-muted-foreground capitalize">{k}</span>
              <span className="font-mono">{formatBRL(v)}</span>
            </div>
          ))}
        </Card>
        <Card className="p-4">
          <h4 className="font-display text-sm mb-2">Repasses por parceiro</h4>
          {Object.keys(porParceiro).length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum repasse.</p>
          ) : Object.entries(porParceiro).map(([k, v]) => (
            <div key={k} className="flex justify-between text-sm py-1">
              <span className="text-muted-foreground">{k}</span>
              <span className="font-mono">{formatBRL(v)}</span>
            </div>
          ))}
        </Card>
      </div>

      <ListaDetalhe
        titulo="Entradas (pagamentos recebidos)"
        colunas={["Data", "Cliente", "Tipo", "Forma", "Valor"]}
        linhas={entradas.map(e => [fmtData(e.data), e.cliente ?? "—", e.tipo ?? "—", e.forma ?? "—", formatBRL(e.valor)])}
        total={totalEnt}
      />
      <ListaDetalhe
        titulo="Saídas (suprimentos / despesas)"
        colunas={["Data", "Descrição", "Categoria", "Fornecedor", "Valor"]}
        linhas={saidas.map(s => [fmtData(s.data), s.descricao, s.categoria ?? "—", s.fornecedor ?? "—", formatBRL(s.valor)])}
        total={totalSai}
      />
      <ListaDetalhe
        titulo="Repasses a parceiros"
        colunas={["Data", "Parceiro", "Cliente", "Valor"]}
        linhas={repasses.map(r => [fmtData(r.data), r.parceiro ?? "—", r.cliente ?? "—", formatBRL(r.valor)])}
        total={totalRep}
      />
    </div>
  );
}

function ListaDetalhe({
  titulo, colunas, linhas, total,
}: { titulo: string; colunas: string[]; linhas: (string | number)[][]; total: number }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-display text-sm">{titulo}</h4>
        <span className="text-xs text-muted-foreground">Total: <span className="font-mono">{formatBRL(total)}</span></span>
      </div>
      {linhas.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum lançamento no mês.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b">
                {colunas.map((c, i) => (
                  <th key={i} className={`py-2 ${i === colunas.length - 1 ? "text-right" : ""}`}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={i} className="border-b last:border-0">
                  {l.map((v, j) => (
                    <td key={j} className={`py-2 ${j === l.length - 1 ? "text-right font-mono" : ""}`}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
