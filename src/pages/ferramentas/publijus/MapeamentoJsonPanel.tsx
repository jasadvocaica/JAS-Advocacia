import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Wand2, CheckCircle2, AlertTriangle, Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  detectarMapeamento,
  aplicarPath,
  chavesDisponiveis,
  type Mapeamento,
} from "./mapeamento";

const CNJ_REGEX = /\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}/;

interface Props {
  configId: string | null;
  exemploInicial?: string | null;
  onSalvar?: () => void;
}

const VAZIO: Mapeamento = {
  lista_path: "",
  map_cnj: "",
  map_data: "",
  map_descricao: "",
  map_id: "",
  map_orgao: "",
  map_tipo: "",
};

export function MapeamentoJsonPanel({ configId, exemploInicial, onSalvar }: Props) {
  const [json, setJson] = useState(exemploInicial ?? "");
  const [erroParse, setErroParse] = useState<string | null>(null);
  const [map, setMap] = useState<Mapeamento>(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [validandoCnj, setValidandoCnj] = useState(false);
  const [resultadoVinculo, setResultadoVinculo] = useState<{
    total: number;
    encontrados: number;
    ausentes: number;
    amostras: { cnj: string; encontrado: boolean }[];
  } | null>(null);

  const parsed = useMemo(() => {
    if (!json.trim()) return null;
    try {
      setErroParse(null);
      return JSON.parse(json);
    } catch (e) {
      setErroParse(e instanceof Error ? e.message : "JSON inválido");
      return null;
    }
  }, [json]);

  const chaves = useMemo(
    () => (parsed ? chavesDisponiveis(parsed, map.lista_path) : []),
    [parsed, map.lista_path],
  );

  const lista = useMemo(() => {
    if (!parsed) return [];
    const v = aplicarPath(parsed, map.lista_path);
    return Array.isArray(v) ? v : [];
  }, [parsed, map.lista_path]);

  const previewLinhas = useMemo(() => {
    return lista.slice(0, 5).map((item) => ({
      cnj: String(aplicarPath(item, map.map_cnj) ?? ""),
      data: String(aplicarPath(item, map.map_data) ?? ""),
      descricao: String(aplicarPath(item, map.map_descricao) ?? ""),
      orgao: String(aplicarPath(item, map.map_orgao) ?? ""),
    }));
  }, [lista, map]);

  function detectar() {
    if (!parsed) {
      toast({ title: "Cole um JSON válido primeiro", variant: "destructive" });
      return;
    }
    const m = detectarMapeamento(parsed);
    setMap(m);
    if (!m.lista_path && !m.map_cnj) {
      toast({
        title: "Não consegui detectar a estrutura",
        description: "Selecione manualmente o caminho da lista e os campos abaixo.",
      });
    } else {
      toast({ title: "Mapeamento detectado", description: `Lista: ${m.lista_path || "(raiz)"} · CNJ: ${m.map_cnj || "—"}` });
    }
  }

  async function salvar() {
    if (!configId) {
      toast({ title: "Salve a configuração geral antes", variant: "destructive" });
      return;
    }
    setSalvando(true);
    const { error } = await supabase
      .from("publijus_config")
      .update({ ...map, exemplo_json: json || null })
      .eq("id", configId);
    setSalvando(false);
    if (error) {
      toast({ title: "Falha ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Mapeamento salvo" });
      onSalvar?.();
    }
  }

  async function validarVinculo() {
    if (lista.length === 0 || !map.map_cnj) {
      toast({ title: "Configure o campo CNJ primeiro", variant: "destructive" });
      return;
    }
    setValidandoCnj(true);
    setResultadoVinculo(null);
    // Extrai CNJs normalizados
    const cnjsRaw = lista
      .map((it) => String(aplicarPath(it, map.map_cnj) ?? ""))
      .filter((s) => CNJ_REGEX.test(s));
    const cnjsNorm = Array.from(new Set(cnjsRaw.map((s) => s.replace(/[^0-9]/g, ""))));

    if (cnjsNorm.length === 0) {
      setValidandoCnj(false);
      setResultadoVinculo({ total: lista.length, encontrados: 0, ausentes: lista.length, amostras: [] });
      return;
    }

    // Busca processos cujo número (apenas dígitos) bate
    const { data: processos, error } = await supabase
      .from("processos")
      .select("numero_cnj")
      .limit(2000);

    setValidandoCnj(false);
    if (error) {
      toast({ title: "Erro ao buscar processos", description: error.message, variant: "destructive" });
      return;
    }
    const setExistentes = new Set(
      (processos ?? []).map((p) => String(p.numero_cnj ?? "").replace(/[^0-9]/g, "")),
    );
    const amostras = cnjsRaw.slice(0, 8).map((cnj) => ({
      cnj,
      encontrado: setExistentes.has(cnj.replace(/[^0-9]/g, "")),
    }));
    const encontrados = cnjsNorm.filter((c) => setExistentes.has(c)).length;
    setResultadoVinculo({
      total: cnjsNorm.length,
      encontrados,
      ausentes: cnjsNorm.length - encontrados,
      amostras,
    });
  }

  function setCampo<K extends keyof Mapeamento>(k: K, v: Mapeamento[K]) {
    setMap((m) => ({ ...m, [k]: v }));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wand2 className="w-5 h-5 text-gold" />
          Mapeamento de campos do JSON
        </CardTitle>
        <CardDescription>
          Cole um exemplo real de resposta da API. Eu detecto automaticamente
          onde está cada campo (lista de publicações, CNJ, data, descrição) e
          mostro um preview vinculando aos seus processos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Cole o JSON aqui</Label>
          <Textarea
            rows={10}
            placeholder='{ "data": [ { "numero_processo": "...", "texto": "..." } ] }'
            value={json}
            onChange={(e) => setJson(e.target.value)}
            className="font-mono text-xs"
          />
          {erroParse && (
            <p className="text-xs text-destructive">JSON inválido: {erroParse}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={detectar} disabled={!parsed}>
            <Wand2 className="w-4 h-4 mr-2" />
            Detectar mapeamento automaticamente
          </Button>
          <Button variant="outline" onClick={validarVinculo} disabled={!parsed || !map.map_cnj || validandoCnj}>
            <Link2 className="w-4 h-4 mr-2" />
            {validandoCnj ? "Validando…" : "Validar vínculo com meus processos"}
          </Button>
        </div>

        {parsed && (
          <div className="grid md:grid-cols-2 gap-3">
            <CampoMap label="Caminho da lista de publicações" valor={map.lista_path} chaves={chavesDisponiveis(parsed, "")} onChange={(v) => setCampo("lista_path", v)} placeholder="data, items, publicacoes…" />
            <CampoMap label="Campo CNJ (número do processo)" valor={map.map_cnj} chaves={chaves} onChange={(v) => setCampo("map_cnj", v)} obrigatorio />
            <CampoMap label="Campo data" valor={map.map_data} chaves={chaves} onChange={(v) => setCampo("map_data", v)} />
            <CampoMap label="Campo descrição/teor" valor={map.map_descricao} chaves={chaves} onChange={(v) => setCampo("map_descricao", v)} />
            <CampoMap label="Campo ID da publicação" valor={map.map_id} chaves={chaves} onChange={(v) => setCampo("map_id", v)} />
            <CampoMap label="Campo órgão/tribunal" valor={map.map_orgao} chaves={chaves} onChange={(v) => setCampo("map_orgao", v)} />
            <CampoMap label="Campo tipo" valor={map.map_tipo} chaves={chaves} onChange={(v) => setCampo("map_tipo", v)} />
          </div>
        )}

        {previewLinhas.length > 0 && (
          <div className="space-y-2">
            <Label>Preview (5 primeiros itens da lista mapeada)</Label>
            <div className="border rounded overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-2 text-left">CNJ</th>
                    <th className="p-2 text-left">Data</th>
                    <th className="p-2 text-left">Órgão</th>
                    <th className="p-2 text-left">Descrição</th>
                  </tr>
                </thead>
                <tbody>
                  {previewLinhas.map((l, i) => {
                    const cnjOk = CNJ_REGEX.test(l.cnj);
                    return (
                      <tr key={i} className="border-t">
                        <td className="p-2 font-mono">
                          {l.cnj || <span className="text-muted-foreground">—</span>}
                          {l.cnj && !cnjOk && (
                            <Badge variant="destructive" className="ml-2">CNJ inválido</Badge>
                          )}
                        </td>
                        <td className="p-2">{l.data}</td>
                        <td className="p-2">{l.orgao}</td>
                        <td className="p-2 max-w-md truncate">{l.descricao}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {resultadoVinculo && (
          <Alert variant={resultadoVinculo.encontrados > 0 ? "default" : "destructive"}>
            {resultadoVinculo.encontrados > 0 ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            <AlertTitle>
              {resultadoVinculo.encontrados} de {resultadoVinculo.total} CNJs já existem nos seus processos
            </AlertTitle>
            <AlertDescription className="space-y-2">
              <p className="text-sm">
                {resultadoVinculo.ausentes > 0
                  ? `${resultadoVinculo.ausentes} publicações são de processos não cadastrados — serão ignoradas na sincronização (conforme sua regra "Só vincular se o CNJ já existir").`
                  : "Todos os CNJs do exemplo serão vinculados."}
              </p>
              <ul className="text-xs space-y-1">
                {resultadoVinculo.amostras.map((a, i) => (
                  <li key={i} className="font-mono flex items-center gap-2">
                    {a.encontrado ? "✅" : "⚠️"} {a.cnj}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end">
          <Button onClick={salvar} disabled={salvando || !map.map_cnj}>
            {salvando ? "Salvando…" : "Salvar mapeamento"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CampoMap({
  label,
  valor,
  chaves,
  onChange,
  placeholder,
  obrigatorio,
}: {
  label: string;
  valor: string;
  chaves: string[];
  onChange: (v: string) => void;
  placeholder?: string;
  obrigatorio?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1">
        {label}
        {obrigatorio && <span className="text-destructive">*</span>}
      </Label>
      <Input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "ex.: campo ou caminho.aninhado"}
        list={`chaves-${label.replace(/\s+/g, "-")}`}
        className="font-mono text-xs"
      />
      <datalist id={`chaves-${label.replace(/\s+/g, "-")}`}>
        {chaves.map((k) => <option key={k} value={k} />)}
      </datalist>
    </div>
  );
}
