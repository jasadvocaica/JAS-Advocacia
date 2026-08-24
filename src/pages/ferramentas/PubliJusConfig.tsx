import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Save, PlugZap, KeyRound, ShieldCheck, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { z } from "zod";
import { MapeamentoJsonPanel } from "./publijus/MapeamentoJsonPanel";

const schema = z.object({
  base_url: z.string().trim().url("URL inválida — inclua https://").max(500),
  endpoint_busca_oab: z.string().trim().min(1, "Obrigatório").max(200),
  endpoint_detalhe: z.string().trim().max(200).optional().or(z.literal("")),
  param_oab: z.string().trim().min(1).max(50),
  param_seccional: z.string().trim().min(1).max(50),
  auth_header: z.string().trim().min(1).max(100),
  auth_prefix: z.string().trim().max(50),
  observacoes: z.string().max(2000).optional().or(z.literal("")),
  ativo: z.boolean(),
});

type Form = z.infer<typeof schema>;

const VAZIO: Form = {
  base_url: "",
  endpoint_busca_oab: "/publicacoes",
  endpoint_detalhe: "/publicacoes/{id}",
  param_oab: "oab",
  param_seccional: "uf",
  auth_header: "Authorization",
  auth_prefix: "Bearer ",
  observacoes: "",
  ativo: false,
};

