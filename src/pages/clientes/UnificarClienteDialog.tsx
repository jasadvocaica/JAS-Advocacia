import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Merge, Search } from "lucide-react";
import { toast } from "sonner";
import { formatCpfCnpj } from "@/lib/format";

interface Props {
  clienteAtualId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onUnificado?: (idMantido: string) => void;
}

interface Candidato {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  whatsapp: string | null;
  email: string | null;
  status: string | null;
}

export function UnificarClienteDialog({ clienteAtualId, open, onOpenChange, onUnificado }: Props) {
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<Candidato[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [selecionado, setSelecionado] = useState<Candidato | null>(null);
  const [executando, setExecutando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    if (!open) {
      setBusca(""); setResultados([]); setSelecionado(null); setConfirmando(false);
    }
  }, [open]);

  useEffect(() => {
    const q = busca.trim();
    if (q.length < 3) { setResultados([]); return; }
    const t = setTimeout(async () => {
      setBuscando(true);
      const isDoc = /^\d/.test(q);
      let query = supabase.from("clientes").select("id, nome, cpf_cnpj, whatsapp, email, status").neq("id", clienteAtualId).limit(10);
      if (isDoc) {
        query = query.ilike("cpf_cnpj", `%${q.replace(/\D/g, "")}%`);
      } else {
        query = query.ilike("nome", `%${q}%`);
      }
      const { data } = await query;
      setResultados((data ?? []) as Candidato[]);
      setBuscando(false);
    }, 350);
    return () => clearTimeout(t);
  }, [busca, clienteAtualId]);

  async function executarUnificacao() {
    if (!selecionado) return;
    setExecutando(true);
    const { data, error } = await supabase.rpc("unificar_clientes", {
      _id_a: clienteAtualId, _id_b: selecionado.id,
    });
    setExecutando(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Clientes unificados com sucesso");
    onOpenChange(false);
    onUnificado?.(data as string);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Unificar com outro cliente</DialogTitle>
          <DialogDescription>
            Busque o cadastro duplicado por nome ou CPF/CNPJ. O sistema vai manter o mais
            completo e mover todos os dados do outro para ele. Ação irreversível.
          </DialogDescription>
        </DialogHeader>

        {!confirmando ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Nome ou CPF/CNPJ..."
                className="pl-9"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <div className="max-h-72 overflow-y-auto space-y-1">
              {buscando && <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Buscando...</div>}
              {!buscando && busca.trim().length >= 3 && resultados.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
              )}
              {resultados.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { setSelecionado(c); setConfirmando(true); }}
                  className="w-full text-left border border-border rounded-md p-3 hover:bg-muted text-sm"
                >
                  <p className="font-medium">{c.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.cpf_cnpj ? formatCpfCnpj(c.cpf_cnpj) : "sem documento"} · {c.whatsapp || c.email || "—"} · {c.status}
                  </p>
                </button>
              ))}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="border border-amber-500/40 bg-amber-500/10 p-3 rounded-md text-sm">
              <p className="font-semibold mb-1">Confirma unificação?</p>
              <p className="text-muted-foreground">
                Será mantido o cadastro com mais campos preenchidos. Todos os processos,
                contratos, documentos e atendimentos do outro serão movidos. O duplicado será excluído.
              </p>
            </div>
            <div className="text-sm">
              <p className="text-muted-foreground">Cliente selecionado para mesclar:</p>
              <p className="font-medium">{selecionado?.nome}</p>
              <p className="text-xs text-muted-foreground">
                {selecionado?.cpf_cnpj ? formatCpfCnpj(selecionado.cpf_cnpj) : ""}
              </p>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirmando(false)} disabled={executando}>Voltar</Button>
              <Button variant="gold" onClick={executarUnificacao} disabled={executando}>
                {executando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Merge className="w-4 h-4" />}
                Unificar agora
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
