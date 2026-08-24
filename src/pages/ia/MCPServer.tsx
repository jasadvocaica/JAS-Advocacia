import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy, Trash2, Plug, Activity, Play } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { z } from "zod";

interface TokenRow {
  id: string;
  nome: string;
  ativo: boolean;
  ultimo_uso_em: string | null;
  criado_em: string;
  expira_em: string | null;
}
interface LogRow {
  id: string;
  ferramenta: string;
  sucesso: boolean;
  erro: string | null;
  duracao_ms: number | null;
  criado_em: string;
}

const MCP_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mcp-server`;

type ToolName =
  | "listar_casos_ativos"
  | "prazos_urgentes"
  | "resumo_dashboard"
  | "resumo_financeiro"
  | "buscar_caso";

const ARG_SCHEMAS: Record<ToolName, z.ZodTypeAny> = {
  listar_casos_ativos: z
    .object({
      area: z.string().trim().max(100, "área até 100 caracteres").optional(),
      limite: z.number().int("limite deve ser inteiro").min(1, "mínimo 1").max(100, "máximo 100").optional(),
    })
    .strict(),
  prazos_urgentes: z
    .object({
      dias: z.number().int("dias deve ser inteiro").min(1, "mínimo 1").max(90, "máximo 90").optional(),
    })
    .strict(),
  resumo_dashboard: z.object({}).strict(),
  resumo_financeiro: z
    .object({
      mes: z.number().int("mês inteiro").min(1, "mês 1-12").max(12, "mês 1-12").optional(),
      ano: z.number().int("ano inteiro").min(2000, "ano >= 2000").max(2100, "ano <= 2100").optional(),
    })
    .strict(),
  buscar_caso: z
    .object({
      busca: z.string().trim().min(2, "informe pelo menos 2 caracteres").max(120, "máximo 120 caracteres"),
    })
    .strict(),
};

type ExemploPayload = { label: string; args: Record<string, unknown> };

const TOOLS: {
  name: ToolName;
  descricao: string;
  argsExemplo: string;
  exemplos: ExemploPayload[];
}[] = [
  {
    name: "listar_casos_ativos",
    descricao: "Lista processos ativos (limite 1-100)",
    argsExemplo: '{\n  "limite": 10\n}',
    exemplos: [
      { label: "Top 10 mais recentes", args: { limite: 10 } },
      { label: "Previdenciário (20)", args: { area: "previdenciário", limite: 20 } },
      { label: "Trabalhista (50)", args: { area: "trabalhista", limite: 50 } },
    ],
  },
  {
    name: "prazos_urgentes",
    descricao: "Prazos pendentes (dias 1-90)",
    argsExemplo: '{\n  "dias": 7\n}',
    exemplos: [
      { label: "Hoje + 3 dias", args: { dias: 3 } },
      { label: "Próximos 7 dias", args: { dias: 7 } },
      { label: "Próximos 30 dias", args: { dias: 30 } },
    ],
  },
  {
    name: "resumo_dashboard",
    descricao: "Casos ativos, prazos urgentes e receita do mês",
    argsExemplo: "{}",
    exemplos: [{ label: "Executar (sem args)", args: {} }],
  },
  {
    name: "resumo_financeiro",
    descricao: "Receitas e parcelas (mes 1-12, ano 2000-2100)",
    argsExemplo: "{}",
    exemplos: [
      { label: "Mês atual", args: {} },
      { label: "Janeiro deste ano", args: { mes: 1, ano: new Date().getFullYear() } },
      { label: "Dezembro do ano passado", args: { mes: 12, ano: new Date().getFullYear() - 1 } },
    ],
  },
  {
    name: "buscar_caso",
    descricao: "Busca por CNJ ou nome (2-120 caracteres)",
    argsExemplo: '{\n  "busca": "Silva"\n}',
    exemplos: [
      { label: 'Nome "Silva"', args: { busca: "Silva" } },
      { label: 'Nome "Maria"', args: { busca: "Maria" } },
      { label: "CNJ parcial 0001", args: { busca: "0001" } },
    ],
  },
];

export default function MCPServer() {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [nome, setNome] = useState("");
  const [novoToken, setNovoToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Sandbox de testes
  const [testToken, setTestToken] = useState("");
  const [tool, setTool] = useState<ToolName>("listar_casos_ativos");
  const [argsJson, setArgsJson] = useState(TOOLS[0].argsExemplo);
  const [executando, setExecutando] = useState(false);
  const [resultado, setResultado] = useState<string>("");
  const [statusExec, setStatusExec] = useState<"idle" | "ok" | "erro">("idle");

  // Telemetria local (sessão)
  type Telemetria = {
    id: string;
    ferramenta: ToolName;
    args: Record<string, unknown>;
    status: "ok" | "erro";
    httpStatus: number | null;
    duracaoMs: number;
    respostaResumo: string;
    timestamp: string;
  };
  const [telemetria, setTelemetria] = useState<Telemetria[]>([]);

  async function carregar() {
    const [{ data: t }, { data: l }] = await Promise.all([
      supabase.from("mcp_tokens").select("*").order("criado_em", { ascending: false }),
      supabase.from("mcp_chamadas_log").select("*").order("criado_em", { ascending: false }).limit(30),
    ]);
    setTokens((t as any) ?? []);
    setLogs((l as any) ?? []);
  }
  useEffect(() => { carregar(); }, []);

  async function criarToken() {
    if (!nome.trim()) return toast.error("Informe um nome");
    setLoading(true);
    const { data, error } = await supabase.rpc("criar_token_mcp", { _nome: nome });
    setLoading(false);
    if (error) return toast.error(error.message);
    const token = (data as any)?.token;
    setNovoToken(token);
    setNome("");
    carregar();
  }

  async function revogar(id: string) {
    if (!confirm("Revogar este token? O Claude.ai perderá o acesso.")) return;
    const { error } = await supabase.rpc("revogar_token_mcp", { _id: id });
    if (error) return toast.error(error.message);
    toast.success("Token revogado");
    carregar();
  }

  function copiar(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Copiado");
  }

  function selecionarTool(t: ToolName) {
    setTool(t);
    const meta = TOOLS.find((x) => x.name === t);
    if (meta) setArgsJson(meta.argsExemplo);
  }

  async function chamarMcp(toolName: ToolName, args: Record<string, unknown>) {
    if (!testToken.trim()) {
      toast.error("Cole um token MCP para testar");
      return;
    }
    setExecutando(true);
    setStatusExec("idle");
    setResultado("");
    const inicio = performance.now();
    let httpStatus: number | null = null;
    let status: "ok" | "erro" = "erro";
    let respostaResumo = "";
    try {
      const resp = await fetch(MCP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${testToken.trim()}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "tools/call",
          params: { name: toolName, arguments: args },
        }),
      });
      httpStatus = resp.status;
      const txt = await resp.text();
      let body: any = txt;
      try { body = JSON.parse(txt); } catch { /* ignore */ }
      const formatado = typeof body === "string" ? body : JSON.stringify(body, null, 2);
      setResultado(formatado);
      const isErro = !resp.ok || body?.error || body?.result?.isError;
      status = isErro ? "erro" : "ok";
      setStatusExec(status);
      respostaResumo = isErro
        ? (body?.error?.message || body?.result?.content?.[0]?.text || `HTTP ${resp.status}`)
        : (body?.result?.content?.[0]?.text?.slice(0, 160) || "ok");
      if (isErro) toast.error(`Falha (HTTP ${resp.status})`);
      else toast.success("Execução concluída");
      carregar();
    } catch (e: any) {
      respostaResumo = String(e?.message ?? e);
      setResultado(respostaResumo);
      setStatusExec("erro");
      toast.error("Erro de rede: " + e.message);
    } finally {
      const duracaoMs = Math.round(performance.now() - inicio);
      setTelemetria((prev) => [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          ferramenta: toolName,
          args,
          status,
          httpStatus,
          duracaoMs,
          respostaResumo,
          timestamp: new Date().toISOString(),
        },
        ...prev,
      ].slice(0, 20));
      setExecutando(false);
    }
  }

  async function executarFerramenta() {
    let argsRaw: any = {};
    if (argsJson.trim()) {
      try { argsRaw = JSON.parse(argsJson); }
      catch (e: any) { return toast.error("JSON inválido em arguments: " + e.message); }
    }
    const parsed = ARG_SCHEMAS[tool].safeParse(argsRaw);
    if (!parsed.success) {
      const msg = parsed.error.issues
        .map((er) => `${er.path.join(".") || "(root)"}: ${er.message}`)
        .join(" • ");
      return toast.error("Validação falhou — " + msg);
    }
    await chamarMcp(tool, parsed.data as Record<string, unknown>);
  }

  async function executarExemplo(toolName: ToolName, args: Record<string, unknown>) {
    selecionarTool(toolName);
    setArgsJson(JSON.stringify(args, null, 2));
    const parsed = ARG_SCHEMAS[toolName].safeParse(args);
    if (!parsed.success) {
      return toast.error("Exemplo inválido: " + parsed.error.issues[0]?.message);
    }
    await chamarMcp(toolName, parsed.data as Record<string, unknown>);
  }

  return (
    <div className="container max-w-5xl py-8 space-y-6">
      <header className="flex items-center gap-3">
        <Plug className="size-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">MCP Server</h1>
          <p className="text-muted-foreground">Conecte o Claude.ai diretamente aos dados do escritório.</p>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Endpoint do servidor</CardTitle>
          <CardDescription>URL que você vai colar no Claude.ai (Settings → Connectors → Add MCP server)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 items-center">
            <code className="flex-1 bg-muted px-3 py-2 rounded text-sm break-all">{MCP_URL}</code>
            <Button variant="outline" size="icon" onClick={() => copiar(MCP_URL)}>
              <Copy className="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Criar novo token de acesso</CardTitle>
          <CardDescription>O token é exibido apenas uma vez. Guarde em local seguro.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder="Ex: Claude.ai do escritório" value={nome} onChange={(e) => setNome(e.target.value)} />
            <Button onClick={criarToken} disabled={loading}>Gerar token</Button>
          </div>
          {novoToken && (
            <div className="border-2 border-primary rounded p-4 space-y-2 bg-primary/5">
              <p className="text-sm font-semibold">⚠️ Copie agora — não será mostrado de novo:</p>
              <div className="flex gap-2 items-center">
                <code className="flex-1 bg-background px-3 py-2 rounded text-xs break-all">{novoToken}</code>
                <Button variant="outline" size="icon" onClick={() => copiar(novoToken)}>
                  <Copy className="size-4" />
                </Button>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setNovoToken(null)}>Ocultar</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Tokens ativos ({tokens.filter((t) => t.ativo).length})</CardTitle></CardHeader>
        <CardContent>
          {tokens.length === 0 && <p className="text-sm text-muted-foreground">Nenhum token criado ainda.</p>}
          <div className="space-y-2">
            {tokens.map((t) => (
              <div key={t.id} className="flex items-center justify-between border rounded p-3">
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {t.nome}
                    <Badge variant={t.ativo ? "default" : "secondary"}>{t.ativo ? "ativo" : "revogado"}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Criado em {new Date(t.criado_em).toLocaleString("pt-BR")}
                    {t.ultimo_uso_em && <> · Último uso: {new Date(t.ultimo_uso_em).toLocaleString("pt-BR")}</>}
                  </div>
                </div>
                {t.ativo && (
                  <Button variant="ghost" size="icon" onClick={() => revogar(t.id)}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Activity className="size-5" /> Últimas chamadas</CardTitle>
          <CardDescription>Histórico do que o Claude.ai já consultou</CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma chamada registrada ainda.</p>}
          <div className="space-y-1">
            {logs.map((l) => (
              <div key={l.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                <div className="flex items-center gap-2">
                  <Badge variant={l.sucesso ? "default" : "destructive"} className="text-xs">
                    {l.sucesso ? "✓" : "✗"}
                  </Badge>
                  <code className="text-xs">{l.ferramenta}</code>
                  {l.erro && <span className="text-xs text-destructive">{l.erro}</span>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {l.duracao_ms}ms · {new Date(l.criado_em).toLocaleString("pt-BR")}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Play className="size-5" /> Testar ferramentas no preview</CardTitle>
          <CardDescription>Cole um token MCP, escolha a ferramenta e veja a resposta exata que o Claude.ai receberá.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Token MCP</Label>
            <Input
              type="password"
              placeholder="mcp_xxxxxxxxxxxxxxxxxxxxxxxx"
              value={testToken}
              onChange={(e) => setTestToken(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Ferramenta</Label>
            <div className="flex flex-wrap gap-2">
              {TOOLS.map((t) => (
                <Button
                  key={t.name}
                  type="button"
                  size="sm"
                  variant={tool === t.name ? "default" : "outline"}
                  onClick={() => selecionarTool(t.name)}
                >
                  {t.name}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {TOOLS.find((t) => t.name === tool)?.descricao}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Exemplos rápidos</Label>
            <div className="flex flex-wrap gap-2">
              {(TOOLS.find((t) => t.name === tool)?.exemplos ?? []).map((ex, i) => (
                <Button
                  key={i}
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={executando}
                  onClick={() => executarExemplo(tool, ex.args)}
                  title={JSON.stringify(ex.args)}
                >
                  <Play className="size-3 mr-1" />
                  {ex.label}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Clique para preencher os argumentos e executar imediatamente.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Arguments (JSON)</Label>
            <Textarea
              rows={5}
              value={argsJson}
              onChange={(e) => setArgsJson(e.target.value)}
              className="font-mono text-xs"
            />
          </div>

          <Button onClick={executarFerramenta} disabled={executando}>
            <Play className="size-4 mr-2" />
            {executando ? "Executando..." : "Executar"}
          </Button>

          {resultado && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>
                  Resposta{" "}
                  <Badge variant={statusExec === "ok" ? "default" : statusExec === "erro" ? "destructive" : "secondary"}>
                    {statusExec === "ok" ? "sucesso" : statusExec === "erro" ? "erro" : "—"}
                  </Badge>
                </Label>
                <Button variant="ghost" size="sm" onClick={() => copiar(resultado)}>
                  <Copy className="size-4 mr-1" /> Copiar
                </Button>
              </div>
              <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-96 whitespace-pre-wrap break-all">
                {resultado}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="size-5" /> Telemetria da sessão
          </CardTitle>
          <CardDescription>
            Cada execução do sandbox acima é registrada aqui: ferramenta chamada, argumentos enviados, status HTTP, duração e resumo da resposta.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {telemetria.length === 0
                ? "Nenhuma chamada nesta sessão ainda."
                : `${telemetria.length} chamada(s) — mais recente primeiro`}
            </p>
            {telemetria.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setTelemetria([])}>
                <Trash2 className="size-3 mr-1" /> Limpar
              </Button>
            )}
          </div>
          <div className="space-y-2">
            {telemetria.map((t) => (
              <details key={t.id} className="border rounded p-3 group">
                <summary className="cursor-pointer flex items-center justify-between gap-2 list-none">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={t.status === "ok" ? "default" : "destructive"} className="text-xs">
                      {t.status === "ok" ? "✓ ok" : "✗ erro"}
                    </Badge>
                    <code className="text-xs font-mono">{t.ferramenta}</code>
                    {t.httpStatus !== null && (
                      <Badge variant="secondary" className="text-xs">HTTP {t.httpStatus}</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">{t.duracaoMs}ms</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(t.timestamp).toLocaleTimeString("pt-BR")}
                  </span>
                </summary>
                <div className="mt-3 space-y-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Resumo: </span>
                    <span className="break-all">{t.respostaResumo || "—"}</span>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">Arguments enviados:</div>
                    <pre className="bg-muted p-2 rounded font-mono overflow-auto max-h-40 whitespace-pre-wrap break-all">
                      {JSON.stringify(t.args, null, 2)}
                    </pre>
                  </div>
                </div>
              </details>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Como conectar no Claude.ai</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2">
          <p className="font-semibold">⚠️ Conectores customizados do Claude.ai (atualmente) não enviam Bearer token.</p>
          <p>Use a URL do endpoint <strong>com o token na query string</strong>:</p>
          <code className="block bg-muted px-3 py-2 rounded text-xs break-all">
            {MCP_URL}?token=SEU_TOKEN_AQUI
          </code>
          <ol className="list-decimal list-inside space-y-1 pt-2">
            <li>No Claude.ai (Pro/Team), abra <strong>Settings → Connectors</strong>.</li>
            <li>Clique em <strong>Add custom connector</strong>.</li>
            <li>Cole a URL acima já com <code>?token=...</code> no final.</li>
            <li>Salve. Pergunte: <em>"Quais processos vencem essa semana?"</em></li>
          </ol>
          <p className="text-muted-foreground pt-2">
            Ferramentas: listar_casos_ativos, prazos_urgentes, resumo_dashboard,
            resumo_financeiro, buscar_caso.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
