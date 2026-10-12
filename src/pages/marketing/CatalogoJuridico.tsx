import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { contexto } from "./api";
import CatalogoMarketing from "./CatalogoMarketing";
export default function CatalogoJuridico() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["mkt-contexto", user?.id],
    queryFn: contexto,
  });
  return (
    <div className="space-y-5">
      <PageHeader
        title="Catálogo jurídico compartilhado"
        description="Áreas, serviços e teses utilizados pelo comercial, jurídico e marketing."
      />
      {q.error ? (
        <p className="text-destructive">{q.error.message}</p>
      ) : q.data ? (
        <CatalogoMarketing
          ctx={q.data}
          onChanged={() => qc.invalidateQueries({ queryKey: ["mkt-contexto"] })}
        />
      ) : (
        <p>Carregando catálogo…</p>
      )}
    </div>
  );
}
