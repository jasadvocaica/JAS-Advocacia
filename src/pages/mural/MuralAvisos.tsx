import { useState } from "react";
import { Megaphone, Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useMuralAvisos, type MuralAviso } from "@/hooks/useMuralAvisos";
import { CardAviso } from "@/components/mural/CardAviso";
import { AvisoFormDialog } from "./AvisoFormDialog";
import { LeiturasDialog } from "./LeiturasDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Filtro = "todos" | "nao_lidos" | "urgentes" | "fixados";

export default function MuralAvisos() {
  const { isGestor } = useAuth();
  const { avisos, naoLidos, ehLido, marcarLido, marcarTodosLidos, loading, recarregar } = useMuralAvisos();
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [editando, setEditando] = useState<MuralAviso | null>(null);
  const [abrirForm, setAbrirForm] = useState(false);
  const [leiturasAviso, setLeiturasAviso] = useState<MuralAviso | null>(null);

  const filtrados = avisos.filter((a) => {
    if (filtro === "nao_lidos") return !ehLido(a);
    if (filtro === "urgentes") return a.prioridade === "urgente";
    if (filtro === "fixados") return a.fixado;
    return true;
  });

  const excluir = async (id: string) => {
    if (!confirm("Excluir este aviso?")) return;
    const { error } = await (supabase as any).from("mural_avisos").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Aviso excluído"); recarregar(); }
  };

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Megaphone className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Mural de avisos</h1>
            <p className="text-xs text-muted-foreground">
              {naoLidos > 0 ? `${naoLidos} não lidos` : "Tudo em dia"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {naoLidos > 0 && (
            <Button variant="outline" size="sm" onClick={() => marcarTodosLidos()}>
              <Check className="h-4 w-4 mr-2" /> Marcar todos
            </Button>
          )}
          {isGestor && (
            <Button size="sm" onClick={() => { setEditando(null); setAbrirForm(true); }}>
              <Plus className="h-4 w-4 mr-2" /> Novo aviso
            </Button>
          )}
        </div>
      </div>

      <Tabs value={filtro} onValueChange={(v) => setFiltro(v as Filtro)}>
        <TabsList>
          <TabsTrigger value="todos">Todos</TabsTrigger>
          <TabsTrigger value="nao_lidos">Não lidos {naoLidos > 0 && `(${naoLidos})`}</TabsTrigger>
          <TabsTrigger value="urgentes">Urgentes</TabsTrigger>
          <TabsTrigger value="fixados">Fixados</TabsTrigger>
        </TabsList>
        <TabsContent value={filtro} className="mt-4">
          {loading && !avisos.length ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">Carregando...</Card>
          ) : !filtrados.length ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">Nenhum aviso encontrado.</Card>
          ) : (
            <div className="grid gap-3">
              {filtrados.map((a) => (
                <CardAviso
                  key={a.id}
                  aviso={a}
                  lido={ehLido(a)}
                  onMarcarLido={marcarLido}
                  podeAdmin={isGestor}
                  onEditar={(av) => { setEditando(av); setAbrirForm(true); }}
                  onExcluir={excluir}
                  onVerLeituras={(av) => setLeiturasAviso(av)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AvisoFormDialog
        open={abrirForm}
        onOpenChange={setAbrirForm}
        aviso={editando}
        onSaved={recarregar}
      />
      <LeiturasDialog
        aviso={leiturasAviso}
        open={!!leiturasAviso}
        onOpenChange={(v) => !v && setLeiturasAviso(null)}
      />
    </div>
  );
}
