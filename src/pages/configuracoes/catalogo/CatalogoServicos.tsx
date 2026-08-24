import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, Search, Plus, Loader2, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CatalogoServico, agruparPorArea, indicadoresServico, normalizarChave,
  PUBLICO_LABEL, STATUS_HOMOLOGACAO_COR, STATUS_HOMOLOGACAO_LABEL,
  CLASSIFICACAO_LABEL, CLASSIFICACAO_COR, ACAO_RECOMENDADA_LABEL,
  FiltroClassificacao, filtrarPorClassificacao,
} from "@/lib/catalogo-servicos";
import { ServicoEditorSheet } from "./ServicoEditorSheet";

interface Contagem { perguntas: number; documentos: number }

/**
 * CONFIGURAÇÕES → Catálogo de Serviços (ETAPA 1).
 * Lista agrupada por área do direito com indicadores de completude.
 * Não integra contratação, POP ou produção jurídica.
 */
export default function CatalogoServicos() {
  const [loading, setLoading] = useState(true);
  const [seedando, setSeedando] = useState(false);
  const [servicos, setServicos] = useState<CatalogoServico[]>([]);
  const [contagens, setContagens] = useState<Record<string, Contagem>>({});
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [baseFiltro, setBaseFiltro] = useState<"homologada" | "sugerida">("sugerida");
  const [filtro, setFiltro] = useState<FiltroClassificacao>("todas");
  const [sugerindo, setSugerindo] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    const [s, p, d] = await Promise.all([
      supabase.from("catalogo_servicos").select("*").order("area").order("nome"),
      supabase.from("catalogo_servico_perguntas").select("servico_id"),
      supabase.from("catalogo_servico_documentos").select("servico_id"),
    ]);
    if (s.error) toast.error(s.error.message);
    setServicos((s.data ?? []) as unknown as CatalogoServico[]);
    const mapa: Record<string, Contagem> = {};
    for (const row of (p.data ?? []) as { servico_id: string }[]) {
      mapa[row.servico_id] = { perguntas: (mapa[row.servico_id]?.perguntas ?? 0) + 1, documentos: mapa[row.servico_id]?.documentos ?? 0 };
    }
    for (const row of (d.data ?? []) as { servico_id: string }[]) {
      mapa[row.servico_id] = { perguntas: mapa[row.servico_id]?.perguntas ?? 0, documentos: (mapa[row.servico_id]?.documentos ?? 0) + 1 };
    }
    setContagens(mapa);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function rodarLevantamento() {
    setSeedando(true);
    const { data, error } = await supabase.rpc("catalogo_seed_levantamento");
    setSeedando(false);
    if (error) { toast.error(error.message); return; }
    const r = (data ?? {}) as { novos?: number; total_depois?: number };
    toast.success(`Levantamento concluído · ${r.novos ?? 0} novo(s) · ${r.total_depois ?? 0} no catálogo`);
    carregar();
  }

  async function gerarSugestoes() {
    setSugerindo(true);
    const { error } = await supabase.rpc("catalogo_sugerir_homologacao");
    setSugerindo(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Sugestões atualizadas (nenhuma decisão foi alterada)");
    carregar();
  }

  async function novoServico() {
    const { data, error } = await supabase.from("catalogo_servicos").insert({
      nome: "Novo serviço", area: "outro", origem_tabela: "manual",
    }).select("id").single();
    if (error) { toast.error(error.message); return; }
    await carregar();
    setEditando(data.id);
  }

  const filtrados = useMemo(() => {
    const q = normalizarChave(busca);
    const porTexto = !q ? servicos : servicos.filter((s) =>
      normalizarChave(`${s.nome} ${s.area} ${s.subtipo ?? ""}`).includes(q));
    return filtrarPorClassificacao(porTexto, filtro, baseFiltro);
  }, [servicos, busca, filtro, baseFiltro]);

  const grupos = useMemo(() => agruparPorArea(filtrados), [filtrados]);
  const aConfirmar = servicos.filter((s) => s.status_homologacao === "a_confirmar").length;
  const duplicados = servicos.filter((s) => s.possivel_duplicidade).length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Catálogo de Serviços</CardTitle>
            <CardDescription>
              {servicos.length} serviço(s) · {aConfirmar} a confirmar · {duplicados} com possível duplicidade.
              Etapa de homologação: nada aqui aciona POP, contratação ou produção jurídica.
            </CardDescription>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="outline" onClick={rodarLevantamento} disabled={seedando}>
              {seedando ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
              Levantamento
            </Button>
            <Button size="sm" variant="outline" onClick={gerarSugestoes} disabled={sugerindo}>
              {sugerindo ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-1.5 h-3.5 w-3.5" />}
              Sugestões
            </Button>
            <Button size="sm" onClick={novoServico}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Serviço
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar por nome, área ou subtipo"
              value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border p-0.5">
              {(["sugerida", "homologada"] as const).map((b) => (
                <button key={b} onClick={() => setBaseFiltro(b)}
                  className={cn("rounded px-2.5 py-1 text-xs font-medium transition-colors",
                    baseFiltro === b ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
                  {b === "sugerida" ? "Sugestão" : "Decisão homologada"}
                </button>
              ))}
            </div>
            {(["todas", "servico_juridico", "pop_auxiliar", "modelo_documento", "legado_descartar", "a_confirmar"] as FiltroClassificacao[]).map((f) => (
              <button key={f} onClick={() => setFiltro(f)}
                className={cn("rounded-full border px-2.5 py-1 text-xs transition-colors",
                  filtro === f ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}>
                {f === "todas" ? "Todas" : CLASSIFICACAO_LABEL[f]}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : grupos.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Nenhum serviço no catálogo. Use “Levantamento” para importar o que já existe no sistema.
        </CardContent></Card>
      ) : (
        grupos.map((g) => (
          <Card key={g.area}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{g.rotulo}</CardTitle>
              <CardDescription>{g.itens.length} serviço(s)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {g.itens.map((s) => {
                const c = contagens[s.id] ?? { perguntas: 0, documentos: 0 };
                const indicadores = indicadoresServico(s, c.perguntas, c.documentos);
                return (
                  <button key={s.id} onClick={() => setEditando(s.id)}
                    className="w-full rounded-md border p-3 text-left transition-colors hover:bg-muted/60">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{s.nome}</span>
                      <Badge className={cn("border-0", STATUS_HOMOLOGACAO_COR[s.status_homologacao])}>
                        {STATUS_HOMOLOGACAO_LABEL[s.status_homologacao]}
                      </Badge>
                      <Badge variant="outline">{PUBLICO_LABEL[s.publico]}</Badge>
                      <Badge variant={s.ativo_operacional ? "default" : "secondary"}>
                        {s.ativo_operacional ? "Operacional" : "Não operacional"}
                      </Badge>
                      <Badge className={cn("border-0", CLASSIFICACAO_COR[s.classificacao])}>
                        {CLASSIFICACAO_LABEL[s.classificacao]}
                      </Badge>
                      {s.possivel_duplicidade && (
                        <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400">
                          POSSÍVEL DUPLICIDADE · {s.duplicidade_grupo}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {indicadores.map((i) => (
                        <span key={i.codigo}
                          className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium",
                            i.tom === "ok" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
                            i.tom === "alerta" && "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                            i.tom === "neutro" && "bg-muted text-muted-foreground")}>
                          {i.label}
                        </span>
                      ))}
                      <span className="text-[11px] text-muted-foreground">
                        · Sugestão: {CLASSIFICACAO_LABEL[s.classificacao_sugerida]} → {ACAO_RECOMENDADA_LABEL[s.acao_recomendada]}
                        {s.servico_principal_sugerido_nome && s.servico_principal_sugerido_id
                          ? ` (principal sugerido: ${s.servico_principal_sugerido_nome})` : ""}
                        · {c.perguntas} pergunta(s) · {c.documentos} documento(s)
                        {s.origem_tabela ? ` · origem: ${s.origem_tabela}` : ""}
                      </span>
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        ))
      )}

      <ServicoEditorSheet
        servicoId={editando}
        open={!!editando}
        onOpenChange={(v) => !v && setEditando(null)}
        onSaved={() => { setEditando(null); carregar(); }}
      />
    </div>
  );
}
