import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Plus, ListChecks, AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Resumo {
  abertas: number;
  vencendo_hoje: number;
  atrasadas: number;
}

interface Props {
  clienteId: string;
  podeCriar?: boolean;
  onCriarTarefa?: () => void;
  onVerTarefas?: () => void;
  /** incrementa para forçar reload (ex: após criar/concluir tarefa) */
  reloadKey?: number;
}

export default function ResumoTarefasBanner({
  clienteId, podeCriar, onCriarTarefa, onVerTarefas, reloadKey,
}: Props) {
  const [resumo, setResumo] = useState<Resumo | null>(null);

  const carregar = useCallback(async () => {
    const hoje = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from("controladoria_itens")
      .select("status, data_vencimento")
      .eq("cliente_id", clienteId);

    const list = data ?? [];
    const abertasArr = list.filter((t: any) =>
      ["pendente", "em_andamento", "aguardando"].includes(t.status),
    );
    const dv = (t: any) => (t.data_vencimento ?? "").slice(0, 10);
    setResumo({
      abertas: abertasArr.length,
      vencendo_hoje: abertasArr.filter((t: any) => dv(t) === hoje).length,
      atrasadas: abertasArr.filter((t: any) => dv(t) && dv(t) < hoje).length,
    });
  }, [clienteId]);

  useEffect(() => { carregar(); }, [carregar, reloadKey]);

  if (!resumo) return null;
  if (resumo.abertas === 0 && resumo.atrasadas === 0) return null;

  const temAtrasada = resumo.atrasadas > 0;
  const venceHoje = !temAtrasada && resumo.vencendo_hoje > 0;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-2.5 text-sm",
        temAtrasada && "border-destructive/30 bg-destructive/5 text-destructive",
        venceHoje && "border-warning/30 bg-warning/5 text-warning",
        !temAtrasada && !venceHoje && "border-border bg-muted/30 text-muted-foreground",
      )}
      role="status"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <ListChecks className="w-4 h-4" />
          {resumo.abertas} {resumo.abertas === 1 ? "tarefa aberta" : "tarefas abertas"}
        </span>
        {resumo.vencendo_hoje > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden>·</span>
            <Clock className="w-3.5 h-3.5" />
            {resumo.vencendo_hoje} {resumo.vencendo_hoje === 1 ? "vence hoje" : "vencem hoje"}
          </span>
        )}
        {resumo.atrasadas > 0 && (
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span aria-hidden>·</span>
            <AlertTriangle className="w-3.5 h-3.5" />
            {resumo.atrasadas} {resumo.atrasadas === 1 ? "atrasada" : "atrasadas"}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        {onVerTarefas && (
          <Button variant="ghost" size="sm" onClick={onVerTarefas} className="h-7">
            Ver tarefas
          </Button>
        )}
        {podeCriar && onCriarTarefa && (
          <Button variant="outline" size="sm" onClick={onCriarTarefa} className="h-7">
            <Plus className="w-3.5 h-3.5" /> Nova
          </Button>
        )}
      </div>
    </div>
  );
}
