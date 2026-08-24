import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import ReactMarkdown from "react-markdown";
import { Bot, FileSearch, FileText, Calendar, RefreshCw, Play } from "lucide-react";

interface Relatorio { id: string; tipo: string; titulo: string; conteudo: string; criado_em: string; dados: any }
interface Analise { id: string; cliente_id: string; conteudo: string; criado_em: string }
interface Log { id: string; funcao: string; status: string; erro: string | null; criado_em: string; detalhes: any }

const FUNCOES = [
  { key: "ia-alerta-prazos-diario", label: "Briefing diário de prazos", icon: Calendar, descricao: "Analisa prazos dos próximos 7 dias e gera briefing." },
  { key: "ia-relatorio-financeiro-mensal", label: "Relatório financeiro mensal", icon: FileText, descricao: "Resumo do mês anterior com insights." },
];

export default function AutomacoesIA() {
  const [tab, setTab] = useState("relatorios");
  const [relatorios, setRelatorios] = useState<Relatorio[]>([]);
  const [analises, setAnalises] = useState<Analise[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState<Relatorio | null>(null);

  async function carregar() {
    setLoading(true);
    const [{ data: r }, { data: a }, { data: l }] = await Promise.all([
      supabase.from("ia_relatorios").select("*").order("criado_em", { ascending: false }).limit(50),
      supabase.from("ia_analises_cliente").select("*").order("criado_em", { ascending: false }).limit(50),
      supabase.from("ia_execucoes_log").select("*").order("criado_em", { ascending: false }).limit(40),
    ]);
    setRelatorios((r as any) ?? []);
    setAnalises((a as any) ?? []);
    setLogs((l as any) ?? []);
    setLoading(false);
  }
  useEffect(() => { carregar(); }, []);

  async function executarAgora(funcao: string) {
    setRunning(funcao);
    try {
      const { error } = await supabase.functions.invoke(funcao, { body: { source: "manual" } });
      if (error) throw error;
      toast.success("Automação executada");
      await carregar();
    } catch (e: any) {
      toast.error("Falha ao executar", { description: e?.message ?? "Erro desconhecido" });
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Automações da Bia"
        description="Tarefas que a IA executa automaticamente em segundo plano."
      />

      <div className="grid gap-3 md:grid-cols-2">
        {FUNCOES.map((f) => {
          const Icon = f.icon;
          return (
            <Card key={f.key}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="h-4 w-4 text-primary" />
                  {f.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">{f.descricao}</p>
                <Button size="sm" variant="outline"
                  disabled={running === f.key}
                  onClick={() => executarAgora(f.key)}>
                  {running === f.key ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Rodar agora
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="relatorios">Relatórios</TabsTrigger>
          <TabsTrigger value="analises">Análises de cliente</TabsTrigger>
          <TabsTrigger value="logs">Histórico de execução</TabsTrigger>
        </TabsList>

        <TabsContent value="relatorios" className="grid gap-4 md:grid-cols-[320px_1fr]">
          <Card>
            <CardHeader><CardTitle className="text-sm">Últimos relatórios</CardTitle></CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[480px]">
                {loading ? <Skeleton className="m-4 h-20" /> :
                  relatorios.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Sem relatórios ainda.</p> :
                  relatorios.map((r) => (
                    <button key={r.id} onClick={() => setSelecionado(r)}
                      className={`w-full text-left border-b px-4 py-3 hover:bg-muted ${selecionado?.id === r.id ? "bg-muted" : ""}`}>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{r.tipo}</Badge>
                      </div>
                      <p className="mt-1 text-sm font-medium line-clamp-1">{r.titulo}</p>
                      <p className="text-xs text-muted-foreground">{new Date(r.criado_em).toLocaleString("pt-BR")}</p>
                    </button>
                  ))}
              </ScrollArea>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">{selecionado?.titulo ?? "Selecione um relatório"}</CardTitle></CardHeader>
            <CardContent>
              {selecionado ? (
                <article className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{selecionado.conteudo}</ReactMarkdown>
                </article>
              ) : <p className="text-sm text-muted-foreground">Escolha um item à esquerda para ver o conteúdo.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analises">
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><FileSearch className="h-4 w-4" /> Análises iniciais por cliente</CardTitle></CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-24" /> :
                analises.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma análise gerada ainda. Cadastre um novo cliente para a Bia analisar automaticamente.</p> :
                <div className="space-y-4">
                  {analises.map((a) => (
                    <div key={a.id} className="rounded-lg border p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <a href={`/clientes/${a.cliente_id}`} className="text-sm font-medium underline">Cliente {a.cliente_id.slice(0, 8)}…</a>
                        <span className="text-xs text-muted-foreground">{new Date(a.criado_em).toLocaleString("pt-BR")}</span>
                      </div>
                      <article className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown>{a.conteudo}</ReactMarkdown>
                      </article>
                    </div>
                  ))}
                </div>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardHeader><CardTitle className="text-sm">Últimas execuções</CardTitle></CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-24" /> :
                logs.length === 0 ? <p className="text-sm text-muted-foreground">Sem execuções registradas.</p> :
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr><th className="pb-2">Função</th><th>Status</th><th>Quando</th><th>Detalhes</th></tr>
                  </thead>
                  <tbody>
                    {logs.map((l) => (
                      <tr key={l.id} className="border-t">
                        <td className="py-2">{l.funcao}</td>
                        <td><Badge variant={l.status === "sucesso" ? "default" : l.status === "erro" ? "destructive" : "secondary"}>{l.status}</Badge></td>
                        <td className="text-xs text-muted-foreground">{new Date(l.criado_em).toLocaleString("pt-BR")}</td>
                        <td className="text-xs">{l.erro ?? JSON.stringify(l.detalhes ?? {}).slice(0, 80)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
