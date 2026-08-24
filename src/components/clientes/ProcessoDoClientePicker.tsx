// Seletor de processo restrito a um cliente. Garante que o atendimento
// só seja vinculado a processos do MESMO cliente — o trigger no banco
// também impede vínculos cruzados, esta UI evita o erro acontecer.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";

interface ProcessoLite {
  id: string;
  numero_cnj: string | null;
  tipo: string;
  area_direito: string | null;
  status: string;
}

interface Props {
  clienteId: string;
  value: string | null;
  onChange: (processoId: string | null) => void;
  label?: string;
  disabled?: boolean;
}

export function ProcessoDoClientePicker({
  clienteId,
  value,
  onChange,
  label = "Processo vinculado",
  disabled,
}: Props) {
  const [items, setItems] = useState<ProcessoLite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clienteId) return;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("processos")
        .select("id, numero_cnj, tipo, area_direito, status")
        .eq("cliente_id", clienteId)
        .order("criado_em", { ascending: false });
      setItems((data ?? []) as ProcessoLite[]);
      setLoading(false);
    })();
  }, [clienteId]);

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <select
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled || loading}
      >
        <option value="">
          {loading
            ? "Carregando processos..."
            : items.length === 0
              ? "Nenhum processo deste cliente"
              : "— Sem processo vinculado —"}
        </option>
        {items.map((p) => {
          const cnj = p.numero_cnj ?? "(sem CNJ)";
          const meta = [p.tipo, p.area_direito, p.status].filter(Boolean).join(" · ");
          return (
            <option key={p.id} value={p.id}>
              {cnj} — {meta}
            </option>
          );
        })}
      </select>
      {loading && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" /> carregando...
        </p>
      )}
    </div>
  );
}
