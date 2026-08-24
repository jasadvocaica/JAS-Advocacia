import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface Item {
  id: string;
  titulo: string;
  status: string;
  data_vencimento: string;
  cliente?: { nome: string } | null;
  processo?: { numero_cnj: string | null } | null;
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pendente: { label: "Pendente", cls: "bg-muted text-muted-foreground" },
  em_andamento: { label: "Em andamento", cls: "bg-primary/10 text-primary border-primary/30" },
  aguardando: { label: "Aguardando", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
};

export function SuporteEstherCard({
  meuId,
  estherProfileId,
}: {
  meuId: string | undefined;
  estherProfileId: string | null;
}) {
  const [itens, setItens] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!meuId || !estherProfileId) {
      setLoading(false);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("controladoria_itens")
        .select(
          "id, titulo, status, data_vencimento, cliente:clientes(nome), processo:processos(numero_cnj)"
        )
        .eq("criado_por", meuId)
        .eq("responsavel_id", estherProfileId)
        .not("status", "in", "(concluido,cancelado)")
        .order("data_vencimento", { ascending: true })
        .limit(8);
      setItens((data ?? []) as any);
      setLoading(false);
    })();
  }, [meuId, estherProfileId]);

  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-foreground">
        Suporte da Esther · {itens.length}
      </h3>
      {loading ? (
        <div className="text-xs text-muted-foreground">Carregando…</div>
      ) : !itens.length ? (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-center text-xs text-muted-foreground">
          Você não pediu nada para a Esther ainda
        </div>
      ) : (
        <ul className="space-y-2">
          {itens.map((i) => {
            const s = STATUS_LABEL[i.status] ?? { label: i.status, cls: "bg-muted" };
            return (
              <li key={i.id} className="rounded-md border bg-card px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    to={`/controladoria?item=${i.id}`}
                    className="block min-w-0 flex-1 truncate text-sm font-medium hover:underline"
                  >
                    {i.titulo}
                  </Link>
                  <Badge variant="outline" className={s.cls}>
                    {s.label}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {i.cliente?.nome ?? i.processo?.numero_cnj ?? "—"} · prazo{" "}
                  {new Date(i.data_vencimento).toLocaleDateString("pt-BR")}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
