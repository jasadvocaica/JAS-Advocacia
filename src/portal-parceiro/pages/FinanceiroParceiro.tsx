import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, DollarSign, Info } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatBRL, formatDate } from "@/lib/format";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import type { PortalParceiroContext } from "../PortalParceiroLayout";

type Repasse = {
  id: string;
  valor_repasse: number;
  status: string;
  data_repasse: string | null;
  criado_em: string;
  processo_id: string | null;
  cliente_id: string | null;
  /** % gravado no momento do pagamento — pode diferir do contrato atual se foi renegociado */
  percentual_aplicado: number | null;
  /** "valor_recebido" | "apenas_exito" | "fixo_por_processo" */
  base_calculo: string | null;
  clientes: { nome: string } | null;
  processos: { numero_cnj: string | null; nb_inss: string | null } | null;
  /** Contrato origem do repasse — fonte do percentual variável por processo */
  honorarios_contratos: {
    base_rateio: string | null;
    percentual_parceiro: number | null;
    valor_fixo_parceiro: number | null;
  } | null;
};

const ROTULO_BASE: Record<string, string> = {
  total_recebido: "% sobre cada pagamento",
  apenas_exito: "% só sobre êxito",
  fixo_por_processo: "Valor fixo por processo",
};

function descreverAcordo(r: Repasse): string {
  const base = r.base_calculo ?? r.honorarios_contratos?.base_rateio ?? null;
  if (!base) return "—";
  if (base === "fixo_por_processo") {
    const fixo = r.honorarios_contratos?.valor_fixo_parceiro;
    return fixo ? `Fixo: ${formatBRL(Number(fixo))}` : "Valor fixo";
  }
  const pct = r.percentual_aplicado ?? r.honorarios_contratos?.percentual_parceiro;
  const sufixo = base === "apenas_exito" ? " (só êxito)" : "";
  return pct != null ? `${Number(pct).toFixed(2).replace(".", ",")}%${sufixo}` : ROTULO_BASE[base];
}

export default function FinanceiroParceiro() {
  const { parceiro } = useOutletContext<PortalParceiroContext>();
  const [repasses, setRepasses] = useState<Repasse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("honorarios_repasses")
        .select(`
          id, valor_repasse, status, data_repasse, criado_em,
          processo_id, cliente_id, percentual_aplicado, base_calculo,
          clientes:cliente_id(nome),
          processos:processo_id(numero_cnj, nb_inss),
          honorarios_contratos:contrato_id(base_rateio, percentual_parceiro, valor_fixo_parceiro)
        `)
        .eq("parceiro_id", parceiro.id)
        .order("criado_em", { ascending: false });
      setRepasses((data as any[]) ?? []);
      setLoading(false);
    })();
  }, [parceiro.id]);

  const totais = useMemo(() => {
    const recebido = repasses.filter((r) => r.status === "pago").reduce((s, r) => s + Number(r.valor_repasse), 0);
    const pendente = repasses.filter((r) => r.status === "pendente").reduce((s, r) => s + Number(r.valor_repasse), 0);
    const ultima = repasses.find((r) => r.status === "pago");
    return { recebido, pendente, ultima };
  }, [repasses]);

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4">
        <PageHeader
          title="Meus repasses"
          description="Histórico de repasses por processo. O percentual é definido no acordo de cada processo e pode variar."
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Total recebido</div>
            <p className="font-display text-2xl text-success">{formatBRL(totais.recebido)}</p>
          </Card>
          <Card className="p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Pendente</div>
            <p className="font-display text-2xl text-amber-600">{formatBRL(totais.pendente)}</p>
          </Card>
          <Card className="p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Última transferência</div>
            <p className="font-display text-2xl">{totais.ultima ? formatDate(totais.ultima.data_repasse!) : "—"}</p>
          </Card>
        </div>

        {repasses.length === 0 ? (
          <Card className="p-12 text-center">
            <DollarSign className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">Sem repasses registrados.</p>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="grid grid-cols-12 gap-2 p-3 bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <div className="col-span-3">Processo</div>
              <div className="col-span-3">Cliente</div>
              <div className="col-span-2">Acordo do processo</div>
              <div className="col-span-2 text-right">Repasse</div>
              <div className="col-span-1">Status</div>
              <div className="col-span-1">Data</div>
            </div>
            <div className="divide-y">
              {repasses.map((r) => {
                const acordo = descreverAcordo(r);
                return (
                  <div key={r.id} className="grid grid-cols-12 gap-2 p-3 items-center text-sm">
                    <div className="col-span-3 truncate">
                      {r.processos?.numero_cnj ?? r.processos?.nb_inss ?? "—"}
                    </div>
                    <div className="col-span-3 truncate">{r.clientes?.nome ?? "—"}</div>
                    <div className="col-span-2 flex items-center gap-1.5">
                      <span className="font-medium">{acordo}</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs">
                          Percentual definido no acordo deste processo no momento do pagamento.
                          Processos diferentes podem ter percentuais diferentes conforme o que
                          foi combinado com você.
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="col-span-2 text-right font-mono">{formatBRL(Number(r.valor_repasse))}</div>
                    <div className="col-span-1">
                      <Badge variant={r.status === "pago" ? "secondary" : "outline"}>{r.status}</Badge>
                    </div>
                    <div className="col-span-1 text-xs text-muted-foreground">
                      {r.data_repasse ? formatDate(r.data_repasse) : "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </TooltipProvider>
  );
}
