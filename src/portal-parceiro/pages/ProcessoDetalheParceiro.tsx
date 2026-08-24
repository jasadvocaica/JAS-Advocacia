import { useEffect, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, FileText, MessageCircle, Clock, CheckSquare, DollarSign, Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatDate, formatBRL } from "@/lib/format";
import type { PortalParceiroContext } from "../PortalParceiroLayout";
import { ChatProcessoParceiro } from "../components/ChatProcessoParceiro";
import { registrarAcaoParceiro } from "../auditLog";

export default function ProcessoDetalheParceiro() {
  const { id } = useParams();
  const { parceiro } = useOutletContext<PortalParceiroContext>();
  const [loading, setLoading] = useState(true);
  const [proc, setProc] = useState<any>(null);
  const [andamentos, setAndamentos] = useState<any[]>([]);
  const [tarefas, setTarefas] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [repasses, setRepasses] = useState<any[]>([]);
  const [ficha, setFicha] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const [pRes, aRes, tRes, dRes, rRes, fRes] = await Promise.all([
        supabase.from("processos").select("*, clientes:cliente_id(nome)").eq("id", id).maybeSingle(),
        supabase.from("andamentos").select("*").eq("processo_id", id).order("data", { ascending: false }).limit(20),
        supabase.from("controladoria_itens").select("id, titulo, data_vencimento, status, tipo, prioridade").eq("processo_id", id).order("data_vencimento"),
        supabase.from("documentos").select("id, nome, criado_em, mime_type, url").eq("processo_id", id).limit(20),
        supabase.from("honorarios_repasses").select("id, valor_repasse, status, data_repasse, criado_em, contrato_id, honorarios_contratos:contrato_id(processo_id)").eq("parceiro_id", parceiro.id),
        supabase.from("cliente_atendimentos").select("id, titulo, area, resumo, resumo_ia, fatos, pedidos, proximos_passos, criado_em").eq("processo_id", id).order("criado_em", { ascending: false }).limit(5),
      ]);
      setProc(pRes.data);
      setAndamentos((aRes.data as any[]) ?? []);
      setTarefas((tRes.data as any[]) ?? []);
      setDocs((dRes.data as any[]) ?? []);
      setRepasses((rRes.data as any[]) ?? []);
      const fichas = (fRes.data as any[]) ?? [];
      setFicha(fichas[0] ?? null);
      setLoading(false);
    })();
  }, [id, parceiro.id]);

  const registrarAcessoDoc = async (
    documentoId: string,
    documentoNome: string,
    acao: "visualizou" | "baixou" = "visualizou",
  ) => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    // Log legacy específico de documentos (mantido)
    await supabase.from("parceiro_documento_acesso_log").insert({
      parceiro_id: parceiro.id,
      documento_id: documentoId,
      user_id: u.user.id,
      acao,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 255) : null,
    });
    // Log unificado de auditoria do parceiro
    await registrarAcaoParceiro({
      parceiroId: parceiro.id,
      acao: acao === "baixou" ? "baixou_documento" : "visualizou_documento",
      recursoTipo: "documento",
      recursoId: documentoId,
      descricao: documentoNome,
      contexto: { processo_id: id },
    });
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!proc) return <Card className="p-8 text-center">Processo não encontrado ou sem acesso.</Card>;

  return (
    <div className="space-y-4">
      <PageHeader title={proc.numero_cnj ?? proc.nb_inss ?? "Processo"} description={proc.clientes?.nome}>
        <Button asChild variant="ghost" size="sm">
          <Link to=".."><ArrowLeft className="w-4 h-4" /> Voltar</Link>
        </Button>
      </PageHeader>

      <Card className="p-4 space-y-2">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{proc.area_direito ?? "Sem área"}</Badge>
          <Badge>{proc.status.replace("_", " ")}</Badge>
          {proc.fase_atual && <Badge variant="secondary">{proc.fase_atual}</Badge>}
        </div>
        {parceiro.oab_completo && (
          <p className="text-xs text-muted-foreground">Sua atuação: {parceiro.oab_completo}</p>
        )}
      </Card>

      <Tabs defaultValue="resumo">
        <TabsList>
          <TabsTrigger value="resumo"><FileText className="w-4 h-4 mr-1" /> Resumo</TabsTrigger>
          <TabsTrigger value="timeline"><Clock className="w-4 h-4 mr-1" /> Timeline</TabsTrigger>
          <TabsTrigger value="tarefas"><CheckSquare className="w-4 h-4 mr-1" /> Tarefas</TabsTrigger>
          <TabsTrigger value="documentos"><FileText className="w-4 h-4 mr-1" /> Documentos</TabsTrigger>
          <TabsTrigger value="chat"><MessageCircle className="w-4 h-4 mr-1" /> Chat</TabsTrigger>
          <TabsTrigger value="financeiro"><DollarSign className="w-4 h-4 mr-1" /> Financeiro</TabsTrigger>
        </TabsList>

        <TabsContent value="resumo" className="space-y-2">
          {!ficha ? (
            <Card className="p-6 text-sm text-muted-foreground">Sem ficha de atendimento ou resumo de caso vinculado a este processo.</Card>
          ) : (
            <Card className="p-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium text-sm flex-1">{ficha.titulo ?? "Ficha de atendimento"}</p>
                {ficha.area && <Badge variant="outline" className="text-[10px]">{ficha.area}</Badge>}
              </div>
              {(ficha.resumo_ia || ficha.resumo) && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Resumo</p>
                  <p className="text-sm whitespace-pre-wrap">{ficha.resumo_ia || ficha.resumo}</p>
                </div>
              )}
              {ficha.fatos && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Fatos</p>
                  <p className="text-sm whitespace-pre-wrap">{ficha.fatos}</p>
                </div>
              )}
              {ficha.pedidos && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Pedidos</p>
                  <p className="text-sm whitespace-pre-wrap">{Array.isArray(ficha.pedidos) ? ficha.pedidos.join("\n") : String(ficha.pedidos)}</p>
                </div>
              )}
              {ficha.proximos_passos && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Próximos passos</p>
                  <p className="text-sm whitespace-pre-wrap">{Array.isArray(ficha.proximos_passos) ? ficha.proximos_passos.join("\n") : String(ficha.proximos_passos)}</p>
                </div>
              )}
            </Card>
          )}
        </TabsContent>

        <TabsContent value="timeline" className="space-y-2">
          {andamentos.length === 0 ? (
            <Card className="p-6 text-sm text-muted-foreground">Sem andamentos registrados.</Card>
          ) : (
            <Card className="p-4">
              <ul className="space-y-3 relative border-l border-border ml-2">
                {andamentos.map((a) => (
                  <li key={a.id} className="pl-4 relative">
                    <div className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-gold" />
                    <p className="text-xs text-muted-foreground">{formatDate(a.data)}</p>
                    <p className="text-sm">{a.descricao}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="tarefas" className="space-y-2">
          {tarefas.length === 0 ? (
            <Card className="p-6 text-sm text-muted-foreground">Nenhuma tarefa.</Card>
          ) : (
            <Card className="divide-y">
              {tarefas.map((t) => (
                <div key={t.id} className="p-3 flex items-center gap-3">
                  <Badge variant={t.status === "concluido" ? "secondary" : "outline"}>{t.status}</Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{t.titulo}</p>
                    <p className="text-xs text-muted-foreground">vence {formatDate(t.data_vencimento)}</p>
                  </div>
                  {t.tipo === "prazo_fatal" && <Badge variant="destructive" className="text-[10px]">Fatal</Badge>}
                </div>
              ))}
            </Card>
          )}
        </TabsContent>

        <TabsContent value="documentos" className="space-y-2">
          {docs.length === 0 ? (
            <Card className="p-6 text-sm text-muted-foreground">Nenhum documento liberado.</Card>
          ) : (
            <Card className="divide-y">
              {docs.map((d) => (
                <div key={d.id} className="p-3 flex items-center gap-3">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{d.nome}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(d.criado_em)}</p>
                  </div>
                  {d.url && (
                    <a href={d.url} target="_blank" rel="noreferrer" onClick={() => registrarAcessoDoc(d.id, d.nome, "visualizou")} className="text-xs text-primary hover:underline">Abrir</a>
                  )}
                </div>
              ))}
            </Card>
          )}
        </TabsContent>

        <TabsContent value="chat">
          <ChatProcessoParceiro processoId={proc.id} clienteId={proc.cliente_id} parceiroId={parceiro.id} />
        </TabsContent>

        <TabsContent value="financeiro">
          {repasses.length === 0 ? (
            <Card className="p-6 text-sm text-muted-foreground">Sem repasses registrados.</Card>
          ) : (
            <Card className="divide-y">
              {repasses.map((r) => (
                <div key={r.id} className="p-3 flex items-center gap-3">
                  <DollarSign className="w-4 h-4 text-amber-600" />
                  <div className="flex-1">
                    <p className="text-sm">{formatBRL(Number(r.valor_repasse))}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.status === "pago" ? `Recebido em ${formatDate(r.data_repasse)}` : `Gerado em ${formatDate(r.criado_em)}`}
                    </p>
                  </div>
                  <Badge variant={r.status === "pago" ? "secondary" : "outline"}>{r.status}</Badge>
                </div>
              ))}
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Card className="p-4 bg-muted/30 border-dashed">
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <Lock className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Não visível para você</p>
            <p>
              Minutas, teses, modelos do escritório, observações internas, estratégia processual,
              tarefas internas e financeiro do escritório. Você só vê o que foi explicitamente
              compartilhado com o parceiro. Acessos a documentos são auditados.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
