import { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Copy, Scale, RotateCw } from "lucide-react";
import { useDatajudLote } from "../useDatajudLote";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Lista de IDs de processo (em `public.processos`) a consultar. */
  processoIds: string[];
}

interface DetalheItem {
  processo_id: string;
  cnj: string;
  status: "ok" | "erro";
  novos: number;
  mensagem?: string;
}

/**
 * Dialog que dispara a edge `datajud-lote` para um conjunto de processos
 * (tipicamente os 100 importados do PDF PDPJ) e exibe progresso item-a-item
 * com a mesma estética do dialog de importação.
 */
export function ConsultarDatajudLoteDialog({ open, onOpenChange, processoIds }: Props) {
  const { job, polling, consultar } = useDatajudLote();

  // Dispara automaticamente quando o dialog abre com IDs.
  useEffect(() => {
    if (open && processoIds.length > 0 && !job) {
      void consultar(processoIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const detalhes = (job?.erros_json as unknown as DetalheItem[] | undefined) ?? [];
  const total = job?.total_registros ?? processoIds.length;
  const ok = job?.registros_ok ?? 0;
  const err = job?.registros_erro ?? 0;
  const processados = detalhes.length;
  const novosTotal = detalhes.reduce((s, d) => s + (d.novos ?? 0), 0);
  const pct = total > 0 ? Math.round((processados / total) * 100) : 0;

  const finalizado = job?.status === "concluido"
    || job?.status === "concluido_parcial"
    || job?.status === "erro";

  const copiarErros = () => {
    const erros = detalhes.filter((d) => d.status === "erro");
    const txt = erros.map((d) => `${d.cnj}\t${d.mensagem ?? ""}`).join("\n");
    navigator.clipboard.writeText(txt);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="border-b border-border pb-6">
          <p className="text-[10px] uppercase tracking-widest text-gold font-semibold mb-1">
            Atualização em lote
          </p>
          <DialogTitle className="text-2xl sm:text-3xl font-serif italic">
            Andamentos via DataJud (CNJ)
          </DialogTitle>
          <DialogDescription>
            Consultando {total} processo{total === 1 ? "" : "s"} na API pública
            do DataJud. Os andamentos novos serão gravados em cada processo e
            ficarão visíveis na aba "Andamentos" do detalhe.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pt-6 space-y-5">
          <div className="space-y-2">
            <div className="flex items-end justify-between">
              <p className="text-sm">
                {finalizado
                  ? "Concluído"
                  : `Processando ${processados}/${total}`}
              </p>
              <p className="text-xs text-muted-foreground">{pct}%</p>
            </div>
            <Progress value={pct} className="h-2" />
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline" className="border-gold/40 text-gold">
                <CheckCircle2 className="w-3 h-3 mr-1" /> {ok} ok
              </Badge>
              <Badge variant="outline" className="border-gold/40 text-gold">
                <Scale className="w-3 h-3 mr-1" /> {novosTotal} novos andamentos
              </Badge>
              {err > 0 && (
                <Badge variant="outline" className="border-destructive/40 text-destructive">
                  <XCircle className="w-3 h-3 mr-1" /> {err} erro{err === 1 ? "" : "s"}
                </Badge>
              )}
              {polling && (
                <Badge variant="secondary" className="animate-pulse">
                  em andamento
                </Badge>
              )}
            </div>
            {job?.mensagem && (
              <p className="text-xs text-muted-foreground italic">{job.mensagem}</p>
            )}
          </div>

          {detalhes.length > 0 && (
            <div className="border border-border rounded-md">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
                <p className="text-xs font-semibold uppercase tracking-wider">
                  Status por processo
                </p>
                {err > 0 && (
                  <Button variant="ghost" size="sm" onClick={copiarErros}>
                    <Copy className="w-3.5 h-3.5 mr-1" />
                    Copiar erros
                  </Button>
                )}
              </div>
              <ScrollArea className="h-[340px]">
                <ul className="divide-y divide-border">
                  {detalhes.map((d, i) => (
                    <li
                      key={`${d.cnj}-${i}`}
                      className="flex items-start gap-2 px-3 py-2 text-sm"
                    >
                      {d.status === "ok" ? (
                        <CheckCircle2 className="w-4 h-4 mt-0.5 text-gold shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 mt-0.5 text-destructive shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-xs">{d.cnj}</p>
                        {d.mensagem && (
                          <p className="text-xs text-muted-foreground truncate">
                            {d.mensagem}
                          </p>
                        )}
                      </div>
                      {d.status === "ok" && d.novos > 0 && (
                        <Badge variant="secondary" className="text-[10px]">
                          +{d.novos}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </div>
          )}

          {finalizado && (
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              {err > 0 && (
                <Button
                  variant="outline"
                  onClick={() => {
                    const idsFalhas = detalhes
                      .filter((d) => d.status === "erro")
                      .map((d) => d.processo_id);
                    if (idsFalhas.length > 0) void consultar(idsFalhas);
                  }}
                >
                  <RotateCw className="w-4 h-4 mr-2" />
                  Reenviar {err} falha{err === 1 ? "" : "s"}
                </Button>
              )}
              <Button onClick={() => onOpenChange(false)}>Fechar</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
