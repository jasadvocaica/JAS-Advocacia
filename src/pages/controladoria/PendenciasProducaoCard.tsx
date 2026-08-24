import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import {
  listarPendenciasProducao,
  PENDENCIA_LABEL,
  type PendenciaProducao,
} from "@/lib/producao-juridica";

/**
 * Visualização mínima, só para gestão: fichas convertidas que não geraram
 * fluxo por falta de configuração (associação de serviço ou responsável).
 */
export function PendenciasProducaoCard() {
  const [pendencias, setPendencias] = useState<PendenciaProducao[]>([]);

  useEffect(() => {
    let ativo = true;
    listarPendenciasProducao().then((p) => {
      if (ativo) setPendencias(p);
    });
    return () => {
      ativo = false;
    };
  }, []);

  if (pendencias.length === 0) return null;

  return (
    <Card className="border-warning/40">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-warning" />
          <h3 className="font-semibold text-sm">
            Produção jurídica — pendências de configuração
          </h3>
          <Badge variant="outline">{pendencias.length}</Badge>
        </div>
        <ul className="space-y-2">
          {pendencias.map((p) => {
            const ctx = (p.contexto ?? {}) as Record<string, string>;
            return (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
              >
                <Badge variant="secondary">{PENDENCIA_LABEL[p.codigo] ?? p.codigo}</Badge>
                <span className="text-foreground">
                  {ctx.atendimento_titulo || "Ficha de atendimento"}
                </span>
                <span>
                  área: {ctx.area || "não informada"}
                  {ctx.subtipo ? ` · subtipo: ${ctx.subtipo}` : ""}
                </span>
                <span className="ml-auto text-xs">{formatDateTime(p.criado_em)}</span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
