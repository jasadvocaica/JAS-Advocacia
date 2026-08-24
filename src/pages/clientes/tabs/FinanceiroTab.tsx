import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wallet, TrendingUp, AlertCircle, CheckCircle2, Clock, Plus, ExternalLink, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatBRL, formatDate } from "@/lib/format";
import NovoContratoDialog from "./NovoContratoDialog";

const TIPO_LABEL: Record<string, string> = {
  fixo: "Fixo",
  exito: "Êxito",
  misto: "Misto",
  mensalidade: "Mensalidade",
};

const STATUS_CONTRATO_CLASS: Record<string, string> = {
  ativo: "bg-success/15 text-success border-success/30",
  quitado: "bg-muted text-muted-foreground border-muted-foreground/30",
  inadimplente: "bg-destructive/10 text-destructive border-destructive/30",
  cancelado: "bg-muted text-muted-foreground border-muted-foreground/30",
  suspenso: "bg-amber-500/15 text-amber-600 border-amber-500/30",
};

const STATUS_PARCELA_CLASS: Record<string, string> = {
  pago: "bg-success/15 text-success border-success/30",
  pendente: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  atrasado: "bg-destructive/10 text-destructive border-destructive/30",
  negociando: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  cancelado: "bg-muted text-muted-foreground border-muted-foreground/30",
};

interface Contrato {
  id: string;
  tipo: string;
  status: string;
  valor_fixo: number | null;
  percentual_exito: number | null;
  total_parcelas: number | null;
  processo_id: string | null;
  observacoes: string | null;
  criado_em: string;
}

interface Parcela {
  id: string;
  contrato_id: string;
  numero_parcela: number;
  valor: number;
  data_vencimento: string;
  status: string;
}

interface Pagamento {
  id: string;
  contrato_id: string;
  valor_recebido: number;
  data_pagamento: string;
  forma_pagamento: string;
  tipo_pagamento: string;
}

interface Props {
  clienteId: string;
}

