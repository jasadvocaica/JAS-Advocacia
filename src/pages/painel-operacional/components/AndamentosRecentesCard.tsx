import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface Andamento {
  id: string;
  data: string;
  descricao: string;
  criado_em: string;
  processo_id: string;
  processo?: { numero_cnj: string | null; cliente?: { nome: string } | null };
}

export function AndamentosRecentesCard({ profileId }: { profileId: string | null | undefined }) {
  const [itens, setItens] = useState<Andamento[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profileId) return;
    (async () => {
      setLoading(true);
      // processos onde a Lana é responsável
      const { data: procs } = await supabase
        .from("processos")
        .select("id")
        .eq("responsavel_id", profileId)
        .limit(200);
      const ids = (procs ?? []).map((p: any) => p.id);
      if (!ids.length) {
        setItens([]);
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("andamentos")
        .select("id, data, descricao, criado_em, processo_id, processo:processos(numero_cnj, cliente:clientes(nome))")
        .in("processo_id", ids)
        .order("data", { ascending: false })
        .limit(5);
      setItens((data ?? []) as any);
      setLoading(false);
    })();
  }, [profileId]);

  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-foreground">
        Andamentos recentes
      </h3>
      {loading ? (
        <div className="text-xs text-muted-foreground">Carregando…</div>
      ) : !itens.length ? (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-center text-xs text-muted-foreground">
          Sem andamentos recentes
        </div>
      ) : (
        <ul className="space-y-2">
          {itens.map((a) => {
            const novo = Date.now() - new Date(a.criado_em).getTime() < 86400000;
            return (
              <li key={a.id} className="rounded-md border bg-card px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    to={`/processos/${a.processo_id}`}
                    className="block min-w-0 flex-1 truncate text-sm font-medium text-foreground hover:underline"
                  >
                    {a.descricao}
                  </Link>
                  <Badge
                    variant="outline"
                    className={
                      novo
                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
                        : "bg-muted text-muted-foreground"
                    }
                  >
                    {novo ? "Novo" : "Visto"}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {a.processo?.numero_cnj ?? "Processo"}
                  {a.processo?.cliente?.nome && ` · ${a.processo.cliente.nome}`} ·{" "}
                  {new Date(a.data).toLocaleDateString("pt-BR")}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
