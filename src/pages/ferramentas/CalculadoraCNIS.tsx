import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Loader2,
  Upload,
  Sparkles,
  Plus,
  Trash2,
  Calculator,
  Save,
  CheckCircle2,
  XCircle,
  Info,
} from "lucide-react";
import {
  CATEGORIAS_CNIS,
  calcularCNIS,
  type ResultadoCnis,
  type VinculoCnis,
} from "@/lib/cnis-calculadora";

export default function CalculadoraCNIS() {
  const { user } = useAuth();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [extraindo, setExtraindo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [segurado, setSegurado] = useState<{ nome?: string; cpf?: string; nit_pis?: string }>({});
  const [vinculos, setVinculos] = useState<VinculoCnis[]>([]);
  const [dataReferencia, setDataReferencia] = useState(new Date().toISOString().slice(0, 10));
  const [desempregoInvoluntario, setDesempregoInvoluntario] = useState(false);

  const resultado: ResultadoCnis | null = useMemo(() => {
    if (!vinculos.length || !vinculos.every((v) => v.data_inicio)) return null;
    return calcularCNIS(vinculos, dataReferencia, {
      desemprego_involuntario: desempregoInvoluntario,
    });
  }, [vinculos, dataReferencia, desempregoInvoluntario]);

  async function extrairComIA() {
    if (!user || !arquivo) {
      toast.error("Selecione um PDF do CNIS para extrair.");
      return;
    }
    setExtraindo(true);
    try {
      const path = `${user.id}/${Date.now()}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("ferramentas-cnis")
        .upload(path, arquivo, { contentType: "application/pdf" });
      if (upErr) throw upErr;
      setStoragePath(path);

      const { data, error } = await supabase.functions.invoke("ferramentas-cnis-extrair", {
        body: { storage_path: path },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setSegurado(data.segurado || {});
      setVinculos(
        (data.vinculos || []).map((v: VinculoCnis) => ({
          empresa: v.empresa || "",
          cnpj: v.cnpj || "",
          categoria: v.categoria || "empregado",
          data_inicio: v.data_inicio || "",
          data_fim: v.data_fim || null,
          salario_medio: v.salario_medio ?? null,
        })),
      );
      toast.success(`${data.vinculos?.length ?? 0} vínculos extraídos. Revise antes de calcular.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao extrair vínculos");
    } finally {
      setExtraindo(false);
    }
  }

  function adicionarVinculo() {
    setVinculos((prev) => [
      ...prev,
      { empresa: "", cnpj: "", categoria: "empregado", data_inicio: "", data_fim: null },
    ]);
  }

  function atualizarVinculo<K extends keyof VinculoCnis>(idx: number, campo: K, valor: VinculoCnis[K]) {
    setVinculos((prev) => prev.map((v, i) => (i === idx ? { ...v, [campo]: valor } : v)));
  }

  function removerVinculo(idx: number) {
    setVinculos((prev) => prev.filter((_, i) => i !== idx));
  }

  async function salvar() {
    if (!resultado || !user) return;
    setSalvando(true);
    try {
      const { error } = await supabase.from("ferramentas_calculos_cnis").insert({
        titulo: segurado.nome || arquivo?.name || "Cálculo CNIS",
        arquivo_nome: arquivo?.name ?? null,
        arquivo_url: storagePath,
        data_referencia: dataReferencia,
        desemprego_involuntario: desempregoInvoluntario,
        dados_segurado: segurado as never,
        vinculos: vinculos as never,
        resultado: resultado as never,
        criado_por: user.id,
      });
      if (error) throw error;
      toast.success("Cálculo salvo no histórico!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calculadora de CNIS"
        description="Extraia vínculos do CNIS com IA, revise e calcule tempo de contribuição, período de graça e benefícios possíveis."
      />

      {/* Passo 1 — upload */}
      <Card className="p-6 space-y-4">
        <h2 className="font-display text-lg">1. Enviar o CNIS</h2>
        <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-gold/40 transition">
          <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setArquivo(e.target.files?.[0] || null)}
            className="hidden"
            id="cnis-input"
          />
          <label htmlFor="cnis-input" className="cursor-pointer text-sm">
            {arquivo ? (
              <span className="font-medium">{arquivo.name}</span>
            ) : (
              <>
                <span className="text-gold font-medium">Selecione o PDF do CNIS</span>{" "}
                <span className="text-muted-foreground">(baixe pelo Meu INSS → Extratos → CNIS)</span>
              </>
            )}
          </label>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="data-ref">Data de referência</Label>
            <Input
              id="data-ref"
              type="date"
              value={dataReferencia}
              onChange={(e) => setDataReferencia(e.target.value)}
            />
          </div>
          <div className="flex items-end gap-2">
            <Checkbox
              id="desemprego"
              checked={desempregoInvoluntario}
              onCheckedChange={(c) => setDesempregoInvoluntario(c === true)}
            />
            <Label htmlFor="desemprego" className="text-sm font-normal cursor-pointer">
              Demissão sem justa causa comprovada (+12 meses no período de graça)
            </Label>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button onClick={extrairComIA} disabled={extraindo || !arquivo}>
            {extraindo ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Extraindo...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" /> Extrair com IA
              </>
            )}
          </Button>
          <Button variant="outline" onClick={adicionarVinculo}>
            <Plus className="w-4 h-4 mr-2" /> Adicionar vínculo manualmente
          </Button>
        </div>
      </Card>

      {/* Passo 2 — vínculos */}
      {vinculos.length > 0 && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="font-display text-lg">2. Revisar vínculos</h2>
              {segurado.nome && (
                <p className="text-sm text-muted-foreground">
                  {segurado.nome} {segurado.cpf && `· CPF ${segurado.cpf}`}
                </p>
              )}
            </div>
            <p className="text-xs text-amber-600">
              ⚠ Confira os dados antes do cálculo. Erros de OCR são comuns em PDFs escaneados.
            </p>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Início</TableHead>
                  <TableHead>Fim</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vinculos.map((v, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Input
                        value={v.empresa}
                        onChange={(e) => atualizarVinculo(i, "empresa", e.target.value)}
                        placeholder="Empresa / CI / MEI"
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={v.categoria}
                        onValueChange={(val) => atualizarVinculo(i, "categoria", val as VinculoCnis["categoria"])}
                      >
                        <SelectTrigger className="min-w-[160px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIAS_CNIS.map((c) => (
                            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="date"
                        value={v.data_inicio}
                        onChange={(e) => atualizarVinculo(i, "data_inicio", e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="date"
                        value={v.data_fim ?? ""}
                        onChange={(e) => atualizarVinculo(i, "data_fim", e.target.value || null)}
                        placeholder="Ativo"
                      />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => removerVinculo(i)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Button variant="outline" size="sm" onClick={adicionarVinculo}>
            <Plus className="w-4 h-4 mr-1" /> Adicionar vínculo
          </Button>
        </Card>
      )}

      {/* Passo 3 — resultado */}
      {resultado && (
        <Card className="p-6 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-display text-lg flex items-center gap-2">
              <Calculator className="w-5 h-5 text-gold" /> Resultado · {new Date(dataReferencia).toLocaleDateString("pt-BR")}
            </h2>
            <Button onClick={salvar} disabled={salvando} size="sm">
              {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
              Salvar no histórico
            </Button>
          </div>

          {/* Tempo de contribuição */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Tempo de contribuição</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Anos", value: resultado.tempo_total.anos },
                { label: "Meses", value: resultado.tempo_total.meses },
                { label: "Dias", value: resultado.tempo_total.dias },
                { label: "Contribuições", value: resultado.total_contribuicoes },
              ].map((kpi) => (
                <div key={kpi.label} className="border rounded-lg p-4 text-center">
                  <div className="text-2xl font-display text-gold">{kpi.value}</div>
                  <div className="text-xs text-muted-foreground mt-1">{kpi.label}</div>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Período de graça */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Período de graça</h3>
            <div className="space-y-1 text-sm">
              {resultado.ultimo_vinculo && (
                <p>
                  <strong>Último vínculo:</strong> {resultado.ultimo_vinculo.empresa} ·{" "}
                  {resultado.ultimo_vinculo.data_fim
                    ? `Fim: ${new Date(resultado.ultimo_vinculo.data_fim).toLocaleDateString("pt-BR")}`
                    : "Ativo"}
                </p>
              )}
              {resultado.periodo_graca.meses_graca != null && (
                <p>
                  <strong>Graça:</strong> {resultado.periodo_graca.meses_graca} meses
                  {resultado.periodo_graca.vence_em && (
                    <> · vence em {new Date(resultado.periodo_graca.vence_em).toLocaleDateString("pt-BR")}</>
                  )}
                </p>
              )}
              <p className="flex items-center gap-2 mt-2">
                <Badge
                  className={
                    resultado.periodo_graca.qualidade_segurado_ativa
                      ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
                      : "bg-red-500/15 text-red-600 border-red-500/30"
                  }
                >
                  {resultado.periodo_graca.qualidade_segurado_ativa ? "QUALIDADE ATIVA" : "QUALIDADE PERDIDA"}
                </Badge>
                <span className="text-muted-foreground">{resultado.periodo_graca.motivo}</span>
              </p>
            </div>
          </div>

          <Separator />

          {/* Benefícios possíveis */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Benefícios possíveis</h3>
            <div className="space-y-2">
              {resultado.beneficios_possiveis.map((b, i) => {
                const Icon =
                  b.possivel === true ? CheckCircle2 : b.possivel === false ? XCircle : Info;
                const color =
                  b.possivel === true
                    ? "text-emerald-600"
                    : b.possivel === false
                      ? "text-red-600"
                      : "text-blue-600";
                return (
                  <div key={i} className="border rounded p-3 flex gap-3 items-start">
                    <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${color}`} />
                    <div className="flex-1 text-sm">
                      <div className="font-medium">{b.beneficio}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{b.observacao}</div>
                      {b.faltam_tempo && b.possivel === false && (
                        <div className="text-xs mt-1">
                          Faltam: {b.faltam_tempo.anos}a {b.faltam_tempo.meses}m {b.faltam_tempo.dias}d
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
