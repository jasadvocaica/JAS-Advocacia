import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/layout/PageHeader";
import { FileText, Plus, Search, Eye, Edit, Copy, Trash2 } from "lucide-react";
import { AREAS_LABEL, CATEGORIAS_LABEL, DocAreaDireito, DocCategoria, DocModelo } from "./types";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function ModelosList() {
  const { hasPermission } = useAuth();
  const podeCriar = hasPermission("documentos", "criar");
  const podeEditar = hasPermission("documentos", "editar");
  const podeExcluir = hasPermission("documentos", "excluir");

  const [modelos, setModelos] = useState<DocModelo[]>([]);
  const [busca, setBusca] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState<string>("todas");
  const [filtroArea, setFiltroArea] = useState<string>("todas");
  const [carregando, setCarregando] = useState(true);
  const [excluirId, setExcluirId] = useState<string | null>(null);

  const carregar = async () => {
    setCarregando(true);
    const { data, error } = await supabase
      .from("doc_modelos")
      .select("*")
      .eq("ativo", true)
      .order("uso_count", { ascending: false });
    if (error) {
      toast({ title: "Erro ao carregar modelos", description: error.message, variant: "destructive" });
    } else {
      setModelos((data ?? []) as DocModelo[]);
    }
    setCarregando(false);
  };

  useEffect(() => {
    carregar();
  }, []);

  const duplicar = async (m: DocModelo) => {
    const { error } = await supabase.from("doc_modelos").insert({
      titulo: `${m.titulo} (cópia)`,
      descricao: m.descricao,
      categoria: m.categoria,
      area_direito: m.area_direito,
      conteudo_html: m.conteudo_html,
      variaveis_usadas: m.variaveis_usadas,
      fonte: m.fonte,
      tamanho_fonte: m.tamanho_fonte,
      margem_superior: m.margem_superior,
      margem_inferior: m.margem_inferior,
      margem_esquerda: m.margem_esquerda,
      margem_direita: m.margem_direita,
      espacamento_entre_linhas: m.espacamento_entre_linhas,
    });
    if (error) toast({ title: "Erro ao duplicar", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Modelo duplicado" });
      carregar();
    }
  };

  const excluir = async () => {
    if (!excluirId) return;
    const { error } = await supabase.from("doc_modelos").update({ ativo: false }).eq("id", excluirId);
    if (error) toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Modelo excluído" });
      carregar();
    }
    setExcluirId(null);
  };

  const filtrados = modelos.filter((m) => {
    if (filtroCategoria !== "todas" && m.categoria !== filtroCategoria) return false;
    if (filtroArea !== "todas" && m.area_direito !== filtroArea) return false;
    if (busca && !`${m.titulo} ${m.descricao ?? ""}`.toLowerCase().includes(busca.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Biblioteca de Modelos"
        description="Modelos reutilizáveis para criação rápida de peças jurídicas"
      >
        {podeCriar && (
          <Button asChild>
            <Link to="/documentos/modelos/novo">
              <Plus className="w-4 h-4 mr-2" /> Novo modelo
            </Link>
          </Button>
        )}
      </PageHeader>

      <Card className="p-4 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por título..." className="pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
          <SelectTrigger className="md:w-56"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas categorias</SelectItem>
            {Object.entries(CATEGORIAS_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroArea} onValueChange={setFiltroArea}>
          <SelectTrigger className="md:w-56"><SelectValue placeholder="Área" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas áreas</SelectItem>
            {Object.entries(AREAS_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      </Card>

      {carregando ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : filtrados.length === 0 ? (
        <Card className="p-12 text-center">
          <FileText className="w-12 h-12 mx-auto text-muted-foreground/40" />
          <p className="mt-3 text-muted-foreground">
            {modelos.length === 0 ? "Nenhum modelo cadastrado ainda." : "Nenhum modelo corresponde aos filtros."}
          </p>
          {podeCriar && modelos.length === 0 && (
            <Button asChild className="mt-4">
              <Link to="/documentos/modelos/novo"><Plus className="w-4 h-4 mr-2" /> Criar primeiro modelo</Link>
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtrados.map((m) => (
            <Card key={m.id} className="p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold truncate">{m.titulo}</h3>
                  {m.descricao && <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{m.descricao}</p>}
                </div>
                <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="text-xs">{CATEGORIAS_LABEL[m.categoria as DocCategoria]}</Badge>
                {m.area_direito && (
                  <Badge variant="outline" className="text-xs">{AREAS_LABEL[m.area_direito as DocAreaDireito]}</Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                Usado {m.uso_count} {m.uso_count === 1 ? "vez" : "vezes"}
              </div>
              <div className="flex gap-1 pt-2 border-t">
                <Button asChild variant="ghost" size="sm" className="flex-1">
                  <Link to={`/documentos/modelos/${m.id}`}>
                    <Eye className="w-3.5 h-3.5 mr-1" /> Abrir
                  </Link>
                </Button>
                {podeEditar && (
                  <Button variant="ghost" size="sm" onClick={() => duplicar(m)} title="Duplicar">
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                )}
                {podeExcluir && (
                  <Button variant="ghost" size="sm" onClick={() => setExcluirId(m.id)} title="Excluir">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!excluirId} onOpenChange={(o) => !o && setExcluirId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir modelo?</AlertDialogTitle>
            <AlertDialogDescription>
              O modelo será arquivado e não aparecerá mais na biblioteca. Peças já criadas a partir dele continuam intactas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={excluir}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
