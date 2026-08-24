import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Calculator, FileDown, Loader2, Save, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  CategoriaTabelaOAB, COMPLEXIDADE, fmtMoeda, ItemTabelaOAB, TabelaOAB, TipoHonorario,
} from "./types";

export default function CalculadoraHonorarios() {
  const { isGestor } = useAuth();
  const [tabelas, setTabelas] = useState<TabelaOAB[]>([]);
  const [estado, setEstado] = useState<string>("");
  const [ano, setAno] = useState<string>("");
  const [categoria, setCategoria] = useState<string>("");
  const [itemDescricao, setItemDescricao] = useState<string>("");

  const [tipo, setTipo] = useState<TipoHonorario>("misto");
  const [valorFixo, setValorFixo] = useState("");
  const [parcelamento, setParcelamento] = useState(1);
  const [proveitoEconomico, setProveitoEconomico] = useState("");
  const [percentualExito, setPercentualExito] = useState(20);
  const [complexidade, setComplexidade] = useState(0);
  const [fatorExtra, setFatorExtra] = useState(0);
  const [desconto, setDesconto] = useState(0);
  const [observacaoAjuste, setObservacaoAjuste] = useState("");

  const [titulo, setTitulo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [gerando, setGerando] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("ferramentas_oab_tabelas")
        .select("*")
        .eq("ativo", true)
        .order("estado");
      setTabelas((data ?? []) as unknown as TabelaOAB[]);
      const mt = (data ?? []).find((t: any) => t.estado === "MT");
      if (mt) {
        setEstado("MT");
        setAno(String(mt.ano_vigencia));
      }
    })();
  }, []);

  const tabelaSelecionada = useMemo(
    () => tabelas.find((t) => t.estado === estado && String(t.ano_vigencia) === ano),
    [tabelas, estado, ano]
  );

  const categorias: CategoriaTabelaOAB[] = tabelaSelecionada?.tabela_json ?? [];
  const cat = categorias.find((c) => c.categoria === categoria);
  const itemTabela: ItemTabelaOAB | undefined = cat?.itens.find((i) => i.descricao === itemDescricao);

  const resultado = useMemo(() => {
    let totalFixo = 0;
    let totalExito = 0;
    const memoria: string[] = [];

    const minOAB = itemTabela?.valor_min ?? 0;
    const maxOAB = itemTabela?.valor_max ?? 0;

    if (tipo === "fixo" || tipo === "misto") {
      let base = parseFloat(valorFixo) || 0;
      if (!base && minOAB) base = minOAB;
      const fatorComp = COMPLEXIDADE[complexidade]?.fator ?? 1;
      const comComp = base * fatorComp;
      const comExtra = comComp * (1 + fatorExtra / 100);
      totalFixo = comExtra * (1 - desconto / 100);

      memoria.push(`Base: R$ ${fmtMoeda(base)}`);
      if (fatorComp !== 1) memoria.push(`Complexidade ×${fatorComp}: R$ ${fmtMoeda(comComp)}`);
      if (fatorExtra) memoria.push(`+${fatorExtra}% extra: R$ ${fmtMoeda(comExtra)}`);
      if (desconto) memoria.push(`−${desconto}% desconto: R$ ${fmtMoeda(totalFixo)}`);
      memoria.push(`TOTAL FIXO: R$ ${fmtMoeda(totalFixo)}`);
    }

    if (tipo === "exito" || tipo === "misto") {
      const proveito = parseFloat(proveitoEconomico) || 0;
      totalExito = proveito * (percentualExito / 100);
      memoria.push("");
      memoria.push(`Proveito econômico: R$ ${fmtMoeda(proveito)}`);
      memoria.push(`Percentual: ${percentualExito}%`);
      memoria.push(`TOTAL ÊXITO: R$ ${fmtMoeda(totalExito)}`);
    }

    if (tipo === "mensalidade") {
      const mensal = parseFloat(valorFixo) || 0;
      const meses = parcelamento || 1;
      totalFixo = mensal;
      memoria.push(`Mensalidade: R$ ${fmtMoeda(mensal)}`);
      memoria.push(`Duração: ${meses} meses`);
      memoria.push(`Total estimado: R$ ${fmtMoeda(mensal * meses)}`);
    }

    const totalGeral = totalFixo + totalExito;

    let statusOAB: { tipo: "ok" | "abaixo" | "acima"; msg: string } | null = null;
    if (minOAB && totalFixo > 0) {
      if (totalFixo < minOAB)
        statusOAB = { tipo: "abaixo", msg: `Abaixo do mínimo OAB (R$ ${fmtMoeda(minOAB)})` };
      else if (maxOAB && totalFixo > maxOAB)
        statusOAB = { tipo: "acima", msg: `Acima do máximo OAB (R$ ${fmtMoeda(maxOAB)})` };
      else statusOAB = { tipo: "ok", msg: "Dentro dos parâmetros OAB" };
    }

    return { totalFixo, totalExito, totalGeral, minOAB, maxOAB, statusOAB, memoria };
  }, [tipo, valorFixo, complexidade, fatorExtra, desconto, proveitoEconomico, percentualExito, parcelamento, itemTabela]);

  const inputsSnapshot = () => ({
    estado, anoTabela: ano, categoria, itemTabela,
    tipo, valorFixo, parcelamento,
    proveitoEconomico, percentualExito,
    complexidade, fatorExtra, desconto, observacaoAjuste,
  });

  const handleSalvar = async () => {
    setSalvando(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("ferramentas_calculos_salvos").insert({
      titulo: titulo || `Honorários — ${estado || "?"} — ${new Date().toLocaleDateString("pt-BR")}`,
      estado: estado || null,
      ano_tabela: ano ? parseInt(ano) : null,
      tipo_honorario: tipo,
      inputs: inputsSnapshot() as unknown as Json,
      resultado: resultado as unknown as Json,
      criado_por: user?.id,
    });
    setSalvando(false);
    if (error) toast.error("Erro ao salvar: " + error.message);
    else toast.success("Cálculo salvo");
  };

  const handleGerarProposta = async () => {
    setGerando(true);
    const { data, error } = await supabase.functions.invoke("ferramentas-gerar-proposta", {
      body: { inputs: inputsSnapshot(), resultado },
    });
    setGerando(false);
    if (error || !data?.docx_base64) {
      toast.error("Erro ao gerar proposta: " + (error?.message ?? "desconhecido"));
      return;
    }
    const bytes = Uint8Array.from(atob(data.docx_base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = data.filename ?? "proposta.docx"; a.click();
    URL.revokeObjectURL(url);
    toast.success("Proposta gerada");
  };

  const anosDoEstado = Array.from(new Set(tabelas.filter((t) => t.estado === estado).map((t) => t.ano_vigencia))).sort((a, b) => b - a);

  return (
    <div className="space-y-6">
      <PageHeader title="Calculadora de Honorários" description="Cálculo conforme tabela OAB e geração de proposta">
        <Button asChild variant="ghost" size="sm">
          <Link to="/ferramentas"><ArrowLeft className="w-4 h-4" /> Voltar</Link>
        </Button>
        {isGestor && (
          <Button asChild variant="outline" size="sm">
            <Link to="/ferramentas/calculadora-honorarios/tabelas"><Settings className="w-4 h-4" /> Gerenciar tabelas</Link>
          </Button>
        )}
      </PageHeader>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* INPUTS */}
        <div className="space-y-4">
          <Card className="p-5 space-y-4">
            <h3 className="font-display text-base flex items-center gap-2"><Calculator className="w-4 h-4 text-gold" /> Referência OAB</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Estado</Label>
                <Select value={estado} onValueChange={(v) => { setEstado(v); setCategoria(""); setItemDescricao(""); }}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {Array.from(new Set(tabelas.map((t) => t.estado))).map((e) => {
                      const t = tabelas.find((x) => x.estado === e);
                      return <SelectItem key={e} value={e}>{t?.oab_seccional ?? e}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Ano</Label>
                <Select value={ano} onValueChange={setAno} disabled={!estado}>
                  <SelectTrigger><SelectValue placeholder="Ano" /></SelectTrigger>
                  <SelectContent>
                    {anosDoEstado.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Categoria</Label>
                <Select value={categoria} onValueChange={(v) => { setCategoria(v); setItemDescricao(""); }} disabled={!tabelaSelecionada}>
                  <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
                  <SelectContent>
                    {categorias.map((c) => <SelectItem key={c.categoria} value={c.categoria}>{c.categoria}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Serviço</Label>
                <Select value={itemDescricao} onValueChange={setItemDescricao} disabled={!cat}>
                  <SelectTrigger><SelectValue placeholder="Serviço" /></SelectTrigger>
                  <SelectContent>
                    {cat?.itens.map((i) => <SelectItem key={i.descricao} value={i.descricao}>{i.descricao}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {itemTabela && (
              <div className="flex flex-wrap gap-2 text-xs pt-2">
                {itemTabela.valor_min != null && <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">Mín OAB: R$ {fmtMoeda(itemTabela.valor_min)}</Badge>}
                {itemTabela.valor_max != null && <Badge variant="outline">Máx OAB: R$ {fmtMoeda(itemTabela.valor_max)}</Badge>}
                {itemTabela.percentual_min != null && <Badge variant="outline">{itemTabela.percentual_min}% – {itemTabela.percentual_max}%</Badge>}
              </div>
            )}
          </Card>

          <Card className="p-5 space-y-4">
            <h3 className="font-display text-base">Tipo de honorário</h3>
            <div className="grid grid-cols-2 gap-2">
              {(["fixo", "exito", "misto", "mensalidade"] as TipoHonorario[]).map((t) => (
                <Button
                  key={t}
                  variant={tipo === t ? "gold" : "outline"}
                  size="sm"
                  onClick={() => setTipo(t)}
                  className="capitalize"
                >
                  {t === "exito" ? "Por êxito" : t}
                </Button>
              ))}
            </div>

            {(tipo === "fixo" || tipo === "misto" || tipo === "mensalidade") && (
              <div className="space-y-3">
                <div>
                  <Label>{tipo === "mensalidade" ? "Valor mensal (R$)" : "Valor fixo proposto (R$)"}</Label>
                  <Input type="number" value={valorFixo} onChange={(e) => setValorFixo(e.target.value)} placeholder={itemTabela?.valor_min ? String(itemTabela.valor_min) : "0,00"} />
                </div>
                {tipo !== "mensalidade" && (
                  <div>
                    <Label>Complexidade</Label>
                    <div className="grid grid-cols-4 gap-1 mt-1">
                      {COMPLEXIDADE.map((c, i) => (
                        <Button key={c.label} type="button" variant={complexidade === i ? "gold" : "outline"} size="sm" onClick={() => setComplexidade(i)}>
                          {c.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <Label>{tipo === "mensalidade" ? "Duração (meses)" : "Parcelamento"}</Label>
                  <Input type="number" min={1} value={parcelamento} onChange={(e) => setParcelamento(parseInt(e.target.value) || 1)} />
                </div>
              </div>
            )}

            {(tipo === "exito" || tipo === "misto") && (
              <div className="space-y-3 pt-2 border-t">
                <div>
                  <Label>Proveito econômico esperado (R$)</Label>
                  <Input type="number" value={proveitoEconomico} onChange={(e) => setProveitoEconomico(e.target.value)} placeholder="0,00" />
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <Label>Percentual de êxito</Label>
                    <span className="text-sm font-semibold text-gold">{percentualExito}%</span>
                  </div>
                  <Slider value={[percentualExito]} min={5} max={50} step={1} onValueChange={(v) => setPercentualExito(v[0])} />
                </div>
              </div>
            )}
          </Card>

          <Card className="p-5 space-y-3">
            <h3 className="font-display text-base">Ajustes</h3>
            <div>
              <Label>Fator extra (+%)</Label>
              <div className="grid grid-cols-4 gap-1 mt-1">
                {[0, 10, 20, 30].map((v) => (
                  <Button key={v} variant={fatorExtra === v ? "gold" : "outline"} size="sm" onClick={() => setFatorExtra(v)}>+{v}%</Button>
                ))}
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <Label>Desconto</Label>
                <span className="text-sm">{desconto}%</span>
              </div>
              <Slider value={[desconto]} min={0} max={30} step={1} onValueChange={(v) => setDesconto(v[0])} />
            </div>
            <div>
              <Label>Observação do ajuste</Label>
              <Input value={observacaoAjuste} onChange={(e) => setObservacaoAjuste(e.target.value)} placeholder="Opcional" />
            </div>
          </Card>
        </div>

        {/* RESULTADO */}
        <div className="space-y-4">
          <Card className="p-5 bg-gradient-to-br from-sidebar to-sidebar/90 text-sidebar-foreground border-gold/30">
            <p className="text-xs uppercase tracking-widest text-gold/80 mb-2">Honorários calculados</p>
            {(tipo === "fixo" || tipo === "misto" || tipo === "mensalidade") && (
              <div className="flex justify-between text-sm py-1"><span>Fixo</span><span>R$ {fmtMoeda(resultado.totalFixo)}</span></div>
            )}
            {(tipo === "exito" || tipo === "misto") && (
              <div className="flex justify-between text-sm py-1"><span>Êxito ({percentualExito}%)</span><span>R$ {fmtMoeda(resultado.totalExito)}</span></div>
            )}
            <div className="border-t border-gold/30 my-2" />
            <div className="flex justify-between items-baseline">
              <span className="text-sm">Total {tipo === "misto" ? "estimado" : ""}</span>
              <span className="text-3xl font-display text-gold">R$ {fmtMoeda(resultado.totalGeral)}</span>
            </div>
            {resultado.statusOAB && (
              <div className={`mt-3 text-xs px-3 py-2 rounded ${
                resultado.statusOAB.tipo === "ok" ? "bg-emerald-500/20 text-emerald-300" :
                resultado.statusOAB.tipo === "abaixo" ? "bg-amber-500/20 text-amber-300" :
                "bg-blue-500/20 text-blue-300"
              }`}>
                {resultado.statusOAB.msg}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="font-display text-base mb-3">Memória de cálculo</h3>
            <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground leading-relaxed">
{resultado.memoria.join("\n")}
            </pre>
          </Card>

          <Card className="p-5 space-y-3">
            <Label>Título do cálculo</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Honorários BPC Maria — Abr/2026" />
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={handleSalvar} disabled={salvando}>
                {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar cálculo
              </Button>
              <Button variant="gold" size="sm" onClick={handleGerarProposta} disabled={gerando || resultado.totalGeral <= 0}>
                {gerando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} Gerar proposta DOCX
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