export default function FinanceiroTab({ clienteId }: Props) {
  const { hasPermission } = useAuth();
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [processos, setProcessos] = useState<Record<string, { numero_cnj: string | null; tipo_acao: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [novoContratoOpen, setNovoContratoOpen] = useState(false);

  async function excluirContrato(c: Contrato) {
    const pags = pagamentos.filter(p => p.contrato_id === c.id);
    if (pags.length > 0) {
      toast.error("Este contrato possui pagamentos registrados. Exclua os pagamentos primeiro.");
      return;
    }
    const { error } = await supabase.from("honorarios_contratos").delete().eq("id", c.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Contrato excluído. Parcelas e repasses vinculados foram removidos.");
    setRefreshKey(k => k + 1);
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const { data: cons } = await supabase
        .from("honorarios_contratos")
        .select("*")
        .eq("cliente_id", clienteId)
        .order("criado_em", { ascending: false });
      const conList = (cons as Contrato[]) ?? [];
      const conIds = conList.map((c) => c.id);
      const procIds = Array.from(new Set(conList.map((c) => c.processo_id).filter(Boolean) as string[]));

      const [parcRes, pagRes, procRes] = await Promise.all([
        conIds.length
          ? supabase.from("honorarios_parcelas").select("*").in("contrato_id", conIds).order("data_vencimento", { ascending: true })
          : Promise.resolve({ data: [] } as any),
        conIds.length
          ? supabase.from("honorarios_pagamentos").select("*").in("contrato_id", conIds).order("data_pagamento", { ascending: false })
          : Promise.resolve({ data: [] } as any),
        procIds.length
          ? supabase.from("processos").select("id, numero_cnj, tipo_acao").in("id", procIds)
          : Promise.resolve({ data: [] } as any),
      ]);

      if (!alive) return;
      setContratos(conList);
      setParcelas(((parcRes as any).data as Parcela[]) ?? []);
      setPagamentos(((pagRes as any).data as Pagamento[]) ?? []);
      const map: Record<string, any> = {};
      ((procRes as any).data ?? []).forEach((p: any) => { map[p.id] = p; });
      setProcessos(map);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [clienteId, refreshKey]);

  if (loading) {
    return (
      <Card className="p-10 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const totalRecebido = pagamentos.reduce((s, p) => s + Number(p.valor_recebido), 0);
  const totalAReceber = parcelas
    .filter((p) => p.status === "pendente" && new Date(p.data_vencimento) >= hoje)
    .reduce((s, p) => s + Number(p.valor), 0);
  const totalAtrasado = parcelas
    .filter((p) => p.status === "atrasado" || (p.status === "pendente" && new Date(p.data_vencimento) < hoje))
    .reduce((s, p) => s + Number(p.valor), 0);

  function parcsDoContrato(cid: string) {
    return parcelas.filter((p) => p.contrato_id === cid);
  }
  function pagsDoContrato(cid: string) {
    return pagamentos.filter((p) => p.contrato_id === cid);
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <CheckCircle2 className="w-3.5 h-3.5 text-success" /> Recebido
          </div>
          <p className="font-display text-2xl mt-1">{formatBRL(totalRecebido)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Clock className="w-3.5 h-3.5 text-amber-600" /> A receber
          </div>
          <p className="font-display text-2xl mt-1">{formatBRL(totalAReceber)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <AlertCircle className="w-3.5 h-3.5 text-destructive" /> Em atraso
          </div>
          <p className="font-display text-2xl mt-1">{formatBRL(totalAtrasado)}</p>
        </Card>
      </div>

      {/* Contratos */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-gold" />
            <h3 className="font-display text-lg">Contratos de honorários</h3>
            <Badge variant="outline" className="ml-2">{contratos.length}</Badge>
          </div>
          {hasPermission("financeiro", "criar") && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="gold" onClick={() => setNovoContratoOpen(true)}>
                <Plus className="w-4 h-4 mr-1.5" /> Lançar contrato
              </Button>
              <Button size="sm" variant="ghost" asChild title="Abrir formulário completo">
                <Link to={`/financeiro/contratos/novo?cliente=${clienteId}`}>
                  <ExternalLink className="w-4 h-4" />
                </Link>
              </Button>
            </div>
          )}
        </div>

        <NovoContratoDialog
          open={novoContratoOpen}
          onOpenChange={setNovoContratoOpen}
          clienteId={clienteId}
          onCriado={() => setRefreshKey((k) => k + 1)}
        />

        {contratos.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhum contrato cadastrado para este cliente.
          </p>
        ) : (
          <div className="space-y-3">
            {contratos.map((c) => {
              const parcs = parcsDoContrato(c.id);
              const pags = pagsDoContrato(c.id);
              const recebido = pags.reduce((s, p) => s + Number(p.valor_recebido), 0);
              const total = parcs.reduce((s, p) => s + Number(p.valor), 0) || Number(c.valor_fixo ?? 0);
              const proc = c.processo_id ? processos[c.processo_id] : null;
              return (
                <div key={c.id} className="rounded-lg border bg-card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link to={`/financeiro/contratos/${c.id}`} className="font-medium hover:text-gold">
                          {TIPO_LABEL[c.tipo] ?? c.tipo}
                        </Link>
                        <Badge variant="outline" className={STATUS_CONTRATO_CLASS[c.status] ?? ""}>
                          {c.status}
                        </Badge>
                        {proc && (
                          <Link
                            to={`/processos/${c.processo_id}`}
                            className="text-xs text-gold hover:underline inline-flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" />
                            {proc.numero_cnj ?? proc.tipo_acao ?? "processo"}
                          </Link>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-x-3">
                        {c.valor_fixo != null && <span>Valor: {formatBRL(Number(c.valor_fixo))}</span>}
                        {c.percentual_exito != null && <span>Êxito: {Number(c.percentual_exito)}%</span>}
                        {c.total_parcelas != null && c.total_parcelas > 1 && <span>{c.total_parcelas}x</span>}
                      </div>
                    </div>
                    {total > 0 && (
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Recebido</p>
                        <p className="text-sm font-medium">
                          {formatBRL(recebido)} / {formatBRL(total)}
                        </p>
                        <div className="w-32 h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                          <div
                            className="h-full bg-success transition-all"
                            style={{ width: `${total > 0 ? Math.min(100, (recebido / total) * 100) : 0}%` }}
                          />
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-1 ml-auto">
                      {hasPermission("financeiro", "editar") && (
                        <Button asChild size="icon" variant="ghost" className="h-8 w-8" title="Editar contrato">
                          <Link to={`/financeiro/contratos/${c.id}/editar`}>
                            <Pencil className="w-4 h-4" />
                          </Link>
                        </Button>
                      )}
                      {hasPermission("financeiro", "excluir") && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-8 w-8" title="Excluir contrato">
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir contrato?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta ação remove o contrato <strong>{TIPO_LABEL[c.tipo] ?? c.tipo}</strong> e
                                todas as parcelas e repasses vinculados. Pagamentos já registrados precisam ser
                                excluídos antes. Esta ação não pode ser desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => excluirContrato(c)} className="bg-destructive hover:bg-destructive/90">
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>

                  {parcs.length > 0 && (
                    <div className="border-t pt-3 space-y-1.5">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Parcelas</p>
                      {parcs.slice(0, 6).map((p) => {
                        const atrasado = p.status === "pendente" && new Date(p.data_vencimento) < hoje;
                        const statusKey = atrasado ? "atrasado" : p.status;
                        return (
                          <div key={p.id} className="flex items-center justify-between text-xs gap-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className={`text-[10px] ${STATUS_PARCELA_CLASS[statusKey] ?? ""}`}>
                                {statusKey}
                              </Badge>
                              <span className="text-muted-foreground">
                                #{p.numero_parcela} · venc. {formatDate(p.data_vencimento)}
                              </span>
                            </div>
                            <span className="font-mono font-medium">{formatBRL(Number(p.valor))}</span>
                          </div>
                        );
                      })}
                      {parcs.length > 6 && (
                        <Link to={`/financeiro/contratos/${c.id}`} className="text-xs text-gold hover:underline">
                          ver todas as {parcs.length} parcelas →
                        </Link>
                      )}
                    </div>
                  )}

                  {c.observacoes && (
                    <p className="text-xs text-muted-foreground italic border-t pt-2">{c.observacoes}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {(parcelas.length > 0 || pagamentos.length > 0) && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-gold" />
            <h3 className="font-display text-lg">Resumo geral</h3>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Parcelas</p>
              <p className="font-medium">{parcelas.length}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pagamentos</p>
              <p className="font-medium text-success">{pagamentos.length}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Em aberto</p>
              <p className="font-medium text-amber-600">
                {parcelas.filter((p) => p.status === "pendente" || p.status === "atrasado").length}
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
