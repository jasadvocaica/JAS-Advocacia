import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { History, Download } from "lucide-react";
import { useIeJobs, urlAssinadaIe } from "./useIeJobs";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { IeJobStatus } from "./types";

const STATUS_COR: Record<IeJobStatus, "default" | "secondary" | "destructive" | "outline"> = {
  aguardando: "outline",
  processando: "secondary",
  concluido: "default",
  concluido_parcial: "secondary",
  erro: "destructive",
  expirado: "outline",
};

const STATUS_LABEL: Record<IeJobStatus, string> = {
  aguardando: "Aguardando",
  processando: "Processando",
  concluido: "Concluído",
  concluido_parcial: "Parcial",
  erro: "Erro",
  expirado: "Expirado",
};

/** Histórico das últimas 10 importações/exportações com link de download. */
export function HistoricoJobs() {
  const { jobs, loading } = useIeJobs({ limit: 10 });

  async function baixar(path: string) {
    const url = await urlAssinadaIe(path);
    if (url) window.open(url, "_blank");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="w-4 h-4 text-gold" /> Histórico recente
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma operação ainda.</p>
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => (
              <div key={job.id} className="flex items-center gap-3 p-2 rounded-md border border-border">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {job.tipo === "importacao" ? "Importação" : "Exportação"} · {job.modulo}
                    {job.subtipo ? ` (${job.subtipo})` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(job.iniciado_em), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    {job.total_registros > 0 && ` · ${job.registros_ok}/${job.total_registros} ok`}
                    {job.registros_erro > 0 && ` · ${job.registros_erro} com erro`}
                  </p>
                </div>
                <Badge variant={STATUS_COR[job.status]}>{STATUS_LABEL[job.status]}</Badge>
                {job.arquivo_saida_url && job.status !== "expirado" && (
                  <Button size="sm" variant="outline" onClick={() => baixar(job.arquivo_saida_url!)}>
                    <Download className="w-3 h-3 mr-1" /> Baixar
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
