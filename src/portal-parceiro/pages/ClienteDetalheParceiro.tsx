import { useEffect, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, MessageCircle, Lock, User, MapPin, Mail, Briefcase, FileText } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCpfCnpj, formatDate } from "@/lib/format";
import type { PortalParceiroContext } from "../PortalParceiroLayout";
import { registrarAcaoParceiro } from "../auditLog";

export default function ClienteDetalheParceiro() {
  const { id } = useParams();
  const { parceiro } = useOutletContext<PortalParceiroContext>();
  const [loading, setLoading] = useState(true);
  const [cliente, setCliente] = useState<any>(null);
  const [processos, setProcessos] = useState<any[]>([]);
  const [atendimentos, setAtendimentos] = useState<any[]>([]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const [cRes, pRes, aRes] = await Promise.all([
        supabase
          .from("clientes")
          .select("id, nome, cpf_cnpj, tipo_pessoa, email, whatsapp, cidade, estado, status, profissao, autoriza_parceiro_ver_whatsapp, criado_em")
          .eq("id", id)
          .maybeSingle(),
        supabase
          .from("processos")
          .select("id, numero_cnj, nb_inss, area_direito, status, fase_atual")
          .eq("cliente_id", id)
          .order("criado_em", { ascending: false }),
        supabase
          .from("cliente_atendimentos")
          .select("id, titulo, area, status, resumo, resumo_ia, criado_em, processo_id")
          .eq("cliente_id", id)
          .order("criado_em", { ascending: false })
          .limit(20),
      ]);
      setCliente(cRes.data);
      setProcessos((pRes.data as any[]) ?? []);
      setAtendimentos((aRes.data as any[]) ?? []);
      setLoading(false);

      if (cRes.data) {
        void registrarAcaoParceiro({
          parceiroId: parceiro.id,
          acao: "acessou_processo_detalhe",
          recursoTipo: "cliente" as any,
          recursoId: id,
          descricao: `Abriu ficha do cliente ${cRes.data.nome}`,
        });
      }
    })();
  }, [id, parceiro.id]);

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!cliente) return <Card className="p-8 text-center">Cliente não encontrado ou sem acesso.</Card>;

  const podeVerWhatsapp = !!cliente.autoriza_parceiro_ver_whatsapp;

  return (
    <div className="space-y-4">
      <PageHeader title={cliente.nome} description={cliente.cpf_cnpj ? formatCpfCnpj(cliente.cpf_cnpj) : "—"}>
        <Button asChild variant="ghost" size="sm">
          <Link to=".."><ArrowLeft className="w-4 h-4" /> Voltar</Link>
        </Button>
      </PageHeader>

      <Card className="p-4 grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-muted-foreground" />
            <span>{cliente.tipo_pessoa === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"}</span>
            <Badge variant="outline">{cliente.status ?? "—"}</Badge>
          </div>
          {cliente.profissao && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Briefcase className="w-4 h-4" /> {cliente.profissao}
            </div>
          )}
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="w-4 h-4" />
            {[cliente.cidade, cliente.estado].filter(Boolean).join(" - ") || "—"}
          </div>
          {cliente.email && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="w-4 h-4" /> {cliente.email}
            </div>
          )}
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-muted-foreground" />
            {podeVerWhatsapp && cliente.whatsapp ? (
              <span className="font-mono">{cliente.whatsapp}</span>
            ) : (
              <span className="text-muted-foreground italic flex items-center gap-1">
                <Lock className="w-3 h-3" /> WhatsApp protegido — aguardando autorização do cliente
              </span>
            )}
          </div>
        </div>
        <div className="text-xs text-muted-foreground bg-muted/30 rounded-md p-3 border border-dashed">
          <p className="font-medium text-foreground mb-1 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" /> Privacidade do cliente
          </p>
          <p>
            O contato direto (WhatsApp) só fica visível para você quando o próprio cliente autoriza
            o compartilhamento com parceiros indicados. Renda, documentos pessoais, observações
            internas e cofre de credenciais permanecem ocultos.
          </p>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Briefcase className="w-4 h-4" />
          <h3 className="font-medium">Processos do cliente</h3>
          <Badge variant="secondary">{processos.length}</Badge>
        </div>
        {processos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum processo vinculado.</p>
        ) : (
          <div className="divide-y">
            {processos.map((p) => (
              <Link
                key={p.id}
                to={`../processos/${p.id}`}
                className="flex items-center gap-3 py-2.5 hover:bg-muted/30 -mx-2 px-2 rounded-md"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono truncate">{p.numero_cnj ?? p.nb_inss ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{p.area_direito ?? "Sem área"} · {p.fase_atual ?? "—"}</p>
                </div>
                <Badge>{p.status?.replace("_", " ")}</Badge>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4" />
          <h3 className="font-medium">Fichas de atendimento / Resumos de caso</h3>
          <Badge variant="secondary">{atendimentos.length}</Badge>
        </div>
        {atendimentos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma ficha de atendimento.</p>
        ) : (
          <div className="space-y-2">
            {atendimentos.map((a) => (
              <div key={a.id} className="border border-border/60 rounded-md p-3 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium flex-1 min-w-0 truncate">{a.titulo ?? "Atendimento"}</p>
                  {a.area && <Badge variant="outline" className="text-[10px]">{a.area}</Badge>}
                  <Badge variant="secondary" className="text-[10px]">{a.status ?? "—"}</Badge>
                  <span className="text-[10px] text-muted-foreground">{formatDate(a.criado_em)}</span>
                </div>
                {(a.resumo_ia || a.resumo) && (
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-6">
                    {a.resumo_ia || a.resumo}
                  </p>
                )}
                {a.processo_id && (
                  <Link
                    to={`../processos/${a.processo_id}`}
                    className="text-[11px] text-primary hover:underline"
                  >
                    Ver processo relacionado →
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
