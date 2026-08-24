import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, Pencil, Mail, Phone, CalendarDays, Building2 } from "lucide-react";
import { LABEL_CARGO, LABEL_VINCULO, LABEL_STATUS_FOLHA, type MembroEquipe, type Folha, type Desempenho, type ComissaoExito } from "./types";
import { formatBRL } from "@/lib/format";
import { toast } from "sonner";
import { DadosPessoaisTabEdit } from "./abas/DadosPessoaisTabEdit";
import { RemuneracaoTabEdit } from "./abas/RemuneracaoTabEdit";
import { MetasTabEdit } from "./abas/MetasTabEdit";
import { BeneficiosTabEdit } from "./abas/BeneficiosTabEdit";
import { LancamentosTabEdit } from "./abas/LancamentosTabEdit";
import { DocumentosTabEdit } from "./abas/DocumentosTabEdit";
import { JornadaTabEdit } from "./abas/JornadaTabEdit";
import { RelatorioHorasTab } from "./abas/RelatorioHorasTab";

export default function EquipeDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isGestor } = useAuth();
  const [membro, setMembro] = useState<MembroEquipe | null>(null);
  const [folhas, setFolhas] = useState<Folha[]>([]);
  const [desemps, setDesemps] = useState<Desempenho[]>([]);
  const [comissoes, setComissoes] = useState<ComissaoExito[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const { data: m } = await supabase.from("equipe_membros").select("*").eq("id", id).maybeSingle();
    setMembro(m as any);
    if (isGestor) {
      const { data: f } = await supabase.from("equipe_folha_pagamento").select("*").eq("membro_id", id).order("ano", { ascending: false }).order("mes", { ascending: false });
      setFolhas((f ?? []) as any);
      const { data: c } = await supabase.from("equipe_comissoes_exito").select("*").eq("membro_id", id).order("criado_em", { ascending: false }).limit(50);
      setComissoes((c ?? []) as any);
    }
    const { data: d } = await supabase.from("equipe_desempenho").select("*").eq("membro_id", id).order("ano", { ascending: false }).order("mes", { ascending: false });
    setDesemps((d ?? []) as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id, isGestor]);

  const dispararJob = async (apenas: "desempenho" | "folha" | "ambos") => {
    toast.info(`Disparando ${apenas}...`);
    const { data, error } = await supabase.functions.invoke("equipe-job-mensal", { body: { modo: "manual", apenas } });
    if (error) toast.error("Erro", { description: error.message });
    else { toast.success(`OK: ${JSON.stringify(data)}`); load(); }
  };

  if (loading) return <p className="text-center py-12 text-muted-foreground">Carregando...</p>;
  if (!membro) return <p className="text-center py-12 text-muted-foreground">Membro não encontrado.</p>;

  const iniciais = membro.nome.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  const desempenhoAtual = desemps[0];

  return (
    <div className="space-y-6">
      <PageHeader title={membro.nome} description={`${LABEL_CARGO[membro.cargo]} · ${LABEL_VINCULO[membro.tipo_vinculo]}`}>
        <Button variant="outline" onClick={() => navigate("/equipe")}><ArrowLeft className="w-4 h-4" /> Voltar</Button>
        {isGestor && <Button variant="gold" asChild><Link to={`/equipe/${id}/editar`}><Pencil className="w-4 h-4" /> Edição rápida</Link></Button>}
      </PageHeader>

      <div className="grid lg:grid-cols-[280px_1fr] gap-6">
        {/* Coluna esquerda: resumo */}
        <Card><CardContent className="p-5 space-y-4">
          <div className="flex flex-col items-center gap-3">
            <Avatar className="w-20 h-20 bg-sidebar text-gold">
              <AvatarFallback className="bg-sidebar text-gold text-xl font-display">{iniciais}</AvatarFallback>
            </Avatar>
            <Badge variant="outline" className={
              membro.status === "ativo" ? "bg-success/15 text-success border-success/30" :
              membro.status === "afastado" ? "bg-warning/15 text-warning border-warning/30" :
              "bg-muted text-muted-foreground"
            }>{membro.status}</Badge>
          </div>
          <div className="space-y-2 text-sm">
            {membro.email_pessoal && <div className="flex items-center gap-2 break-all"><Mail className="w-4 h-4 text-muted-foreground shrink-0" />{membro.email_pessoal}</div>}
            {membro.telefone && <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-muted-foreground" />{membro.telefone}</div>}
            <div className="flex items-center gap-2"><CalendarDays className="w-4 h-4 text-muted-foreground" />Admissão: {new Date(membro.data_admissao).toLocaleDateString("pt-BR")}</div>
            {(membro.oab_numero || membro.oab_seccional) && <div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-muted-foreground" />OAB {membro.oab_numero}/{membro.oab_seccional}</div>}
            {membro.cpf && <div className="text-xs text-muted-foreground pt-2 border-t">CPF: {membro.cpf}</div>}
            {membro.dependentes > 0 && <div className="text-xs text-muted-foreground">Dependentes: {membro.dependentes}</div>}
          </div>
        </CardContent></Card>

        {/* Coluna direita: abas */}
        <Tabs defaultValue="desempenho" className="overflow-hidden">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="desempenho">Desempenho</TabsTrigger>
            {isGestor && <TabsTrigger value="dados">Dados pessoais</TabsTrigger>}
            {isGestor && <TabsTrigger value="remuneracao">Remuneração</TabsTrigger>}
            {isGestor && <TabsTrigger value="metas">Metas</TabsTrigger>}
            {isGestor && <TabsTrigger value="beneficios">Benefícios</TabsTrigger>}
            {isGestor && <TabsTrigger value="lancamentos">Bônus / Descontos</TabsTrigger>}
            {isGestor && <TabsTrigger value="jornada">Jornada</TabsTrigger>}
            {isGestor && membro.cargo === "estagiario" && (
              <TabsTrigger value="relatorio-horas">Relatório de horas (IA)</TabsTrigger>
            )}
            {isGestor && <TabsTrigger value="documentos">Documentos</TabsTrigger>}
            {isGestor && <TabsTrigger value="folha">Folha</TabsTrigger>}
            {isGestor && <TabsTrigger value="comissoes">Comissões</TabsTrigger>}
          </TabsList>

          <TabsContent value="desempenho" className="space-y-4">
            {isGestor && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => dispararJob("desempenho")}>Apurar mês anterior</Button>
              </div>
            )}
            {desempenhoAtual ? (
              <Card><CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{String(desempenhoAtual.mes).padStart(2,"0")}/{desempenhoAtual.ano}</h3>
                  {desempenhoAtual.atingimento_geral_pct != null && (
                    <Badge variant="outline" className={
                      Number(desempenhoAtual.atingimento_geral_pct) >= 100 ? "bg-success/15 text-success border-success/30" :
                      Number(desempenhoAtual.atingimento_geral_pct) >= 70 ? "bg-warning/15 text-warning border-warning/30" :
                      "bg-destructive/15 text-destructive border-destructive/30"
                    }>{Number(desempenhoAtual.atingimento_geral_pct).toFixed(0)}% atingido</Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  <div><p className="text-muted-foreground text-xs">Tarefas concluídas</p><p className="font-semibold text-lg">{desempenhoAtual.tarefas_concluidas}</p></div>
                  <div><p className="text-muted-foreground text-xs">% no prazo</p><p className="font-semibold text-lg">{desempenhoAtual.tarefas_no_prazo_pct ?? 0}%</p></div>
                  <div><p className="text-muted-foreground text-xs">Prazos perdidos</p><p className="font-semibold text-lg">{desempenhoAtual.prazos_perdidos}</p></div>
                  <div><p className="text-muted-foreground text-xs">Processos abertos</p><p className="font-semibold text-lg">{desempenhoAtual.processos_abertos}</p></div>
                  <div><p className="text-muted-foreground text-xs">Processos fechados</p><p className="font-semibold text-lg">{desempenhoAtual.processos_fechados}</p></div>
                  <div><p className="text-muted-foreground text-xs">Receita gerada</p><p className="font-semibold text-lg">{formatBRL(desempenhoAtual.receita_gerada)}</p></div>
                </div>
                {desempenhoAtual.nota_avaliacao && (
                  <div className="pt-3 border-t">
                    <p className="text-sm font-semibold">Avaliação: {desempenhoAtual.nota_avaliacao}/5</p>
                    {desempenhoAtual.pontos_fortes && <p className="text-sm mt-1"><span className="text-muted-foreground">Pontos fortes: </span>{desempenhoAtual.pontos_fortes}</p>}
                    {desempenhoAtual.pontos_melhorar && <p className="text-sm"><span className="text-muted-foreground">A melhorar: </span>{desempenhoAtual.pontos_melhorar}</p>}
                  </div>
                )}
              </CardContent></Card>
            ) : <p className="text-sm text-muted-foreground">Nenhum desempenho apurado ainda.</p>}

            {desemps.length > 1 && (
              <Card><CardContent className="p-5">
                <h4 className="font-semibold mb-3">Histórico</h4>
                <div className="space-y-2">
                  {desemps.slice(1).map((d) => (
                    <div key={d.id} className="flex justify-between text-sm border-b border-border pb-2">
                      <span>{String(d.mes).padStart(2,"0")}/{d.ano}</span>
                      <span className="text-muted-foreground">{d.tarefas_concluidas} tarefas · {formatBRL(d.receita_gerada)}</span>
                      <span>{d.atingimento_geral_pct != null ? `${Number(d.atingimento_geral_pct).toFixed(0)}%` : "—"}</span>
                    </div>
                  ))}
                </div>
              </CardContent></Card>
            )}
          </TabsContent>

          {isGestor && (
            <TabsContent value="dados">
              <DadosPessoaisTabEdit membro={membro} onSaved={load} />
            </TabsContent>
          )}

          {isGestor && (
            <TabsContent value="remuneracao">
              <RemuneracaoTabEdit membroId={membro.id} />
            </TabsContent>
          )}

          {isGestor && (
            <TabsContent value="metas">
              <MetasTabEdit membroId={membro.id} cargo={membro.cargo} />
            </TabsContent>
          )}

          {isGestor && (
            <TabsContent value="beneficios">
              <BeneficiosTabEdit membroId={membro.id} />
            </TabsContent>
          )}

          {isGestor && (
            <TabsContent value="lancamentos">
              <LancamentosTabEdit membroId={membro.id} />
            </TabsContent>
          )}

          {isGestor && (
            <TabsContent value="jornada">
              <JornadaTabEdit membroId={membro.id} />
            </TabsContent>
          )}

          {isGestor && membro.cargo === "estagiario" && (
            <TabsContent value="relatorio-horas">
              <RelatorioHorasTab membroId={membro.id} membroNome={membro.nome} cargo={membro.cargo} />
            </TabsContent>
          )}

          {isGestor && (
            <TabsContent value="documentos">
              <DocumentosTabEdit membroId={membro.id} />
            </TabsContent>
          )}

          {isGestor && (
            <TabsContent value="folha" className="space-y-3">
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => dispararJob("folha")}>Gerar folha do mês anterior</Button>
              </div>
              {folhas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma folha gerada ainda.</p>
              ) : folhas.map((f) => (
                <Card key={f.id}><CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{String(f.mes).padStart(2,"0")}/{f.ano}</p>
                      <p className="text-xs text-muted-foreground">
                        Fixo {formatBRL(f.valor_fixo)} + Êxito {formatBRL(f.valor_comissao_exito)} + Produção {formatBRL(f.valor_comissao_producao)}
                        {Number(f.bonus_manual) > 0 && ` + Bônus ${formatBRL(f.bonus_manual)}`}
                        {Number(f.desconto_manual) > 0 && ` − Desconto ${formatBRL(f.desconto_manual)}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-lg">{formatBRL(f.valor_total)}</p>
                      <Badge variant="outline" className={
                        f.status === "pago" ? "bg-success/15 text-success border-success/30" :
                        f.status === "revisado" ? "bg-warning/15 text-warning border-warning/30" :
                        "bg-muted text-muted-foreground"
                      }>{LABEL_STATUS_FOLHA[f.status]}</Badge>
                    </div>
                  </div>
                </CardContent></Card>
              ))}
            </TabsContent>
          )}

          {isGestor && (
            <TabsContent value="comissoes" className="space-y-2">
              {comissoes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma comissão registrada.</p>
              ) : comissoes.map((c) => (
                <Card key={c.id}><CardContent className="p-3 flex items-center justify-between text-sm">
                  <div>
                    <p>Honorário: {formatBRL(c.valor_honorario)} · {c.percentual_comissao}%</p>
                    <p className="text-xs text-muted-foreground">{String(c.mes_referencia).padStart(2,"0")}/{c.ano_referencia} · {c.incluida_folha ? "incluída na folha" : "pendente"}</p>
                  </div>
                  <p className="font-semibold">{formatBRL(c.valor_comissao)}</p>
                </CardContent></Card>
              ))}
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
