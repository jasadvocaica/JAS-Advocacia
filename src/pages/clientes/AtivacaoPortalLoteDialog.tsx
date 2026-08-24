// Diálogo para ativar o portal em lote.
// Lista clientes ativos com CPF válido que ainda não têm portal,
// permite seleção e ativa todos via edge function.
import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, KeyRound, Copy } from "lucide-react";
import { toast } from "sonner";
import { formatCpfCnpj } from "@/lib/format";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface ClienteCandidato {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
}

interface Resultado {
  cliente_id: string;
  nome: string;
  cpf: string;
  email: string;
  senha?: string;
  status: string;
  mensagem?: string;
}

export default function AtivacaoPortalLoteDialog({ open, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [candidatos, setCandidatos] = useState<ClienteCandidato[]>([]);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [resultados, setResultados] = useState<Resultado[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setResultados(null);
    setSelecionados(new Set());
    setLoading(true);
    (async () => {
      // pega todos clientes ativos com CPF (11 dígitos)
      const { data: cli } = await supabase
        .from("clientes")
        .select("id, nome, cpf_cnpj")
        .eq("ativo", true)
        .order("nome");
      // pega clientes que já têm vínculo
      const { data: vins } = await supabase
        .from("cliente_usuarios")
        .select("cliente_id");
      const jaTem = new Set((vins as any[] ?? []).map(v => v.cliente_id));

      const lista = (cli as any[] ?? []).filter(c => {
        if (jaTem.has(c.id)) return false;
        const cpf = (c.cpf_cnpj ?? "").replace(/\D/g, "");
        return cpf.length === 11;
      });
      setCandidatos(lista);
      setLoading(false);
    })();
  }, [open]);

  const toggleTodos = () => {
    if (selecionados.size === candidatos.length) setSelecionados(new Set());
    else setSelecionados(new Set(candidatos.map(c => c.id)));
  };

  const toggle = (id: string) => {
    const novo = new Set(selecionados);
    if (novo.has(id)) novo.delete(id); else novo.add(id);
    setSelecionados(novo);
  };

  const ativar = async () => {
    if (selecionados.size === 0) { toast.error("Selecione ao menos um cliente"); return; }
    setSalvando(true);
    const { data, error } = await supabase.functions.invoke("ativar-portal-cliente", {
      body: { cliente_ids: Array.from(selecionados), mostrar_financeiro: false },
    });
    setSalvando(false);
    if (error) { toast.error(error.message); return; }
    setResultados(data?.resultados ?? []);
    toast.success(`${(data?.resultados ?? []).filter((r: any) => r.status === "ativado").length} portal(is) ativado(s)`);
  };

  const copiarTudo = () => {
    if (!resultados) return;
    const texto = resultados
      .filter(r => r.senha)
      .map(r => `${r.nome}\nCPF: ${r.cpf}\nSenha: ${r.senha}\n`)
      .join("\n");
    navigator.clipboard.writeText(texto);
    toast.success("Credenciais copiadas");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="w-5 h-5" /> Ativar portal em lote</DialogTitle>
          <DialogDescription>
            {resultados ? "Credenciais geradas — copie e envie aos clientes." : "Selecione os clientes para gerar acesso (CPF como login, senha primeironome+123#)."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : resultados ? (
          <ScrollArea className="max-h-96 pr-4">
            <div className="space-y-2">
              {resultados.map(r => (
                <div key={r.cliente_id} className="rounded-md border border-border/50 p-3 text-sm">
                  <p className="font-medium">{r.nome}</p>
                  {r.status === "erro"
                    ? <p className="text-destructive text-xs">Erro: {r.mensagem}</p>
                    : <div className="grid grid-cols-2 gap-2 mt-1 text-xs">
                        <p><span className="text-muted-foreground">CPF:</span> <span className="font-mono">{r.cpf}</span></p>
                        {r.senha && <p><span className="text-muted-foreground">Senha:</span> <span className="font-mono">{r.senha}</span></p>}
                      </div>}
                </div>
              ))}
            </div>
          </ScrollArea>
        ) : candidatos.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Nenhum cliente disponível. Todos os clientes ativos com CPF válido já têm portal.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between text-sm border-b border-border/40 pb-2">
              <button type="button" onClick={toggleTodos} className="text-primary hover:underline">
                {selecionados.size === candidatos.length ? "Desmarcar todos" : "Selecionar todos"}
              </button>
              <span className="text-muted-foreground">{selecionados.size} de {candidatos.length}</span>
            </div>
            <ScrollArea className="max-h-96">
              <div className="space-y-1">
                {candidatos.map(c => (
                  <label key={c.id} className="flex items-center gap-3 p-2 rounded hover:bg-muted/40 cursor-pointer">
                    <Checkbox checked={selecionados.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                    <div className="flex-1 text-sm">
                      <p>{c.nome}</p>
                      <p className="text-xs text-muted-foreground font-mono">{formatCpfCnpj(c.cpf_cnpj ?? "")}</p>
                    </div>
                  </label>
                ))}
              </div>
            </ScrollArea>
          </>
        )}

        <DialogFooter>
          {resultados ? (
            <>
              <Button variant="outline" onClick={copiarTudo}><Copy className="w-4 h-4" /> Copiar credenciais</Button>
              <Button onClick={onClose}>Fechar</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>Cancelar</Button>
              <Button variant="gold" onClick={ativar} disabled={salvando || selecionados.size === 0}>
                {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                Ativar {selecionados.size} portal{selecionados.size !== 1 ? "is" : ""}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
