import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export interface SugestaoTarefa {
  titulo: string;
  tipo: "tarefa" | "prazo_fatal" | "prazo_processual" | "diligencia" | "reuniao";
  prioridade: "baixa" | "media" | "alta" | "urgente";
  data_vencimento: string;
  responsavel_id: string | null;
  descricao: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cliente?: { id: string; nome: string } | null;
  equipe?: { id: string; nome: string }[];
  onSugerido: (s: SugestaoTarefa) => void;
}

const EXEMPLOS = [
  "Ester revisar e completar o cadastro de todos os clientes pendentes até sexta",
  "Ligar para o cliente confirmando audiência da semana que vem",
  "Solicitar CNIS atualizado e protocolar até 10 dias",
];

export default function SugerirTarefaIADialog({ open, onOpenChange, cliente, equipe, onSugerido }: Props) {
  const [intencao, setIntencao] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function gerar() {
    const t = intencao.trim();
    if (t.length < 5) return toast.error("Descreva o que precisa fazer");
    setCarregando(true);
    try {
      const { data, error } = await supabase.functions.invoke("tarefa-sugerir-ia", {
        body: {
          intencao: t,
          cliente: cliente ?? null,
          equipe: equipe ?? [],
          hoje: new Date().toISOString().slice(0, 10),
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      onSugerido(data as SugestaoTarefa);
      toast.success("Sugestão pronta — revise e ajuste antes de salvar");
      onOpenChange(false);
      setIntencao("");
    } catch (e: any) {
      toast.error("Não consegui sugerir", { description: e?.message ?? "Tente de novo" });
    } finally {
      setCarregando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-gold" /> Sugerir tarefa com IA
          </DialogTitle>
          <DialogDescription>
            Descreva o que precisa ser feito em linguagem natural. A Bia vai sugerir título, tipo, prazo, responsável e passos.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          autoFocus
          rows={4}
          value={intencao}
          onChange={(e) => setIntencao(e.target.value)}
          placeholder="Ex: Ester revisar e completar o cadastro de todos os clientes pendentes até sexta"
        />

        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Exemplos</p>
          <div className="flex flex-wrap gap-1.5">
            {EXEMPLOS.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setIntencao(ex)}
                className="text-xs px-2 py-1 rounded-md border bg-muted/40 hover:bg-muted text-left"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={carregando}>
            Cancelar
          </Button>
          <Button variant="gold" onClick={gerar} disabled={carregando}>
            {carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Sugerir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
