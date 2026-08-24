import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, Edit, Loader2, Plus, ExternalLink, Wallet, FileText, Trash2, CheckCircle2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatBRL, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { RegistrarPagamentoDialog } from "./RegistrarPagamentoDialog";

const TIPO_LABEL: Record<string, string> = {
  fixo: "Fixo", exito: "Êxito", misto: "Misto", mensalidade: "Mensalidade",
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

export default function ContratoDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [loading, setLoading] = useState(true);
  const [contrato, setContrato] = useState<any>(null);
  const [parcelas, setParcelas] = useState<any[]>([]);
  const [pagamentos, setPagamentos] = useState<any[]>([]);
  const [repasses, setRepasses] = useState<any[]>([]);
  const [openPagamento, setOpenPagamento] = useState(false);
  const [parcelaSelecionada, setParcelaSelecionada] = useState<any>(null);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const { data: c } = await supabase
      .from("honorarios_contratos")
      .select("*, clientes:cliente_id(nome), processos:processo_id(numero_cnj, tipo_acao), parceiros:parceiro_id(nome)")
      .eq("id", id)
      .maybeSingle();
    if (!c) { toast.error("Contrato não encontrado"); navigate("/financeiro/contratos"); return; }
    setContrato(c);

    const [parc, pag, rep] = await Promise.all([
      supabase.from("honorarios_parcelas").select("*").eq("contrato_id", id).order("numero_parcela"),
      supabase.from("honorarios_pagamentos").select("*").eq("contrato_id", id).order("data_pagamento", { ascending: false }),
      supabase.from("honorarios_repasses").select("*").eq("contrato_id", id).order("criado_em", { ascending: false }),
    ]);
    setParcelas((parc.data as any[]) ?? []);
    setPagamentos((pag.data as any[]) ?? []);
    setRepasses((rep.data as any[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const handleDelete = async () => {
    if (!id) return;
    const { error } = await supabase.from("honorarios_contratos").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir: " + error.message); return; }
    toast.success("Contrato excluído");
    navigate("/financeiro/contratos");
  };

  const excluirPagamento = async (pagamento: any) => {
    const { data: removido, error } = await supabase
      .from("honorarios_pagamentos")
      .delete()
      .eq("id", pagamento.id)
      .select("id")
      .maybeSingle();

    if (error) { toast.error("Erro ao excluir pagamento: " + error.message); return; }
    if (!removido) { toast.error("Pagamento não removido. Verifique se seu perfil tem permissão para excluir no Financeiro."); return; }

    toast.success("Pagamento excluído. A parcela vinculada foi reaberta.");
    load();
  };

  const abrirPagamento = (parcela: any | null) => {
    setParcelaSelecionada(parcela);
    setOpenPagamento(true);
  };

  if (loading || !contrato) {
    return <Card className="p-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></Card>;
  }

  const totalParcelas = parcelas.reduce((s, p) => s + Number(p.valor), 0);
  const totalRecebido = pagamentos.reduce((s, p) => s + Number(p.valor_recebido), 0);
  const total = totalParcelas || Number(contrato.valor_fixo ?? 0);
  const progresso = total > 0 ? Math.min(100, (totalRecebido / total) * 100) : 0;

  return (
    <>
      <div className="space-y-6">
        <PageHeader
          title={`Contrato — ${contrato.clientes?.nome ?? "Cliente"}`}
          description={`${TIPO_LABEL[contrato.tipo] ?? contrato.tipo} · criado em ${formatDate(contrato.criado_em)}`}
        >
          <Button asChild variant="ghost" size="sm">
            <Link to="/financeiro/contratos"><ArrowLeft className="w-4 h-4" /> Voltar</Link>
          </Button>
          {hasPermission("financeiro", "editar") && (
            <Button asChild variant="outline" size="sm">
              <Link to={`/financeiro/contratos/${id}/editar`}><Edit className="w-4 h-4" /> Editar</Link>
            </Button>
          )}
          {hasPermission("financeiro", "criar") && (
            <Button onClick={() => abrirPagamento(null)} variant="gold" size="sm">
              <Plus className="w-4 h-4" /> Registrar pagamento
            </Button>
          )}
          {hasPermission("financeiro", "excluir") && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir contrato?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Todas as parcelas, pagamentos e repasses ligados serão removidos. Essa ação não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </PageHeader>

        {/* Resumo */}
        <div className="grid lg:grid-cols-3 gap-3">
          <Card className="p-4 lg:col-span-2 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={STATUS_CONTRATO_CLASS[contrato.status] ?? ""}>{contrato.status}</Badge>
              <Badge variant="outline">{TIPO_LABEL[contrato.tipo] ?? contrato.tipo}</Badge>
              {contrato.processos && (
                <Link to={`/processos/${contrato.processo_id}`} className="text-xs text-gold hover:underline inline-flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" />
                  {contrato.processos.numero_cnj ?? contrato.processos.tipo_acao ?? "processo"}
                </Link>
              )}
            </div>
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              {contrato.valor_fixo != null && <Info label="Valor fixo" value={formatBRL(Number(contrato.valor_fixo))} />}
              {contrato.percentual_exito != null && <Info label="Êxito" value={`${Number(contrato.percentual_exito)}%`} />}
              {contrato.total_parcelas != null && <Info label="Parcelas" value={`${contrato.total_parcelas}x`} />}
              {contrato.dia_vencimento != null && <Info label="Dia de vencimento" value={String(contrato.dia_vencimento)} />}
              {contrato.data_assinatura && <Info label="Assinado em" value={formatDate(contrato.data_assinatura)} />}
              {contrato.parceiros && <Info label="Parceiro" value={`${contrato.parceiros.nome} (${contrato.percentual_parceiro ?? 0}%)`} />}
            </div>
            {contrato.observacoes && (
              <div className="text-xs text-muted-foreground italic border-t pt-2">{contrato.observacoes}</div>
            )}
          </Card>

          <Card className="p-4 space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Recebido</div>
            <p className="font-display text-2xl">{formatBRL(totalRecebido)}</p>
            <p className="text-xs text-muted-foreground">de {formatBRL(total)}</p>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-success transition-all" style={{ width: `${progresso}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">{progresso.toFixed(1)}% concluído</p>
          </Card>
        </div>

        {/* Parcelas */}
        {parcelas.length > 0 && (
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-4 h-4 text-gold" />
              <h3 className="font-display text-lg">Parcelas</h3>
              <Badge variant="outline" className="ml-2">{parcelas.length}</Badge>
            </div>
            <div className="divide-y">
              {parcelas.map((p) => {
                const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
                const venc = new Date(p.data_vencimento + "T00:00:00");
                const atrasado = p.status === "pendente" && venc < hoje;
                const statusKey = atrasado ? "atrasado" : p.status;
                return (
                  <div key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <Badge variant="outline" className={STATUS_PARCELA_CLASS[statusKey] ?? ""}>{statusKey}</Badge>
                      <span className="text-sm">
                        <span className="font-medium">#{p.numero_parcela}</span>
                        <span className="text-muted-foreground"> · venc. {formatDate(p.data_vencimento)}</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-medium">{formatBRL(Number(p.valor))}</span>
                      {p.status !== "pago" && hasPermission("financeiro", "criar") && (
                        <Button size="sm" variant="ghost" onClick={() => abrirPagamento(p)}>
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Pagar
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Pagamentos */}
        {pagamentos.length > 0 && (
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Wallet className="w-4 h-4 text-gold" />
              <h3 className="font-display text-lg">Pagamentos recebidos</h3>
              <Badge variant="outline" className="ml-2">{pagamentos.length}</Badge>
            </div>
            <div className="divide-y">
              {pagamentos.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2.5 gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{formatDate(p.data_pagamento)} · {p.forma_pagamento}</p>
                    {p.observacao && <p className="text-xs text-muted-foreground truncate">{p.observacao}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{p.tipo_pagamento}</Badge>
                    <span className="font-mono font-medium text-success">{formatBRL(Number(p.valor_recebido))}</span>
                    {hasPermission("financeiro", "excluir") && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" title="Excluir pagamento">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir pagamento?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta ação remove o pagamento de <strong>{formatBRL(Number(p.valor_recebido))}</strong> em {formatDate(p.data_pagamento)}.
                              <br /><br />
                              A parcela vinculada será reaberta como <strong>pendente</strong> e os repasses vinculados serão removidos automaticamente.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => excluirPagamento(p)} className="bg-destructive hover:bg-destructive/90">
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Repasses */}
        {repasses.length > 0 && (
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Wallet className="w-4 h-4 text-gold" />
              <h3 className="font-display text-lg">Repasses ao parceiro</h3>
              <Badge variant="outline" className="ml-2">{repasses.length}</Badge>
            </div>
            <div className="divide-y">
              {repasses.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2.5 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={
                      r.status === "pago" ? STATUS_PARCELA_CLASS.pago :
                      r.status === "pendente" ? STATUS_PARCELA_CLASS.pendente :
                      "bg-muted text-muted-foreground"
                    }>{r.status}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {r.percentual_aplicado != null ? `${r.percentual_aplicado}%` : "fixo"} · {r.base_calculo}
                    </span>
                  </div>
                  <span className="font-mono font-medium">{formatBRL(Number(r.valor_repasse))}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      <RegistrarPagamentoDialog
        open={openPagamento}
        onOpenChange={setOpenPagamento}
        contratoId={id!}
        clienteId={contrato.cliente_id}
        parcela={parcelaSelecionada}
        sugestaoValor={parcelaSelecionada?.valor}
        onSuccess={() => { setOpenPagamento(false); load(); }}
      />
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
