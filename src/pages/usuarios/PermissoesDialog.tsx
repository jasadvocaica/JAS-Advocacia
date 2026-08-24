import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Acao, ACOES, MODULOS, Modulo, UsuarioRow, perfilLabel } from "./types";

interface Props {
  usuario: UsuarioRow | null;
  onOpenChange: (o: boolean) => void;
}

type Matrix = Record<Modulo, Record<Acao, boolean>>;

function emptyMatrix(): Matrix {
  const m: any = {};
  for (const mod of MODULOS) {
    m[mod.value] = {};
    for (const a of ACOES) m[mod.value][a.value] = false;
  }
  return m;
}

export function PermissoesDialog({ usuario, onOpenChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [original, setOriginal] = useState<Matrix>(emptyMatrix());
  const [atual, setAtual] = useState<Matrix>(emptyMatrix());

  const carregar = async (uid: string) => {
    setLoading(true);
    const { data } = await supabase
      .from("user_permissions")
      .select("modulo, acao, permitido")
      .eq("user_id", uid);
    const m = emptyMatrix();
    (data ?? []).forEach((p: any) => {
      if (m[p.modulo as Modulo]) {
        m[p.modulo as Modulo][p.acao as Acao] = !!p.permitido;
      }
    });
    setOriginal(m);
    setAtual(JSON.parse(JSON.stringify(m)));
    setLoading(false);
  };

  useEffect(() => {
    if (usuario) carregar(usuario.id);
  }, [usuario?.id]);

  const toggle = (mod: Modulo, acao: Acao) => {
    setAtual((prev) => ({
      ...prev,
      [mod]: { ...prev[mod], [acao]: !prev[mod][acao] },
    }));
  };

  const isChanged = (mod: Modulo, acao: Acao) => atual[mod][acao] !== original[mod][acao];

  const totalChanges = useMemo(() => {
    let n = 0;
    for (const mod of MODULOS) for (const a of ACOES) if (isChanged(mod.value, a.value)) n++;
    return n;
  }, [atual, original]);

  const salvar = async () => {
    if (!usuario) return;
    setSalvando(true);
    const rows: any[] = [];
    for (const mod of MODULOS) {
      for (const a of ACOES) {
        rows.push({ user_id: usuario.id, modulo: mod.value, acao: a.value, permitido: atual[mod.value][a.value] });
      }
    }
    const { error } = await supabase
      .from("user_permissions")
      .upsert(rows, { onConflict: "user_id,modulo,acao" });
    setSalvando(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Permissões atualizadas (${totalChanges} alterações)`);
    setOriginal(JSON.parse(JSON.stringify(atual)));
    onOpenChange(false);
  };

  const resetar = async () => {
    if (!usuario) return;
    const perfil = usuario.roles[0];
    if (!perfil) {
      toast.error("Usuário sem perfil definido");
      return;
    }
    setSalvando(true);
    const { data, error } = await supabase.functions.invoke("admin-usuarios", {
      body: { action: "resetar_permissoes", user_id: usuario.id, perfil },
    });
    setSalvando(false);
    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Erro");
      return;
    }
    toast.success("Permissões resetadas para o padrão do perfil");
    carregar(usuario.id);
  };

  if (!usuario) return null;
  const perfil = usuario.roles[0];

  return (
    <Dialog open={!!usuario} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Permissões — {usuario.nome}
            {perfil && (
              <Badge variant="outline" className="ml-2 align-middle">{perfilLabel(perfil)}</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Controle granular do que este usuário pode ver e fazer em cada módulo.
            {totalChanges > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-amber-700 dark:text-amber-300 font-medium">
                · {totalChanges} alteração{totalChanges > 1 ? "ões" : ""} pendente{totalChanges > 1 ? "s" : ""}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Módulo</th>
                  {ACOES.map((a) => (
                    <th key={a.value} className="text-center px-2 py-2 font-medium w-20">{a.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MODULOS.map((mod) => (
                  <tr key={mod.value} className="border-t">
                    <td className="px-3 py-2 font-medium">{mod.label}</td>
                    {ACOES.map((a) => {
                      const changed = isChanged(mod.value, a.value);
                      return (
                        <td key={a.value} className={`text-center px-2 py-2 ${changed ? "bg-amber-100/40 dark:bg-amber-500/10" : ""}`}>
                          <Checkbox
                            checked={atual[mod.value][a.value]}
                            onCheckedChange={() => toggle(mod.value, a.value)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2 flex-col sm:flex-row sm:justify-between">
          <Button variant="outline" onClick={resetar} disabled={salvando || !perfil}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Resetar para padrão do perfil
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando || totalChanges === 0}>
              {salvando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar {totalChanges > 0 && `(${totalChanges})`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
