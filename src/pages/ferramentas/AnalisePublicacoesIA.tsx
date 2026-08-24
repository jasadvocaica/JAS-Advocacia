import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  FileText, Upload, Sparkles, RefreshCw, Eye, Trash2, FileWarning,
  CheckCircle2, Clock, AlertCircle, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import RevisarAnaliseSheet from "./analise-publicacoes/RevisarAnaliseSheet";

type Origem = "caderno_dje" | "publicacao_avulsa" | "decisao" | "texto_colado";
type Status = "pendente" | "processando" | "concluido" | "falha";

interface Analise {
  id: string;
  titulo: string;
  origem: Origem;
  status: Status;
  arquivo_nome: string | null;
  total_itens: number;
  erro: string | null;
  criado_em: string;
}

const ORIGEM_LABEL: Record<Origem, string> = {
  caderno_dje: "Caderno DJE",
  publicacao_avulsa: "Publicação avulsa",
  decisao: "Decisão/Sentença",
  texto_colado: "Texto colado",
};

const STATUS_BADGE: Record<Status, { label: string; cls: string; icon: typeof Clock }> = {
  pendente: { label: "Pendente", cls: "bg-muted text-muted-foreground", icon: Clock },
  processando: { label: "Processando…", cls: "bg-blue-500/15 text-blue-600 border-blue-500/30", icon: Loader2 },
  concluido: { label: "Concluído", cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30", icon: CheckCircle2 },
  falha: { label: "Falha", cls: "bg-destructive/15 text-destructive border-destructive/30", icon: AlertCircle },
};

export default function AnalisePublicacoesIA() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [analises, setAnalises] = useState<Analise[]>([]);
  const [loading, setLoading] = useState(true);
  const [novoOpen, setNovoOpen] = useState(false);
  const [analiseAberta, setAnaliseAberta] = useState<string | null>(null);

  const carregar = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("dje_analises")
      .select("id, titulo, origem, status, arquivo_nome, total_itens, erro, criado_em")
      .order("criado_em", { ascending: false })
      .limit(100);
    if (error) {
      toast.error("Erro ao carregar análises", { description: error.message });
    } else {
      setAnalises((data ?? []) as Analise[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    carregar();
  }, []);

  // Realtime — atualiza quando edge function termina
  useEffect(() => {
    const channel = supabase
      .channel("dje_analises_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dje_analises" },
        () => carregar(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const excluir = async (id: string) => {
    if (!confirm("Excluir esta análise e todos os itens extraídos?")) return;
    const { error } = await supabase.from("dje_analises").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir", { description: error.message });
    } else {
      toast.success("Análise excluída");
      carregar();
    }
  };

  const reprocessar = async (id: string) => {
    // Limpa itens anteriores e dispara de novo
    await supabase.from("dje_itens_extraidos").delete().eq("analise_id", id);
    await supabase
      .from("dje_analises")
      .update({ status: "pendente", erro: null, total_itens: 0 })
      .eq("id", id);

    const { error } = await supabase.functions.invoke("dje-analisar", {
      body: { analise_id: id },
    });
    if (error) {
      toast.error("Erro ao reprocessar", { description: error.message });
    } else {
      toast.success("Reprocessamento iniciado");
      carregar();
    }
  };

  const stats = useMemo(() => {
    return {
      total: analises.length,
      processando: analises.filter((a) => a.status === "processando" || a.status === "pendente").length,
      itens: analises.reduce((acc, a) => acc + (a.total_itens ?? 0), 0),
    };
  }, [analises]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Análise de Publicações com IA"
        description="Suba o caderno do DJE, intimações ou decisões — a IA identifica processos, prazos e sugere atividades para a Controladoria."
      >
        <Button onClick={() => setNovoOpen(true)} className="gap-2">
          <Sparkles className="w-4 h-4" /> Nova análise
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Análises</div>
          <div className="text-2xl font-display mt-1">{stats.total}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Em processamento</div>
          <div className="text-2xl font-display mt-1">{stats.processando}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Itens extraídos</div>
          <div className="text-2xl font-display mt-1">{stats.itens}</div>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h3 className="font-display text-base">Histórico</h3>
          <Button variant="ghost" size="sm" onClick={carregar} className="gap-2">
            <RefreshCw className="w-3.5 h-3.5" /> Atualizar
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-muted-foreground text-sm">Carregando…</div>
        ) : analises.length === 0 ? (
          <div className="p-12 text-center">
            <FileWarning className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nenhuma análise ainda.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Clique em "Nova análise" para subir um arquivo do DJE ou colar um texto.
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {analises.map((a) => {
              const cfg = STATUS_BADGE[a.status];
              const Icon = cfg.icon;
              const ativo = a.status === "concluido" || a.status === "falha";
              return (
                <div
                  key={a.id}
                  className="px-4 py-3 hover:bg-muted/30 flex items-center gap-3"
                >
                  <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{a.titulo}</span>
                      <Badge variant="outline" className="text-xs">
                        {ORIGEM_LABEL[a.origem]}
                      </Badge>
                      <Badge className={cfg.cls + " text-xs gap-1 border"}>
                        <Icon className={"w-3 h-3 " + (a.status === "processando" ? "animate-spin" : "")} />
                        {cfg.label}
                      </Badge>
                      {a.status === "concluido" && (
                        <span className="text-xs text-muted-foreground">
                          {a.total_itens} {a.total_itens === 1 ? "item" : "itens"}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(a.criado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      {a.arquivo_nome ? ` • ${a.arquivo_nome}` : ""}
                    </div>
                    {a.erro && (
                      <div className="text-xs text-destructive mt-1 line-clamp-2">{a.erro}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {ativo && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setAnaliseAberta(a.id)}
                        className="gap-1.5"
                      >
                        <Eye className="w-3.5 h-3.5" /> Revisar
                      </Button>
                    )}
                    {a.status === "falha" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => reprocessar(a.id)}
                        className="gap-1.5"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Tentar de novo
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => excluir(a.id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <NovaAnaliseDialog
        open={novoOpen}
        onOpenChange={setNovoOpen}
        userId={user?.id ?? null}
        onCriada={(id) => {
          setNovoOpen(false);
          carregar();
          // Abre o painel direto — vai aparecer "processando" e atualizar via realtime
          setAnaliseAberta(id);
        }}
      />

      {analiseAberta && (
        <RevisarAnaliseSheet
          analiseId={analiseAberta}
          open={!!analiseAberta}
          onOpenChange={(o) => !o && setAnaliseAberta(null)}
          onItemConvertido={carregar}
        />
      )}
    </div>
  );
}

// =================== Dialog de nova análise ===================

interface NovaProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  userId: string | null;
  onCriada: (id: string) => void;
}

function NovaAnaliseDialog({ open, onOpenChange, userId, onCriada }: NovaProps) {
  const [tab, setTab] = useState<"arquivo" | "texto">("arquivo");
  const [titulo, setTitulo] = useState("");
  const [origem, setOrigem] = useState<Origem>("publicacao_avulsa");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!open) {
      setTitulo("");
      setOrigem("publicacao_avulsa");
      setArquivo(null);
      setTexto("");
      setTab("arquivo");
    }
  }, [open]);

  const submit = async () => {
    if (!userId) {
      toast.error("Sessão expirada");
      return;
    }
    if (!titulo.trim()) {
      toast.error("Informe um título para a análise");
      return;
    }
    if (tab === "arquivo" && !arquivo) {
      toast.error("Selecione um arquivo PDF");
      return;
    }
    if (tab === "texto" && texto.trim().length < 30) {
      toast.error("Cole pelo menos algumas linhas de texto");
      return;
    }

    setEnviando(true);
    try {
      let arquivoPath: string | null = null;
      let arquivoNome: string | null = null;
      let textoBruto: string | null = null;
      let origemFinal: Origem = origem;

      if (tab === "arquivo" && arquivo) {
        if (arquivo.size > 20 * 1024 * 1024) {
          throw new Error("Arquivo muito grande (máx 20MB)");
        }
        const ext = arquivo.name.split(".").pop()?.toLowerCase() ?? "pdf";
        const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("dje-uploads")
          .upload(path, arquivo, { contentType: arquivo.type || "application/pdf" });
        if (upErr) throw upErr;
        arquivoPath = path;
        arquivoNome = arquivo.name;
      } else {
        textoBruto = texto.trim();
        origemFinal = "texto_colado";
      }

      const { data: criada, error: insErr } = await supabase
        .from("dje_analises")
        .insert({
          criado_por: userId,
          titulo: titulo.trim(),
          origem: origemFinal,
          arquivo_nome: arquivoNome,
          arquivo_path: arquivoPath,
          texto_bruto: textoBruto,
          status: "pendente",
        })
        .select("id")
        .single();

      if (insErr) throw insErr;

      // Dispara extração — não bloqueia UI
      supabase.functions
        .invoke("dje-analisar", { body: { analise_id: criada.id } })
        .then(({ error }) => {
          if (error) {
            toast.error("Erro ao iniciar IA", { description: error.message });
          }
        });

      toast.success("Análise iniciada", {
        description: "A IA está extraindo as publicações. Você verá o resultado em alguns segundos.",
      });
      onCriada(criada.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      toast.error("Falha ao criar análise", { description: msg });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-gold" /> Nova análise
          </DialogTitle>
          <DialogDescription>
            A IA vai identificar processos, partes, intimados, tipo de ato e prazos sugeridos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Título da análise *</Label>
            <Input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: DJE TJSP 24/04/2026 — Caderno 4"
            />
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as "arquivo" | "texto")}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="arquivo" className="gap-2">
                <Upload className="w-4 h-4" /> Upload de PDF
              </TabsTrigger>
              <TabsTrigger value="texto" className="gap-2">
                <FileText className="w-4 h-4" /> Colar texto
              </TabsTrigger>
            </TabsList>

            <TabsContent value="arquivo" className="space-y-3 pt-3">
              <div className="space-y-2">
                <Label>Tipo de documento</Label>
                <Select value={origem} onValueChange={(v) => setOrigem(v as Origem)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="caderno_dje">Caderno do DJE inteiro</SelectItem>
                    <SelectItem value="publicacao_avulsa">Publicação/intimação avulsa</SelectItem>
                    <SelectItem value="decisao">Decisão / Sentença / Despacho</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Arquivo PDF (até 20MB)</Label>
                <Input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
                />
                {arquivo && (
                  <p className="text-xs text-muted-foreground">
                    {arquivo.name} • {(arquivo.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="texto" className="space-y-3 pt-3">
              <div className="space-y-2">
                <Label>Cole o texto da publicação</Label>
                <Textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  rows={10}
                  placeholder="Cole aqui o texto da publicação, intimação ou decisão…"
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  {texto.length} caracteres
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={enviando} className="gap-2">
            {enviando ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Enviando…
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" /> Analisar com IA
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
