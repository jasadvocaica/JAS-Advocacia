import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  Sparkles, Loader2, CheckCircle2, Circle, Trash2, RefreshCw,
  AlertTriangle, Send, Clock, FileText,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";

interface Item {
  id: string;
  ordem: number;
  titulo: string;
  descricao: string | null;
  categoria: string;
  prazo_dias: number | null;
  data_sugerida: string | null;
  base_legal: string | null;
  prioridade: "urgente" | "alta" | "media" | "baixa";
  status: "pendente" | "em_andamento" | "concluido" | "dispensado";
  origem: string;
  item_controladoria_id: string | null;
  observacoes: string | null;
}

interface Props {
  processoId: string;
  clienteId: string | null;
  varaProcesso: string | null;
}

const PRIO: Record<Item["prioridade"], string> = {
  urgente: "bg-destructive/15 text-destructive border-destructive/30",
  alta: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  media: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  baixa: "bg-muted text-muted-foreground border-muted-foreground/20",
};

const CAT_LABEL: Record<string, string> = {
  diligencia: "Diligência",
  documento: "Documento",
  peticao: "Petição",
  prazo: "Prazo",
  audiencia: "Audiência",
  contato: "Contato",
  administrativo: "Administrativo",
  outro: "Outro",
};

const CAT_TO_CTRL: Record<string, string> = {
  peticao: "prazo_processual",
  prazo: "prazo_processual",
  audiencia: "audiencia",
  diligencia: "diligencia",
  documento: "tarefa",
  contato: "tarefa",
  administrativo: "tarefa",
  outro: "tarefa",
};