export default function PubliJusConfig() {
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [configId, setConfigId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(VAZIO);
  const [erros, setErros] = useState<Partial<Record<keyof Form, string>>>({});
  const [oabTeste, setOabTeste] = useState("");
  const [ufTeste, setUfTeste] = useState("");
  const [resultadoTeste, setResultadoTeste] = useState<{
    ok: boolean;
    status?: number;
    latencia_ms?: number;
    url?: string;
    preview?: unknown;
    error?: string;
    dica?: string;
    detalhe_tecnico?: string;
  } | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("publijus_config")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) {
        toast({ title: "Erro ao carregar configuração", description: error.message, variant: "destructive" });
      } else if (data) {
        setConfigId(data.id);
        setForm({
          base_url: data.base_url ?? "",
          endpoint_busca_oab: data.endpoint_busca_oab ?? "/publicacoes",
          endpoint_detalhe: data.endpoint_detalhe ?? "",
          param_oab: data.param_oab ?? "oab",
          param_seccional: data.param_seccional ?? "uf",
          auth_header: data.auth_header ?? "Authorization",
          auth_prefix: data.auth_prefix ?? "Bearer ",
          observacoes: data.observacoes ?? "",
          ativo: !!data.ativo,
        });
      }
      setCarregando(false);
    })();
  }, []);

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    setErros((e) => ({ ...e, [k]: undefined }));
  }

  async function salvar() {
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const errs: Partial<Record<keyof Form, string>> = {};
      parsed.error.issues.forEach((i) => {
        const k = i.path[0] as keyof Form;
        errs[k] = i.message;
      });
      setErros(errs);
      toast({ title: "Verifique os campos", variant: "destructive" });
      return;
    }
    setSalvando(true);
    const { data: { user } } = await supabase.auth.getUser();
    const payload = { ...parsed.data, atualizado_por: user?.id };
    const op = configId
      ? supabase.from("publijus_config").update(payload).eq("id", configId)
      : supabase.from("publijus_config").insert(payload);
    const { error } = await op;
    setSalvando(false);
    if (error) {
      toast({ title: "Falha ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Configuração salva" });
    }
  }

  async function testar() {
    if (!oabTeste || !ufTeste) {
      toast({ title: "Informe OAB e UF para testar", variant: "destructive" });
      return;
    }
    setTestando(true);
    setResultadoTeste(null);
    const { data, error } = await supabase.functions.invoke("publijus-testar", {
      body: { oab: oabTeste.trim(), uf: ufTeste.trim().toUpperCase() },
    });
    setTestando(false);
    if (error) {
      setResultadoTeste({ ok: false, error: error.message });
    } else {
      setResultadoTeste(data);
    }
  }

  if (carregando) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Integração PubliJus"
        description="Configure a base URL, endpoints e cabeçalho de autenticação da API do PubliJus."
      />

      <Alert>
        <ShieldCheck className="w-4 h-4" />
        <AlertTitle>Sua chave está protegida</AlertTitle>
        <AlertDescription>
          A chave da API fica armazenada como secret do servidor (<code>PUBLIJUS_API_KEY</code>) e
          nunca trafega pelo navegador. Esta tela só configura URL e endpoints —
          a chave é usada automaticamente pelo backend nas chamadas.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <PlugZap className="w-5 h-5 text-gold" />
                Endpoints da API
              </CardTitle>
              <CardDescription>
                Use os valores que estão na documentação enviada pelo PubliJus.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="ativo" className="text-sm">Integração ativa</Label>
              <Switch id="ativo" checked={form.ativo} onCheckedChange={(v) => set("ativo", v)} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Campo
            label="Base URL"
            placeholder="https://api.publijus.com.br/v1"
            value={form.base_url}
            onChange={(v) => set("base_url", v)}
            erro={erros.base_url}
            help="URL raiz da API. Sem barra no final."
          />
          <div className="grid md:grid-cols-2 gap-4">
            <Campo
              label="Endpoint de busca por OAB"
              placeholder="/publicacoes"
              value={form.endpoint_busca_oab}
              onChange={(v) => set("endpoint_busca_oab", v)}
              erro={erros.endpoint_busca_oab}
            />
            <Campo
              label="Endpoint de detalhe (opcional)"
              placeholder="/publicacoes/{id}"
              value={form.endpoint_detalhe ?? ""}
              onChange={(v) => set("endpoint_detalhe", v)}
              erro={erros.endpoint_detalhe}
            />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Campo
              label="Nome do parâmetro da OAB"
              placeholder="oab"
              value={form.param_oab}
              onChange={(v) => set("param_oab", v)}
              erro={erros.param_oab}
            />
            <Campo
              label="Nome do parâmetro da UF/Seccional"
              placeholder="uf"
              value={form.param_seccional}
              onChange={(v) => set("param_seccional", v)}
              erro={erros.param_seccional}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-gold" />
            Autenticação
          </CardTitle>
          <CardDescription>
            Como a chave deve ser enviada em cada requisição. Ex.:
            <code className="ml-1">Authorization: Bearer SUA_CHAVE</code> ou
            <code className="ml-1">X-API-Key: SUA_CHAVE</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <Campo
            label="Cabeçalho de autenticação"
            placeholder="Authorization"
            value={form.auth_header}
            onChange={(v) => set("auth_header", v)}
            erro={erros.auth_header}
          />
          <Campo
            label="Prefixo (deixe vazio se não houver)"
            placeholder="Bearer "
            value={form.auth_prefix}
            onChange={(v) => set("auth_prefix", v)}
            erro={erros.auth_prefix}
            help='Inclua o espaço ao final, ex.: "Bearer ".'
          />
          <div className="md:col-span-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">Secret</Badge>
            <span>Chave atual: <code>PUBLIJUS_API_KEY</code> — gerenciada via secrets do servidor.</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Observações internas</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={3}
            placeholder="Notas para a equipe (ex.: limites de requisições, contato do suporte)…"
            value={form.observacoes ?? ""}
            onChange={(e) => set("observacoes", e.target.value)}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end sticky bottom-4 bg-background/80 backdrop-blur p-2 rounded-lg border">
        <Button onClick={salvar} disabled={salvando}>
          <Save className="w-4 h-4 mr-2" />
          {salvando ? "Salvando…" : "Salvar configuração"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Testar conexão</CardTitle>
          <CardDescription>
            Salve antes de testar. O backend usará a chave secreta para fazer uma
            chamada real ao endpoint de busca por OAB.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid md:grid-cols-3 gap-3">
            <div className="space-y-1.5 md:col-span-2">
              <Label>OAB</Label>
              <Input
                placeholder="123456"
                value={oabTeste}
                onChange={(e) => setOabTeste(e.target.value)}
                maxLength={20}
              />
            </div>
            <div className="space-y-1.5">
              <Label>UF</Label>
              <Input
                placeholder="SP"
                value={ufTeste}
                onChange={(e) => setUfTeste(e.target.value.toUpperCase())}
                maxLength={2}
              />
            </div>
          </div>
          <Button variant="outline" onClick={testar} disabled={testando}>
            {testando ? "Testando…" : "Executar teste"}
          </Button>

          {resultadoTeste && (
            <Alert variant={resultadoTeste.ok ? "default" : "destructive"}>
              {resultadoTeste.ok ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
              <AlertTitle>
                {resultadoTeste.ok
                  ? `OK · HTTP ${resultadoTeste.status} · ${resultadoTeste.latencia_ms} ms`
                  : `Falha${resultadoTeste.status ? ` · HTTP ${resultadoTeste.status}` : ""}`}
              </AlertTitle>
              <AlertDescription className="space-y-2">
                {resultadoTeste.error && <div className="text-sm font-medium">{resultadoTeste.error}</div>}
                {resultadoTeste.dica && (
                  <div className="text-sm rounded bg-background/60 border p-2">
                    💡 {resultadoTeste.dica}
                  </div>
                )}
                {resultadoTeste.url && (
                  <div className="text-xs break-all"><strong>URL chamada:</strong> {resultadoTeste.url}</div>
                )}
                {resultadoTeste.preview !== undefined && resultadoTeste.preview !== "" && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">Ver resposta da API</summary>
                    <pre className="bg-muted p-2 rounded max-h-64 overflow-auto mt-1">
                      {typeof resultadoTeste.preview === "string"
                        ? resultadoTeste.preview
                        : JSON.stringify(resultadoTeste.preview, null, 2)}
                    </pre>
                  </details>
                )}
                {resultadoTeste.detalhe_tecnico && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">Detalhe técnico</summary>
                    <pre className="bg-muted p-2 rounded mt-1">{resultadoTeste.detalhe_tecnico}</pre>
                  </details>
                )}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Campo({
  label,
  value,
  onChange,
  placeholder,
  erro,
  help,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  erro?: string;
  help?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={!!erro}
      />
      {erro ? (
        <p className="text-xs text-destructive">{erro}</p>
      ) : help ? (
        <p className="text-xs text-muted-foreground">{help}</p>
      ) : null}
    </div>
  );
}
