import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Acao, ACOES, MODULOS, Modulo, UsuarioRow, perfilLabel } from "./types";

interface Props {
  usuario: UsuarioRow | null;
  onOpenChange: (o: boolean) => void;
}

type Matrix = Record<Modulo, Record<Acao, boolean>>;
type CarteiraScope = "todos" | "vinculados";
interface ClienteOption { id: string; nome: string; cpf_cnpj: string | null; }

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
  const [clientesScope, setClientesScope] = useState<CarteiraScope>("todos");
  const [processosScope, setProcessosScope] = useState<CarteiraScope>("todos");
  const [clientes, setClientes] = useState<ClienteOption[]>([]);
  const [clientesVinculados, setClientesVinculados] = useState<Set<string>>(new Set());

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
    const db = supabase as any;
    const [{ data: escopo }, { data: listaClientes }, { data: vinculos }] = await Promise.all([
      db.from("user_access_scopes").select("clientes_scope, processos_scope").eq("user_id", uid).maybeSingle(),
      db.from("clientes").select("id, nome, cpf_cnpj").eq("ativo", true).order("nome"),
      db.from("user_client_links").select("cliente_id").eq("user_id", uid),
    ]);
    setClientesScope((escopo?.clientes_scope ?? "todos") as CarteiraScope);
    setProcessosScope((escopo?.processos_scope ?? "todos") as CarteiraScope);
    setClientes((listaClientes ?? []) as ClienteOption[]);
    setClientesVinculados(new Set((vinculos ?? []).map((v: any) => v.cliente_id)));
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
    if (error) {
      setSalvando(false);
      toast.error(error.message);
      return;
    }

    const db = supabase as any;
    const { error: scopeError } = await db.from("user_access_scopes").upsert({
      user_id: usuario.id,
      clientes_scope: clientesScope,
      processos_scope: processosScope,
      atualizado_em: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (scopeError) {
      setSalvando(false);
      toast.error(scopeError.message);
      return;
    }

    const { error: deleteError } = await db.from("user_client_links").delete().eq("user_id", usuario.id);
    if (deleteError) {
      setSalvando(false);
      toast.error(deleteError.message);
      return;
    }
    if (clientesScope === "vinculados" && clientesVinculados.size > 0) {
      const { error: linkError } = await db.from("user_client_links").insert(
        Array.from(clientesVinculados).map((cliente_id) => ({ user_id: usuario.id, cliente_id }))
      );
      if (linkError) {
        setSalvando(false);
        toast.error(linkError.message);
        return;
      }
    }

    setSalvando(false);
    toast.success("Permissões e carteira atualizadas");
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
  const toggleCliente = (clienteId: string) => {
    setClientesVinculados((prev) => {
      const next = new Set(prev);
      next.has(clienteId) ? next.delete(clienteId) : next.add(clienteId);
      return next;
    });
  };

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
          <div className="space-y-5">
            <div className="rounded-md border p-4 space-y-4">
              <div>
                <h3 className="font-medium">Escopo de acesso</h3>
                <p className="text-sm text-muted-foreground">Defina se o usuário acessa toda a carteira ou somente clientes e processos vinculados.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Clientes disponíveis</Label>
                  <Select value={clientesScope} onValueChange={(v) => setClientesScope(v as CarteiraScope)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os clientes</SelectItem>
                      <SelectItem value="vinculados">Somente clientes vinculados</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Processos disponíveis</Label>
                  <Select value={processosScope} onValueChange={(v) => setProcessosScope(v as CarteiraScope)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os processos</SelectItem>
                      <SelectItem value="vinculados">Somente processos vinculados</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {clientesScope === "vinculados" && (
                <div className="space-y-2">
                  <Label>Vincular clientes ({clientesVinculados.size})</Label>
                  <div className="max-h-56 overflow-y-auto rounded-md border divide-y">
                    {clientes.length === 0 ? (
                      <p className="p-4 text-sm text-muted-foreground">Nenhum cliente ativo encontrado.</p>
                    ) : clientes.map((cliente) => (
                      <label key={cliente.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/50">
                        <Checkbox checked={clientesVinculados.has(cliente.id)} onCheckedChange={() => toggleCliente(cliente.id)} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{cliente.nome}</span>
                          {cliente.cpf_cnpj && <span className="block text-xs text-muted-foreground">{cliente.cpf_cnpj}</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

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
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2 flex-col sm:flex-row sm:justify-between">
          <Button variant="outline" onClick={resetar} disabled={salvando || !perfil}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Resetar para padrão do perfil
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando}>
              {salvando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar {totalChanges > 0 && `(${totalChanges})`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