export default function ChecklistDiligenciasTab({ processoId, clienteId, varaProcesso }: Props) {
  const { user } = useAuth();
  const [itens, setItens] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [instrucoes, setInstrucoes] = useState("");
  const [diagnostico, setDiagnostico] = useState<string | null>(null);

  const carregar = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("checklist_diligencias")
      .select("*")
      .eq("processo_id", processoId)
      .order("status", { ascending: true })
      .order("ordem", { ascending: true });
    if (error) toast.error("Erro ao carregar checklist", { description: error.message });
    else setItens((data ?? []) as Item[]);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, [processoId]);

  const gerar = async () => {
    setGerando(true);
    setDialogOpen(false);
    try {
      const { data, error } = await supabase.functions.invoke("checklist-diligencias-ia", {
        body: { processo_id: processoId, instrucoes_extra: instrucoes.trim() || undefined },
      });
      if (error) throw error;
      const d = data as { ok: boolean; diagnostico?: string; itens?: Item[]; error?: string };
      if (!d.ok) throw new Error(d.error ?? "Falha");
      setDiagnostico(d.diagnostico ?? null);
      toast.success(`${d.itens?.length ?? 0} diligências geradas pela Bia`);
      setInstrucoes("");
      carregar();
    } catch (e: any) {
      toast.error("Erro ao gerar checklist", { description: e.message ?? String(e) });
    } finally {
      setGerando(false);
    }
  };

  const toggleConcluido = async (item: Item) => {
    const novo = item.status === "concluido" ? "pendente" : "concluido";
    const { error } = await supabase
      .from("checklist_diligencias")
      .update({
        status: novo,
        concluido_em: novo === "concluido" ? new Date().toISOString() : null,
        concluido_por: novo === "concluido" ? user?.id ?? null : null,
      })
      .eq("id", item.id);
    if (error) toast.error("Erro", { description: error.message });
    else { setItens((p) => p.map((i) => i.id === item.id ? { ...i, status: novo } : i)); }
  };

  const remover = async (id: string) => {
    if (!confirm("Excluir esta diligência do checklist?")) return;
    const { error } = await supabase.from("checklist_diligencias").delete().eq("id", id);
    if (error) toast.error("Erro", { description: error.message });
    else setItens((p) => p.filter((i) => i.id !== id));
  };

  const enviarParaControladoria = async (item: Item) => {
    if (!user?.id) return toast.error("Sessão expirada");
    if (item.item_controladoria_id) return toast.info("Já está na Controladoria");

    const dataVenc = item.data_sugerida
      ? new Date(item.data_sugerida + "T18:00:00").toISOString()
      : new Date(Date.now() + 7 * 86400000).toISOString();

    try {
      const { data: criado, error } = await supabase
        .from("controladoria_itens")
        .insert({
          titulo: item.titulo,
          descricao: [item.descricao, item.base_legal ? `Base legal: ${item.base_legal}` : null]
            .filter(Boolean).join("\n\n"),
          tipo: (CAT_TO_CTRL[item.categoria] ?? "tarefa") as any,
          prioridade: item.prioridade as any,
          status: "pendente" as any,
          data_vencimento: dataVenc,
          processo_id: processoId,
          cliente_id: clienteId,
          vara: varaProcesso,
          origem: "bia",
          criado_por: user.id,
        })
        .select("id")
        .single();
      if (error) throw error;

      await supabase
        .from("checklist_diligencias")
        .update({ item_controladoria_id: criado.id, status: "em_andamento" })
        .eq("id", item.id);

      toast.success("Enviado para a Controladoria", { description: item.titulo });
      carregar();
    } catch (e: any) {
      toast.error("Falha ao enviar", { description: e.message ?? String(e) });
    }
  };

  const pendentes = itens.filter((i) => i.status !== "concluido" && i.status !== "dispensado");
  const concluidos = itens.filter((i) => i.status === "concluido");

  return (
    <div className="space-y-4">
      <Card className="p-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="font-display text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-gold" /> Checklist inteligente
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            A Bia analisa o processo, andamentos e pendências e monta diligências priorizadas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {itens.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {concluidos.length}/{itens.length} concluídas
            </span>
          )}
          <Button onClick={() => setDialogOpen(true)} disabled={gerando} className="gap-2">
            {gerando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {itens.length === 0 ? "Gerar checklist" : "Gerar mais"}
          </Button>
        </div>
      </Card>

      {diagnostico && (
        <Card className="p-3 bg-gold/5 border-gold/20">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Diagnóstico da Bia</div>
          <p className="text-sm">{diagnostico}</p>
        </Card>
      )}

      {loading ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">Carregando…</Card>
      ) : itens.length === 0 ? (
        <Card className="p-10 text-center">
          <FileText className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nenhuma diligência no checklist ainda.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Clique em "Gerar checklist" e a IA vai sugerir o que fazer com base no estado atual do processo.
          </p>
        </Card>
      ) : (
        <>
          {pendentes.length > 0 && (
            <div className="space-y-2">
              {pendentes.map((it) => (
                <ItemRow
                  key={it.id} item={it}
                  onToggle={() => toggleConcluido(it)}
                  onRemover={() => remover(it.id)}
                  onEnviar={() => enviarParaControladoria(it)}
                />
              ))}
            </div>
          )}

          {concluidos.length > 0 && (
            <div className="space-y-2 opacity-70">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mt-4">Concluídas</div>
              {concluidos.map((it) => (
                <ItemRow
                  key={it.id} item={it}
                  onToggle={() => toggleConcluido(it)}
                  onRemover={() => remover(it.id)}
                  onEnviar={() => enviarParaControladoria(it)}
                />
              ))}
            </div>
          )}
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-gold" /> Gerar checklist com a Bia
            </DialogTitle>
            <DialogDescription>
              A IA vai considerar fase, andamentos e pendências em aberto. Adicione instruções extras se quiser focar em algo específico.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={instrucoes}
            onChange={(e) => setInstrucoes(e.target.value)}
            placeholder="Ex: foque em adiantar o pedido de tutela e na perícia médica."
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={gerar} className="gap-2">
              <Sparkles className="w-4 h-4" /> Gerar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ItemRow({
  item, onToggle, onRemover, onEnviar,
}: {
  item: Item;
  onToggle: () => void;
  onRemover: () => void;
  onEnviar: () => void;
}) {
  const concluido = item.status === "concluido";
  const naCtrl = !!item.item_controladoria_id;
  const atrasado = item.data_sugerida && !concluido && new Date(item.data_sugerida) < new Date();

  return (
    <Card className={`p-3 ${concluido ? "bg-emerald-500/5 border-emerald-500/30" : ""}`}>
      <div className="flex items-start gap-3">
        <Checkbox checked={concluido} onCheckedChange={onToggle} className="mt-1" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`font-medium text-sm ${concluido ? "line-through" : ""}`}>{item.titulo}</span>
            <Badge variant="outline" className="text-xs">{CAT_LABEL[item.categoria] ?? item.categoria}</Badge>
            <Badge className={PRIO[item.prioridade] + " text-xs border"}>{item.prioridade}</Badge>
            {naCtrl && (
              <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-xs gap-1 border">
                <CheckCircle2 className="w-3 h-3" /> Na Controladoria
              </Badge>
            )}
            {atrasado && (
              <Badge className="bg-destructive/15 text-destructive border-destructive/30 text-xs gap-1 border">
                <AlertTriangle className="w-3 h-3" /> Atrasada
              </Badge>
            )}
          </div>
          {item.descricao && (
            <p className="text-xs text-muted-foreground">{item.descricao}</p>
          )}
          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
            {item.prazo_dias != null && item.prazo_dias > 0 && (
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {item.prazo_dias} dias úteis</span>
            )}
            {item.data_sugerida && (
              <span>Vence em {format(parseISO(item.data_sugerida), "dd/MM/yyyy", { locale: ptBR })}</span>
            )}
            {item.base_legal && <span>· {item.base_legal}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!concluido && !naCtrl && (
            <Button size="sm" variant="ghost" onClick={onEnviar} className="gap-1.5">
              <Send className="w-3.5 h-3.5" /> Controladoria
            </Button>
          )}
          <Button size="icon" variant="ghost" onClick={onRemover} className="text-muted-foreground hover:text-destructive">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
