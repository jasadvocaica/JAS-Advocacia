import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, AlertTriangle, ListChecks, Sparkles, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface Diagnostico {
  total: number;
  incompletos_total: number;
  por_campo: { cpf: number; telefone: number; nascimento: number; endereco: number };
  incompletos: { id: string; nome: string; faltando: string[] }[];
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function CadastrosPendentesDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [diag, setDiag] = useState<Diagnostico | null>(null);
  const [equipe, setEquipe] = useState<{ id: string; nome: string }[]>([]);
  const [responsavelId, setResponsavelId] = useState<string>("");
  const [criando, setCriando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDiag(null);
    setLoading(true);
    (async () => {
      try {
        const [diagRes, perfRes] = await Promise.all([
          supabase.functions.invoke("cadastros-pendentes-diagnostico", { body: {} }),
          supabase.from("profiles").select("id, nome").eq("ativo", true).order("nome"),
        ]);
        if (diagRes.error) throw diagRes.error;
        setDiag(diagRes.data as Diagnostico);
        setEquipe((perfRes.data ?? []) as any);
        const ester = (perfRes.data ?? []).find((p: any) => /ester/i.test(p.nome));
        if (ester) setResponsavelId(ester.id);
      } catch (e: any) {
        toast.error("Falha no diagnóstico", { description: e?.message });
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  async function criarTarefa() {
    if (!diag) return;
    if (!responsavelId) return toast.error("Escolha um responsável");
    setCriando(true);

    const venc = new Date();
    venc.setDate(venc.getDate() + 7);
    venc.setHours(18, 0, 0, 0);

    const lista = diag.incompletos.slice(0, 50)
      .map((c) => `- **${c.nome}** — falta: ${c.faltando.join(", ")}`)
      .join("\n");

    const descricao = `**Levantamento da Bia** — ${diag.incompletos_total} cliente(s) com cadastro incompleto.

Pendências por campo:
- CPF: ${diag.por_campo.cpf}
- Telefone: ${diag.por_campo.telefone}
- Nascimento: ${diag.por_campo.nascimento}
- Endereço: ${diag.por_campo.endereco}

**Como executar**
1. Abrir cada cliente da lista abaixo
2. Confirmar/preencher CPF, nome completo, telefone, nascimento e endereço
3. Marcar a tarefa como concluída quando todos estiverem completos

**Lista${diag.incompletos_total > 50 ? ` (primeiros 50 de ${diag.incompletos_total})` : ""}:**
${lista}`;

    const { data: criado, error } = await supabase
      .from("controladoria_itens")
      .insert({
        titulo: `Revisar cadastros pendentes (${diag.incompletos_total} clientes)`,
        descricao,
        tipo: "tarefa",
        prioridade: "alta",
        status: "pendente",
        data_vencimento: venc.toISOString(),
        criado_por: user?.id ?? null,
        origem: "bia",
      } as any)
      .select("id")
      .single();

    if (error) {
      setCriando(false);
      return toast.error("Não consegui criar", { description: error.message });
    }
    if (responsavelId && criado?.id) {
      await supabase.from("controladoria_responsaveis")
        .insert({ item_id: criado.id, user_id: responsavelId, papel: "principal" } as any);
    }
    setCriando(false);
    toast.success("Tarefa criada na Controladoria");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-gold" /> Diagnóstico de cadastros
          </DialogTitle>
          <DialogDescription>
            A Bia varre todos os clientes ativos e identifica os que estão com CPF, telefone, nascimento ou endereço faltando.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-gold" />
          </div>
        ) : !diag ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Sem dados.</p>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col gap-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label="Total ativos" value={diag.total} />
              <Stat label="Incompletos" value={diag.incompletos_total} accent />
              <Stat label="Sem CPF" value={diag.por_campo.cpf} />
              <Stat label="Sem telefone" value={diag.por_campo.telefone} />
              <Stat label="Sem nascimento" value={diag.por_campo.nascimento} />
              <Stat label="Sem endereço" value={diag.por_campo.endereco} />
            </div>

            <div className="border rounded-md flex-1 min-h-0 flex flex-col">
              <div className="px-3 py-2 border-b text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <ListChecks className="w-3.5 h-3.5" /> Clientes incompletos ({diag.incompletos.length}{diag.incompletos_total > diag.incompletos.length ? ` de ${diag.incompletos_total}` : ""})
              </div>
              <ScrollArea className="flex-1">
                {diag.incompletos.length === 0 ? (
                  <p className="p-6 text-sm text-center text-muted-foreground">
                    🎉 Todos os cadastros estão completos!
                  </p>
                ) : (
                  <ul className="divide-y">
                    {diag.incompletos.map((c) => (
                      <li key={c.id} className="px-3 py-2 flex items-center gap-2 text-sm">
                        <Link to={`/clientes/${c.id}`} className="font-medium hover:text-gold flex-1 truncate inline-flex items-center gap-1">
                          {c.nome} <ExternalLink className="w-3 h-3 opacity-60" />
                        </Link>
                        <div className="flex flex-wrap gap-1 justify-end">
                          {c.faltando.map((f) => (
                            <Badge key={f} variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-500/30">
                              {f}
                            </Badge>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </ScrollArea>
            </div>

            {diag.incompletos_total > 0 && (
              <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  Criar tarefa para revisar tudo
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Select value={responsavelId} onValueChange={setResponsavelId}>
                    <SelectTrigger className="sm:w-[220px]">
                      <SelectValue placeholder="Responsável" />
                    </SelectTrigger>
                    <SelectContent>
                      {equipe.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="gold" onClick={criarTarefa} disabled={criando} className="flex-1">
                    {criando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Criar tarefa com lista
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`rounded-md border p-2 ${accent ? "bg-amber-500/10 border-amber-500/30" : "bg-card"}`}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-lg font-display ${accent ? "text-amber-700" : ""}`}>{value}</p>
    </div>
  );
}
