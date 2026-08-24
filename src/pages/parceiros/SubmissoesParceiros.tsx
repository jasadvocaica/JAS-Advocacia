import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/layout/PageHeader";
import { Loader2, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import { Link } from "react-router-dom";

type Tipo = "cliente" | "processo" | "andamento" | "documento";
type StatusSub = "pendente" | "aprovado" | "rejeitado" | "cancelado";

interface Submissao {
  id: string;
  parceiro_id: string;
  tipo: Tipo;
  status: StatusSub;
  titulo: string;
  payload: any;
  processo_id: string | null;
  cliente_id: string | null;
  registro_criado_id: string | null;
  motivo_rejeicao: string | null;
  observacoes_parceiro: string | null;
  criado_em: string;
  revisado_em: string | null;
  parceiros: { nome: string; oab_completo: string | null } | null;
}

interface Cliente { id: string; nome: string; cpf_cnpj: string | null; }

const TIPO_LABEL: Record<Tipo, string> = {
  cliente: "Cliente", processo: "Processo", andamento: "Andamento", documento: "Documento",
};

export default function SubmissoesParceiros() {
  const [tab, setTab] = useState<StatusSub>("pendente");
  const [lista, setLista] = useState<Submissao[]>([]);
  const [loading, setLoading] = useState(true);
  const [revisar, setRevisar] = useState<Submissao | null>(null);

  async function carregar() {
    setLoading(true);
    const { data, error } = await supabase
      .from("parceiro_submissoes")
      .select("*, parceiros:parceiros(nome, oab_completo)")
      .eq("status", tab)
      .order("criado_em", { ascending: false })
      .limit(100);
    if (error) toast.error(error.message);
    setLista((data as any) ?? []);
    setLoading(false);
  }

  useEffect(() => { carregar(); }, [tab]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Submissões de parceiros"
        description="Aprove ou rejeite cadastros, processos, andamentos e documentos enviados pelos parceiros."
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as StatusSub)}>
        <TabsList>
          <TabsTrigger value="pendente">Pendentes</TabsTrigger>
          <TabsTrigger value="aprovado">Aprovados</TabsTrigger>
          <TabsTrigger value="rejeitado">Rejeitados</TabsTrigger>
          <TabsTrigger value="cancelado">Cancelados</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          <Card className="p-4">
            {loading && <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}
            {!loading && lista.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">Nada por aqui.</p>
            )}
            <div className="space-y-2">
              {lista.map((s) => (
                <div key={s.id} className="flex items-start justify-between gap-3 p-3 rounded-md border border-border bg-card">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{TIPO_LABEL[s.tipo]}</Badge>
                      <span className="font-medium text-sm">{s.titulo}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Por <span className="font-medium">{s.parceiros?.nome ?? "—"}</span>
                      {s.parceiros?.oab_completo && ` (${s.parceiros.oab_completo})`}
                      {" · "}{formatDate(s.criado_em)}
                    </p>
                    {s.status === "rejeitado" && s.motivo_rejeicao && (
                      <p className="text-xs text-destructive mt-1">Motivo: {s.motivo_rejeicao}</p>
                    )}
                    {s.registro_criado_id && (
                      <LinkRegistroCriado tipo={s.tipo} id={s.registro_criado_id} />
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => setRevisar(s)}>
                      Ver detalhes
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {revisar && (
        <DialogRevisao
          submissao={revisar}
          onClose={(salvou) => { setRevisar(null); if (salvou) carregar(); }}
        />
      )}
    </div>
  );
}

function LinkRegistroCriado({ tipo, id }: { tipo: Tipo; id: string }) {
  const map: Record<Tipo, string> = {
    cliente: `/clientes/${id}`,
    processo: `/processos/${id}`,
    andamento: `/processos`,
    documento: `/processos`,
  };
  return (
    <Link to={map[tipo]} className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1">
      <ExternalLink className="w-3 h-3" /> Ver registro criado
    </Link>
  );
}

function DialogRevisao({
  submissao, onClose,
}: { submissao: Submissao; onClose: (salvou: boolean) => void }) {
  const [salvando, setSalvando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteVinculo, setClienteVinculo] = useState<string>(submissao.cliente_id ?? "");

  useEffect(() => {
    if (submissao.tipo === "processo") {
      supabase.from("clientes").select("id, nome, cpf_cnpj").eq("ativo", true).order("nome").limit(500)
        .then(({ data }) => setClientes((data as any) ?? []));
    }
  }, [submissao.tipo]);

  async function aprovar() {
    if (submissao.tipo === "processo" && !clienteVinculo) {
      toast.error("Selecione um cliente para vincular o processo");
      return;
    }
    setSalvando(true);
    try {
      // Para processo, atualiza cliente_id antes de aprovar
      if (submissao.tipo === "processo" && clienteVinculo !== submissao.cliente_id) {
        const { error: upErr } = await supabase
          .from("parceiro_submissoes")
          .update({ cliente_id: clienteVinculo })
          .eq("id", submissao.id);
        if (upErr) throw upErr;
      }
      const { error } = await supabase.rpc("aprovar_submissao_parceiro", { _id: submissao.id });
      if (error) throw error;
      toast.success("Submissão aprovada");
      onClose(true);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao aprovar");
    } finally { setSalvando(false); }
  }

  async function rejeitar() {
    if (!motivo.trim()) { toast.error("Informe o motivo"); return; }
    setSalvando(true);
    try {
      const { error } = await supabase.rpc("rejeitar_submissao_parceiro", { _id: submissao.id, _motivo: motivo });
      if (error) throw error;
      toast.success("Submissão rejeitada");
      onClose(true);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao rejeitar");
    } finally { setSalvando(false); }
  }

  const podeRevisar = submissao.status === "pendente";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{TIPO_LABEL[submissao.tipo]} · {submissao.titulo}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="text-xs text-muted-foreground">
            Parceiro: <span className="font-medium text-foreground">{submissao.parceiros?.nome}</span>
            {" · "}Enviado em {formatDate(submissao.criado_em)}
          </div>

          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1.5">
            {Object.entries(submissao.payload ?? {}).map(([k, v]) => (
              v == null || v === "" ? null : (
                <div key={k} className="grid grid-cols-[140px_1fr] gap-2 text-xs">
                  <span className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</span>
                  <span className="break-words">
                    {typeof v === "string" && v.startsWith("http")
                      ? <a className="text-primary hover:underline" href={v} target="_blank" rel="noreferrer">{v}</a>
                      : String(v)}
                  </span>
                </div>
              )
            ))}
          </div>

          {podeRevisar && submissao.tipo === "processo" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Vincular ao cliente *</Label>
              <Select value={clienteVinculo} onValueChange={setClienteVinculo}>
                <SelectTrigger><SelectValue placeholder="Selecione o cliente…" /></SelectTrigger>
                <SelectContent>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}{c.cpf_cnpj ? ` — ${c.cpf_cnpj}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Se o cliente ainda não existe, cadastre-o antes (a indicação do parceiro pode estar na fila como tipo "cliente").
              </p>
            </div>
          )}

          {podeRevisar && (
            <div className="space-y-1.5">
              <Label className="text-xs">Motivo (apenas para rejeitar)</Label>
              <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Explique ao parceiro por que está rejeitando…" />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onClose(false)} disabled={salvando}>Fechar</Button>
          {podeRevisar && (
            <>
              <Button variant="destructive" onClick={rejeitar} disabled={salvando}>
                <XCircle className="w-4 h-4 mr-1.5" /> Rejeitar
              </Button>
              <Button onClick={aprovar} disabled={salvando}>
                {salvando ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" />}
                Aprovar
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
