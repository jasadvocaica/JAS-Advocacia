import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft, Pencil, Loader2, MessageCircle, Mail, MapPin, Briefcase,
  Wallet, Users, FileText, KeyRound, AlertCircle, Eye, Download, ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatBRL, formatDate, formatCPF, formatCNPJ, formatPhone } from "@/lib/format";
import { toast } from "sonner";
import {
  Parceiro, TIPO_LABEL, STATUS_LABEL, TIPO_CLASS, STATUS_CLASS,
  PARTICIPACAO_LABEL, mascararConta,
} from "./types";
import { ParceiroAvatar } from "./ParceiroAvatar";

export default function ParceiroDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isGestor, roles } = useAuth();
  const podeEditar = isGestor || roles.includes("advogado");

  const [parc, setParc] = useState<Parceiro | null>(null);
  const [loading, setLoading] = useState(true);
  const [vinculos, setVinculos] = useState<any[]>([]);
  const [repasses, setRepasses] = useState<any[]>([]);
  const [acessos, setAcessos] = useState<any[]>([]);
  const [acessosLoading, setAcessosLoading] = useState(false);
  const [gerandoConvite, setGerandoConvite] = useState(false);
  const [conviteInfo, setConviteInfo] = useState<{ link: string; expira: string } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const [pRes, vRes, rRes] = await Promise.all([
        supabase.from("parceiros").select("*").eq("id", id!).maybeSingle(),
        supabase.from("processo_parceiros")
          .select("*, processos:processo_id(id, numero_cnj, nb_inss, status, area_direito), clientes:cliente_id(nome)")
          .eq("parceiro_id", id!)
          .order("criado_em", { ascending: false }),
        supabase.from("honorarios_repasses")
          .select("id, valor_repasse, status, data_repasse, base_calculo, contrato_id, clientes:cliente_id(nome)")
          .eq("parceiro_id", id!)
          .order("criado_em", { ascending: false })
          .limit(50),
      ]);
      if (!alive) return;
      if (!pRes.data) { toast.error("Parceiro não encontrado"); navigate("/parceiros"); return; }
      setParc(pRes.data as any);
      setVinculos((vRes.data as any[]) ?? []);
      setRepasses((rRes.data as any[]) ?? []);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [id, navigate]);

  // Carrega acessos a documentos sob demanda (quando o gestor abre a aba)
  const carregarAcessos = async () => {
    if (!id || acessos.length > 0) return;
    setAcessosLoading(true);
    const { data, error } = await supabase
      .from("parceiro_documento_acesso_log")
      .select("id, acao, criado_em, user_agent, documento_id, user_id, documentos:documento_id(nome, processo_id), profiles:user_id(nome, email)")
      .eq("parceiro_id", id)
      .order("criado_em", { ascending: false })
      .limit(200);
    setAcessosLoading(false);
    if (error) { toast.error("Erro ao carregar acessos: " + error.message); return; }
    setAcessos((data as any[]) ?? []);
  };

  const inativar = async () => {
    if (!confirm(`Inativar ${parc?.nome}? Vínculos históricos permanecerão.`)) return;
    const { error } = await supabase.from("parceiros").update({ status: "inativo", ativo: false }).eq("id", id!);
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success("Parceiro inativado");
    setParc((p) => p ? { ...p, status: "inativo", ativo: false } : p);
  };

  const reativar = async () => {
    const { error } = await supabase.from("parceiros").update({ status: "ativo", ativo: true }).eq("id", id!);
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success("Parceiro reativado");
    setParc((p) => p ? { ...p, status: "ativo", ativo: true } : p);
  };

  const gerarConvite = async () => {
    setGerandoConvite(true);
    const { data, error } = await supabase.functions.invoke("parceiro-portal", {
      body: { action: "gerar-convite", parceiro_id: id },
    });
    setGerandoConvite(false);
    if (error || data?.error) { toast.error("Erro: " + (data?.error ?? error?.message)); return; }
    setConviteInfo({ link: data.link_ativacao, expira: data.expira_em });
    toast.success("Convite gerado (válido por 48h)");
  };

  if (loading || !parc) {
    return <Card className="p-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></Card>;
  }

  const totalRecebido = repasses.filter((r) => r.status === "pago").reduce((s, r) => s + Number(r.valor_repasse), 0);
  const totalPendente = repasses.filter((r) => r.status === "pendente").reduce((s, r) => s + Number(r.valor_repasse), 0);
  const processosAtivos = vinculos.filter((v) => v.ativo).length;
  const indicados = vinculos.filter((v) => ["indicador", "correspondente_e_indicador"].includes(v.tipo_participacao));

  return (
    <div className="space-y-6">
      <PageHeader title={parc.nome} description={parc.oab_completo ?? TIPO_LABEL[parc.tipo]}>
        <Button asChild variant="ghost" size="sm">
          <Link to="/parceiros"><ArrowLeft className="w-4 h-4" /> Voltar</Link>
        </Button>
        {podeEditar && (
          <>
            <Button asChild variant="outline">
              <Link to={`/parceiros/${id}/editar`}><Pencil className="w-4 h-4" /> Editar</Link>
            </Button>
            {parc.status === "ativo" ? (
              <Button variant="outline" onClick={inativar}>Inativar</Button>
            ) : (
              <Button variant="outline" onClick={reativar}>Reativar</Button>
            )}
          </>
        )}
      </PageHeader>

      <div className="grid lg:grid-cols-[320px_1fr] gap-6">
        {/* Coluna esquerda: card fixo */}
        <div className="space-y-4">
          <Card className="p-6 space-y-4">
            <div className="flex flex-col items-center text-center">
              <ParceiroAvatar nome={parc.nome} size="xl" />
              <h2 className="font-display text-xl mt-3">{parc.nome}</h2>
              {parc.oab_completo && <p className="text-sm text-muted-foreground font-mono">{parc.oab_completo}</p>}
              <div className="flex gap-1.5 mt-3 flex-wrap justify-center">
                <Badge variant="outline" className={TIPO_CLASS[parc.tipo]}>{TIPO_LABEL[parc.tipo]}</Badge>
                <Badge variant="outline" className={STATUS_CLASS[parc.status]}>{STATUS_LABEL[parc.status]}</Badge>
              </div>
            </div>

            <div className="space-y-2 text-sm pt-3 border-t">
              {parc.whatsapp && (
                <a
                  href={`https://wa.me/55${parc.whatsapp.replace(/\D/g, "")}`}
                  target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 text-success hover:underline"
                >
                  <MessageCircle className="w-4 h-4" /> {formatPhone(parc.whatsapp)}
                </a>
              )}
              {parc.email && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="w-4 h-4 shrink-0" /> <span className="truncate">{parc.email}</span>
                </div>
              )}
              {(parc.cidade || parc.estado) && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="w-4 h-4" /> {[parc.cidade, parc.estado].filter(Boolean).join("/")}
                </div>
              )}
              {(parc.cpf || parc.cnpj) && (
                <div className="text-xs text-muted-foreground pt-1">
                  {parc.cnpj ? `CNPJ ${formatCNPJ(parc.cnpj)}` : `CPF ${formatCPF(parc.cpf!)}`}
                </div>
              )}
            </div>

            {parc.especialidades && parc.especialidades.length > 0 && (
              <div className="pt-3 border-t">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Especialidades</p>
                <div className="flex flex-wrap gap-1">
                  {parc.especialidades.map((e) => (
                    <Badge key={e} variant="outline" className="capitalize text-[10px]">{e}</Badge>
                  ))}
                </div>
              </div>
            )}

            {(parc.pix_chave || parc.banco_nome) && (
              <div className="pt-3 border-t space-y-1.5 text-xs">
                <p className="uppercase tracking-wider text-muted-foreground">Dados de repasse</p>
                {parc.pix_chave && <p><span className="text-muted-foreground">PIX ({parc.pix_tipo}):</span> {parc.pix_chave}</p>}
                {parc.banco_nome && (
                  <p>
                    <span className="text-muted-foreground">{parc.banco_nome}</span>
                    {parc.banco_agencia && <> · Ag {parc.banco_agencia}</>}
                    {parc.banco_conta && <> · {mascararConta(parc.banco_conta)}</>}
                    {parc.banco_tipo && <> ({parc.banco_tipo === "corrente" ? "C/C" : "Pp"})</>}
                  </p>
                )}
                {parc.percentual_padrao != null && (
                  <p><span className="text-muted-foreground">% padrão:</span> {Number(parc.percentual_padrao)}%</p>
                )}
              </div>
            )}
          </Card>

          {/* Portal do parceiro (gestor apenas) */}
          {isGestor && (
            <Card className="p-6 space-y-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-gold" />
                <h3 className="font-display text-base">Portal do parceiro</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                {parc.portal_ativo
                  ? `Acesso ativo. Último login: ${formatDate(parc.portal_ultimo_acesso)}`
                  : "Portal ainda não ativado. Gere um convite para envio manual."}
              </p>
              <Button variant="outline" size="sm" className="w-full" onClick={gerarConvite} disabled={gerandoConvite}>
                {gerandoConvite ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Gerar convite (48h)"}
              </Button>
              {conviteInfo && (
                <div className="text-[11px] bg-muted p-2 rounded space-y-1 break-all">
                  <p className="font-medium">Link gerado (envie manualmente):</p>
                  <p className="font-mono text-muted-foreground">{conviteInfo.link}</p>
                  <p className="text-muted-foreground">Expira em {formatDate(conviteInfo.expira)}</p>
                </div>
              )}
            </Card>
          )}
        </div>

        {/* Coluna direita: 5 abas */}
        <div>
          <Tabs defaultValue="resumo" onValueChange={(v) => { if (v === "acessos") void carregarAcessos(); }}>
            <TabsList className="grid grid-cols-6 w-full">
              <TabsTrigger value="resumo">Resumo</TabsTrigger>
              <TabsTrigger value="processos">Processos ({vinculos.length})</TabsTrigger>
              <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
              <TabsTrigger value="indicados">Indicados</TabsTrigger>
              <TabsTrigger value="acessos">Acessos</TabsTrigger>
              <TabsTrigger value="internas">Internas</TabsTrigger>
            </TabsList>

            <TabsContent value="resumo" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KpiMini icon={<Briefcase className="w-3.5 h-3.5" />} label="Processos ativos" value={String(processosAtivos)} />
                <KpiMini icon={<Wallet className="w-3.5 h-3.5 text-success" />} label="Total recebido" value={formatBRL(totalRecebido)} />
                <KpiMini icon={<AlertCircle className="w-3.5 h-3.5 text-amber-600" />} label="A repassar" value={formatBRL(totalPendente)} />
                <KpiMini icon={<Users className="w-3.5 h-3.5" />} label="Clientes indicados" value={String(indicados.length)} />
              </div>
              <Card className="p-6">
                <h3 className="font-display text-lg mb-3">Últimos processos vinculados</h3>
                {vinculos.slice(0, 5).length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Nenhum vínculo ainda.</p>
                ) : (
                  <div className="divide-y">
                    {vinculos.slice(0, 5).map((v) => (
                      <Link key={v.id} to={`/processos/${v.processo_id}`} className="flex items-center justify-between py-2.5 hover:bg-muted/40 -mx-2 px-2 rounded">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{v.clientes?.nome ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">
                            {v.processos?.numero_cnj ?? v.processos?.nb_inss ?? "Sem nº"} · {PARTICIPACAO_LABEL[v.tipo_participacao as keyof typeof PARTICIPACAO_LABEL]}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="processos" className="mt-4">
              <Card className="p-0 overflow-hidden">
                {vinculos.length === 0 ? (
                  <div className="p-12 text-center"><FileText className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" /><p className="text-sm text-muted-foreground">Nenhum processo vinculado.</p></div>
                ) : (
                  <div className="divide-y">
                    {vinculos.map((v) => (
                      <Link key={v.id} to={`/processos/${v.processo_id}`} className="flex items-center justify-between p-4 gap-3 hover:bg-muted/40 transition-colors">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium truncate">{v.clientes?.nome ?? "—"}</span>
                            <Badge variant="outline" className="text-[10px]">{PARTICIPACAO_LABEL[v.tipo_participacao as keyof typeof PARTICIPACAO_LABEL]}</Badge>
                            {!v.ativo && <Badge variant="outline" className="bg-muted text-[10px]">inativo</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {v.processos?.numero_cnj ?? v.processos?.nb_inss ?? "Sem nº"}
                            {v.processos?.area_direito && <> · {v.processos.area_direito}</>}
                            {v.percentual_atuacao != null && <> · {v.percentual_atuacao}% atuação</>}
                            {v.percentual_indicacao != null && <> · {v.percentual_indicacao}% indicação</>}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="financeiro" className="mt-4 space-y-4">
              <div className="grid sm:grid-cols-3 gap-3">
                <KpiMini label="Total recebido" value={formatBRL(totalRecebido)} />
                <KpiMini label="Pendente de repasse" value={formatBRL(totalPendente)} />
                <KpiMini label="Total de repasses" value={String(repasses.length)} />
              </div>
              <Card className="p-0 overflow-hidden">
                {repasses.length === 0 ? (
                  <div className="p-12 text-center"><Wallet className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" /><p className="text-sm text-muted-foreground">Nenhum repasse registrado.</p></div>
                ) : (
                  <div className="divide-y">
                    {repasses.map((r) => (
                      <div key={r.id} className="flex items-center justify-between p-4 gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium truncate">{r.clientes?.nome ?? "—"}</span>
                            <Badge variant="outline" className={
                              r.status === "pago" ? "bg-success/15 text-success border-success/30" :
                              "bg-amber-500/15 text-amber-600 border-amber-500/30"
                            }>{r.status}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {r.base_calculo}
                            {r.data_repasse && <> · pago em {formatDate(r.data_repasse)}</>}
                          </p>
                        </div>
                        <span className="font-mono font-medium">{formatBRL(Number(r.valor_repasse))}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="indicados" className="mt-4">
              <Card className="p-0 overflow-hidden">
                {indicados.length === 0 ? (
                  <div className="p-12 text-center"><Users className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" /><p className="text-sm text-muted-foreground">Nenhum cliente indicado por este parceiro.</p></div>
                ) : (
                  <div className="divide-y">
                    {indicados.map((v) => (
                      <Link key={v.id} to={`/clientes/${v.cliente_id}`} className="flex items-center justify-between p-4 gap-3 hover:bg-muted/40">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{v.clientes?.nome ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">
                            Indicado em {formatDate(v.criado_em)}
                            {v.percentual_indicacao != null && <> · comissão {v.percentual_indicacao}%</>}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="acessos" className="mt-4">
              <Card className="p-0 overflow-hidden">
                <div className="p-4 border-b flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-gold" />
                  <div>
                    <h3 className="font-display text-base leading-tight">Acessos do parceiro a documentos</h3>
                    <p className="text-xs text-muted-foreground">
                      Registro imutável de cada documento aberto ou baixado pelo parceiro no portal.
                    </p>
                  </div>
                </div>
                {acessosLoading ? (
                  <div className="p-12 flex justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : acessos.length === 0 ? (
                  <div className="p-12 text-center">
                    <ShieldCheck className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground">Nenhum acesso registrado ainda.</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {acessos.map((a) => {
                      const baixou = a.acao === "baixou";
                      const usuarioNome = a.profiles?.nome ?? a.profiles?.email ?? "Usuário do parceiro";
                      const docNome = a.documentos?.nome ?? "Documento removido";
                      const processoId = a.documentos?.processo_id;
                      return (
                        <div key={a.id} className="flex items-start justify-between gap-3 p-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge
                                variant="outline"
                                className={
                                  baixou
                                    ? "bg-amber-500/15 text-amber-600 border-amber-500/30 text-[10px]"
                                    : "bg-muted text-[10px]"
                                }
                              >
                                {baixou ? <><Download className="w-3 h-3" /> baixou</> : <><Eye className="w-3 h-3" /> visualizou</>}
                              </Badge>
                              {processoId ? (
                                <Link
                                  to={`/processos/${processoId}`}
                                  className="text-sm font-medium truncate hover:underline"
                                >
                                  {docNome}
                                </Link>
                              ) : (
                                <span className="text-sm font-medium truncate">{docNome}</span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              <Users className="w-3 h-3 inline mr-1" />
                              {usuarioNome}
                              {a.user_agent && (
                                <span className="ml-2 hidden sm:inline opacity-70">
                                  · {a.user_agent.split(" ")[0]}
                                </span>
                              )}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-mono">{formatDate(a.criado_em)}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {new Date(a.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="internas" className="mt-4">
              <Card className="p-6 space-y-3">
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-lg">Observações internas</h3>
                  <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-[10px]">
                    Não visível para o parceiro
                  </Badge>
                </div>
                {parc.observacoes_internas ? (
                  <p className="text-sm whitespace-pre-wrap">{parc.observacoes_internas}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhuma observação registrada.</p>
                )}
                {podeEditar && (
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/parceiros/${id}/editar`}>Editar observações</Link>
                  </Button>
                )}
              </Card>
              {parc.observacoes && (
                <Card className="p-6 space-y-2 mt-4">
                  <h3 className="font-display text-lg">Observações públicas</h3>
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">{parc.observacoes}</p>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function KpiMini({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <p className="font-display text-xl mt-1">{value}</p>
    </Card>
  );
}
