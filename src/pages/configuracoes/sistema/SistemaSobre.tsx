import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useConfiguracoes } from "@/hooks/useConfiguracoes";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Seção SISTEMA → Sobre o sistema.
 * Apenas leitura — exibe versão, escritório, stack.
 */
export default function SistemaSobre() {
  const { config: sistema, loading: l1 } = useConfiguracoes("sistema");
  const { config: escritorio, loading: l2 } = useConfiguracoes("escritorio");
  const loading = l1 || l2;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sobre o sistema</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {loading ? (
          <>
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-display">LegisFlow</span>
              <Badge variant="secondary">v{String(sistema.versao ?? "1.0.0")}</Badge>
            </div>
            <p className="text-muted-foreground">Sistema de gestão jurídica</p>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 pt-2">
              <Item label="Escritório" valor={String(escritorio.nome ?? "—")} />
              <Item label="Advogado(a) principal" valor={String(escritorio.nome_advogado_principal ?? "—")} />
              <Item label="OAB" valor={String(escritorio.oab ?? "—")} />
              <Item label="E-mail" valor={String(escritorio.email ?? "—")} />
              <Item label="Cidade" valor={String(escritorio.cidade ?? "—")} />
              <Item label="Estado" valor={String(escritorio.estado ?? "—")} />
            </dl>

            <div className="pt-4 border-t">
              <h4 className="font-medium mb-2">Stack</h4>
              <ul className="text-muted-foreground space-y-0.5">
                <li>Frontend · React 18 + Vite + Tailwind CSS</li>
                <li>Backend · Lovable Cloud (Supabase + Edge Functions)</li>
                <li>Banco de dados · PostgreSQL</li>
                <li>Armazenamento · Lovable Cloud Storage</li>
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Item({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground uppercase tracking-wide">{label}</dt>
      <dd className="font-medium">{valor}</dd>
    </div>
  );
}
