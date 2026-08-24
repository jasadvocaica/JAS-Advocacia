import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Loader2, Search, Workflow, Power, PowerOff, Trash2, Upload } from "lucide-react";
import { GATILHO_LABELS, AREA_OPTIONS, FluxoTemplate } from "./types";
import { toast } from "sonner";
import { ImportarFluxosMdDialog } from "./ImportarFluxosMdDialog";

export default function FluxosList() {
  const { isGestor } = useAuth();
  const [templates, setTemplates] = useState<(FluxoTemplate & { _count: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [importOpen, setImportOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("fluxos_templates")
      .select("id, nome, descricao, gatilho, area, ativo, criado_em")
      .order("criado_em", { ascending: false });
    if (error) {
      toast.error("Erro ao carregar fluxos");
      setLoading(false);
      return;
    }
    // Conta etapas
    const ids = (data ?? []).map((t: any) => t.id);
    let counts: Record<string, number> = {};
    if (ids.length) {
      const { data: etapas } = await (supabase as any)
        .from("fluxo_etapas_template")
        .select("template_id")
        .in("template_id", ids);
      (etapas ?? []).forEach((e: any) => {
        counts[e.template_id] = (counts[e.template_id] ?? 0) + 1;
      });
    }
    setTemplates((data ?? []).map((t: any) => ({ ...t, _count: counts[t.id] ?? 0 })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleAtivo = async (t: FluxoTemplate) => {
    const { error } = await (supabase as any)
      .from("fluxos_templates")
      .update({ ativo: !t.ativo })
      .eq("id", t.id);
    if (error) return toast.error("Erro ao alterar status");
    toast.success(t.ativo ? "Fluxo desativado" : "Fluxo ativado");
    load();
  };

  const remove = async (t: FluxoTemplate) => {
    if (!confirm(`Excluir o fluxo "${t.nome}"? Todas as etapas serão removidas.`)) return;
    const { error } = await (supabase as any).from("fluxos_templates").delete().eq("id", t.id);
    if (error) return toast.error("Erro ao excluir");
    toast.success("Fluxo excluído");
    load();
  };

  const filtered = templates.filter((t) =>
    t.nome.toLowerCase().includes(busca.toLowerCase()) ||
    (t.descricao ?? "").toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div>
      <PageHeader title="Fluxos automatizados" description="Templates que disparam tarefas, prazos e checklists automaticamente.">
        {isGestor && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="w-4 h-4 mr-2" /> Importar de Markdown
            </Button>
            <Button asChild>
              <Link to="/fluxos/novo"><Plus className="w-4 h-4 mr-2" /> Novo fluxo</Link>
            </Button>
          </div>
        )}
      </PageHeader>

      <ImportarFluxosMdDialog open={importOpen} onOpenChange={setImportOpen} onImportado={load} />

      <Card className="p-4 mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar fluxo..." className="pl-9" />
        </div>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <Workflow className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Nenhum fluxo encontrado.</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => {
            const area = AREA_OPTIONS.find((a) => a.value === t.area)?.label;
            return (
              <Card key={t.id} className="p-5 hover:shadow-md transition-shadow flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <Link to={`/fluxos/${t.id}`} className="font-semibold text-foreground hover:text-primary line-clamp-2">
                    {t.nome}
                  </Link>
                  {t.ativo ? <Badge variant="outline" className="bg-success/10 text-success border-success/30 shrink-0">Ativo</Badge> : <Badge variant="outline" className="shrink-0">Inativo</Badge>}
                </div>
                {t.descricao && <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{t.descricao}</p>}
                <div className="flex flex-wrap gap-2 mb-4">
                  <Badge variant="secondary" className="text-xs">{GATILHO_LABELS[t.gatilho] ?? t.gatilho}</Badge>
                  {area && <Badge variant="outline" className="text-xs">{area}</Badge>}
                  <Badge variant="outline" className="text-xs">{t._count} {t._count === 1 ? "etapa" : "etapas"}</Badge>
                </div>
                {isGestor && (
                  <div className="flex gap-2 mt-auto pt-3 border-t">
                    <Button size="sm" variant="ghost" onClick={() => toggleAtivo(t)}>
                      {t.ativo ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(t)} className="text-destructive hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="outline" asChild className="ml-auto">
                      <Link to={`/fluxos/${t.id}`}>Editar</Link>
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
