import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, KeyRound, Loader2, Lock, Megaphone, RefreshCw, ShieldCheck, Trash2, Wifi } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type J = Record<string, unknown>;
interface Conexao {
  estado: "aguardando" | "conectado" | "erro_autenticacao" | "erro" | "revogada";
  tem_chave: boolean;
  chave_mascara: string | null;
  chave_salva_em: string | null;
  ultimo_teste_em: string | null;
  ultimo_erro: string | null;
  addon_analytics: boolean | null;
  addon_inbox: boolean | null;
  addon_ads: boolean | null;
  coleta_ativa: boolean;
  analises_ativas: boolean;
  sync_automatico: boolean;
  intervalo_minutos: number;
  acoes_externas_com_aprovacao: boolean;
  retencao_dias: number;
  retencao_mensagens_dias: number;
  ultima_sync_em: string | null;
  ultima_sync_ok_em: string | null;
}
interface Visao {
  conexao: Conexao;
  contas: J[];
  totais: { publicacoes: number; comentarios: number; conversas: number; campanhas: number; gasto_anuncios: Record<string, number> | null };
  job_ativo: J | null;
  pode_administrar: boolean;
}

async function chamarZernio<T = J>(corpo: J): Promise<T> {
  const { data, error } = await supabase.functions.invoke("zernio", { body: corpo });
  if (error) {
    let msg = error.message;
    try {
      const b = await (error as { context?: { json: () => Promise<{ error?: string }> } }).context?.json();
      if (b?.error) msg = b.error;
    } catch {
      /* mantém a mensagem original */
    }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

const quando = (v: unknown) => (typeof v === "string" ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const n = (v: unknown) => (typeof v === "number" ? v.toLocaleString("pt-BR") : v == null || v === "" ? "—" : String(v));
const ESTADO: Record<Conexao["estado"], { texto: string; tom: "default" | "secondary" | "destructive" | "outline" }> = {
  aguardando: { texto: "Aguardando configuração da API", tom: "secondary" },
  conectado: { texto: "Conectado", tom: "default" },
  erro_autenticacao: { texto: "Chave recusada pelo Zernio", tom: "destructive" },
  erro: { texto: "Erro na conexão", tom: "destructive" },
  revogada: { texto: "Credencial revogada", tom: "outline" },
};
const RECURSO = (v: boolean | null) => (v === true ? "liberado" : v === false ? "não incluso no plano" : "não verificado");

function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">{children}</p>;
}

function Tabela({ colunas, linhas }: { colunas: string[]; linhas: (string | number | React.ReactNode)[][] }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>{colunas.map((c) => <th key={c} className="px-3 py-2 font-medium">{c}</th>)}</tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} className="border-t">{l.map((c, k) => <td key={k} className="px-3 py-2 align-top">{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function useAba<T>(aba: string, ativo: boolean) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const carregar = useCallback(async () => {
    try {
      setDados(await chamarZernio<T>({ acao: "painel", aba }));
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha");
    }
  }, [aba]);
  useEffect(() => {
    if (ativo) void carregar();
  }, [ativo, carregar]);
  return { dados, erro, carregar };
}

export default function ZernioIntegracao() {
  const { toast } = useToast();
  const [aba, setAba] = useState("visao");
  const visao = useAba<Visao>("visao", true);
  const insta = useAba<{ publicacoes: J[]; comentarios: J[]; conversas: J[] }>("instagram", aba === "instagram");
  const ads = useAba<{ campanhas: J[]; anuncios: J[]; diario: J[]; conjuntos: number }>("anuncios", aba === "anuncios");
  const syncs = useAba<{ jobs: J[]; logs: J[] }>("sincronizacoes", aba === "sincronizacoes");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [chave, setChave] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [revogar, setRevogar] = useState(false);

  const c = visao.dados?.conexao;
  const admin = !!visao.dados?.pode_administrar;

  async function agir(nome: string, corpo: J, ok: (r: J) => string) {
    setOcupado(nome);
    try {
      const r = await chamarZernio(corpo);
      toast({ title: ok(r) });
      if (nome === "salvar") setChave("");
    } catch (e) {
      toast({ title: "Não foi possível concluir", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setOcupado(null);
      await visao.carregar();
      if (aba === "sincronizacoes") await syncs.carregar();
    }
  }
  const configurar = (cfg: J) => agir("config", { acao: "configurar", config: cfg }, () => "Configuração salva");

  if (!visao.dados && !visao.erro)
    return <div className="space-y-4"><Skeleton className="h-28" /><Skeleton className="h-64" /></div>;
  if (visao.erro && !visao.dados)
    return (
      <Alert variant="destructive">
        <AlertTitle>Integração Zernio indisponível</AlertTitle>
        <AlertDescription>{visao.erro}</AlertDescription>
      </Alert>
    );
  if (!visao.dados || !c) return null;
  const estado = ESTADO[c.estado];
  const job = visao.dados.job_ativo;

  return (
    <div className="space-y-6">
      <Link to="/configuracoes/integracoes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Integrações
      </Link>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2"><Megaphone className="h-5 w-5 text-gold" /> Zernio · Instagram e Meta Ads</CardTitle>
            <CardDescription>Coleta de publicações, comentários, conversas e anúncios para o Marketing e os agentes.</CardDescription>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant={estado.tom}>{estado.texto}</Badge>
            <span className="text-xs text-muted-foreground">Última sincronização: {quando(c.ultima_sync_ok_em)}</span>
          </div>
        </CardHeader>
        {admin && c.tem_chave && (
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void agir("testar", { acao: "testar" }, (r) => (r.ok ? `Conexão ok: ${r.contas} conta(s)` : `Falhou: ${r.erro}`))} disabled={!!ocupado}>
              {ocupado === "testar" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wifi className="mr-2 h-4 w-4" />} Testar conexão
            </Button>
            <Button onClick={() => void agir("sync", { acao: "sincronizar" }, () => "Sincronização iniciada")} disabled={!!ocupado || !c.coleta_ativa}>
              {ocupado === "sync" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Sincronizar agora
            </Button>
            {!c.coleta_ativa && <span className="self-center text-xs text-muted-foreground">Ligue a coleta em Configurações para sincronizar.</span>}
          </CardContent>
        )}
      </Card>

      {c.ultimo_erro && (
        <Alert variant={c.estado === "erro_autenticacao" ? "destructive" : "default"}>
          <AlertTitle>{c.estado === "erro_autenticacao" ? "A chave foi recusada" : "Último erro"}</AlertTitle>
          <AlertDescription>{c.ultimo_erro}</AlertDescription>
        </Alert>
      )}

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="visao">Visão geral</TabsTrigger>
          <TabsTrigger value="instagram">Instagram</TabsTrigger>
          <TabsTrigger value="anuncios">Meta Ads</TabsTrigger>
          <TabsTrigger value="sincronizacoes">Sincronizações</TabsTrigger>
          <TabsTrigger value="config">Configurações</TabsTrigger>
        </TabsList>

        <TabsContent value="visao" className="space-y-4">
          {!c.tem_chave ? (
            <Vazio>Aguardando configuração da API. {admin ? "Abra a aba Configurações e insira a chave do Zernio." : "A administração precisa inserir a chave."}</Vazio>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[["Publicações (30 dias)", visao.dados.totais.publicacoes], ["Comentários (30 dias)", visao.dados.totais.comentarios],
                  ["Conversas", visao.dados.totais.conversas], ["Campanhas", visao.dados.totais.campanhas]].map(([r, v]) => (
                  <Card key={String(r)}><CardContent className="p-4"><div className="text-2xl font-semibold">{n(v)}</div><div className="text-xs text-muted-foreground">{r}</div></CardContent></Card>
                ))}
              </div>
              <Card>
                <CardHeader><CardTitle className="text-base">Recursos do plano Zernio</CardTitle></CardHeader>
                <CardContent className="grid gap-2 text-sm sm:grid-cols-3">
                  <span>Métricas (Analytics): <b>{RECURSO(c.addon_analytics)}</b></span>
                  <span>Comentários e direct (Inbox): <b>{RECURSO(c.addon_inbox)}</b></span>
                  <span>Anúncios (Ads): <b>{RECURSO(c.addon_ads)}</b></span>
                </CardContent>
              </Card>
              {job && <Alert><AlertTitle>Sincronização {String(job.estado)}</AlertTitle><AlertDescription>Etapa: {String(job.etapa_atual ?? "início")} · tentativa {n(job.tentativas)}</AlertDescription></Alert>}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Contas conectadas no Zernio</CardTitle>
                  <CardDescription>{admin ? "Marque as contas que o JAS deve sincronizar." : "Contas que o JAS sincroniza."}</CardDescription>
                </CardHeader>
                <CardContent>
                  {visao.dados.contas.length ? (
                    <ul className="divide-y">
                      {visao.dados.contas.map((conta) => (
                        <li key={String(conta.externo_id)} className="flex items-center gap-3 py-2 text-sm">
                          <Checkbox
                            checked={Boolean(conta.selecionada)}
                            disabled={!admin || !!ocupado}
                            aria-label={`Sincronizar ${conta.usuario ?? conta.nome}`}
                            onCheckedChange={(v) => {
                              const marcadas = visao.dados!.contas.filter((x) => (x.externo_id === conta.externo_id ? v : x.selecionada)).map((x) => x.externo_id);
                              void configurar({ contas_selecionadas: marcadas });
                            }}
                          />
                          <span className="font-medium">{String(conta.usuario ?? conta.nome ?? conta.externo_id)}</span>
                          <Badge variant="outline">{String(conta.plataforma)}</Badge>
                          {conta.precisa_reconectar ? <Badge variant="destructive">Reconectar no Zernio</Badge> : null}
                          {typeof conta.seguidores === "number" && <span className="ml-auto text-muted-foreground">{n(conta.seguidores)} seguidores</span>}
                        </li>
                      ))}
                    </ul>
                  ) : <Vazio>Nenhuma conta ainda. Use "Testar conexão" para listar as contas do Zernio.</Vazio>}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="instagram" className="space-y-4">
          {insta.erro ? <Alert variant="destructive"><AlertDescription>{insta.erro}</AlertDescription></Alert> : !insta.dados ? <Skeleton className="h-40" /> : (
            <>
              <h3 className="font-medium">Publicações (30 dias)</h3>
              {insta.dados.publicacoes.length ? (
                <Tabela colunas={["Data", "Publicação", "Alcance", "Curtidas", "Comentários", "Salvos", "Engajamento"]}
                  linhas={insta.dados.publicacoes.map((p) => {
                    const m = (p.metricas ?? {}) as J;
                    return [quando(p.publicado_em), p.url ? <a href={String(p.url)} target="_blank" rel="noreferrer" className="underline">{String(p.conteudo ?? "Abrir").slice(0, 80)}</a> : String(p.conteudo ?? "").slice(0, 80),
                      n(m.alcance), n(m.curtidas), n(m.comentarios), n(m.salvamentos), m.taxa_engajamento != null ? `${n(m.taxa_engajamento)}%` : "—"];
                  })} />
              ) : <Vazio>Sem publicações sincronizadas.</Vazio>}
              <h3 className="font-medium">Comentários recentes</h3>
              {insta.dados.comentarios.length ? (
                <Tabela colunas={["Quando", "Autor", "Comentário", "Pode responder"]}
                  linhas={insta.dados.comentarios.slice(0, 50).map((x) => [quando(x.criado_em_plataforma), `@${x.autor_usuario ?? "—"}`, String(x.texto ?? "").slice(0, 160), x.pode_responder ? "sim" : "não"])} />
              ) : <Vazio>Sem comentários sincronizados (requer o recurso Inbox do Zernio).</Vazio>}
              <h3 className="font-medium">Conversas do direct</h3>
              {insta.dados.conversas.length ? (
                <Tabela colunas={["Atualizada", "Contato", "Última mensagem", "Não lidas"]}
                  linhas={insta.dados.conversas.map((x) => [quando(x.atualizado_plataforma), String(x.participante_nome ?? "—"), String(x.ultima_mensagem ?? "").slice(0, 120), n(x.nao_lidas)])} />
              ) : <Vazio>Sem conversas sincronizadas (requer o recurso Inbox do Zernio).</Vazio>}
            </>
          )}
        </TabsContent>

        <TabsContent value="anuncios" className="space-y-4">
          {ads.erro ? <Alert variant="destructive"><AlertDescription>{ads.erro}</AlertDescription></Alert> : !ads.dados ? <Skeleton className="h-40" /> : (
            <>
              <h3 className="font-medium">Campanhas</h3>
              {ads.dados.campanhas.length ? (
                <Tabela colunas={["Campanha", "Situação", "Objetivo", "Gasto", "Impressões", "Cliques"]}
                  linhas={ads.dados.campanhas.map((x) => {
                    const m = (x.metricas ?? {}) as J;
                    return [String(x.nome ?? x.externo_id), String(x.estado ?? "—"), String(x.objetivo ?? "—"),
                      m.spend != null ? `${n(m.spend)} ${x.moeda ?? ""}` : "—", n(m.impressions), n(m.clicks)];
                  })} />
              ) : <Vazio>Sem campanhas sincronizadas (requer conta Meta Ads conectada no Zernio e o recurso Ads).</Vazio>}
              <h3 className="font-medium">Desempenho diário da conta</h3>
              {ads.dados.diario.length ? (
                <Tabela colunas={["Dia", "Gasto", "Impressões", "Alcance", "Cliques", "CTR", "CPC", "CPM", "Conversões"]}
                  linhas={ads.dados.diario.slice(-31).map((d) => [String(d.data), `${n(d.gasto)} ${d.moeda ?? ""}`, n(d.impressoes), n(d.alcance), n(d.cliques),
                    d.ctr != null ? `${n(d.ctr)}%` : "—", n(d.cpc), n(d.cpm), n(d.conversoes)])} />
              ) : <Vazio>Sem métricas diárias de anúncios.</Vazio>}
              <p className="text-xs text-muted-foreground">Mostramos só as métricas que o Zernio devolve. O alcance diário não deve ser somado entre dias.</p>
            </>
          )}
        </TabsContent>

        <TabsContent value="sincronizacoes" className="space-y-4">
          {syncs.erro ? <Alert variant="destructive"><AlertDescription>{syncs.erro}</AlertDescription></Alert> : !syncs.dados ? <Skeleton className="h-40" /> : (
            <>
              {syncs.dados.jobs.length ? (
                <Tabela colunas={["Início", "Origem", "Situação", "Duração", "Registros", "Erro"]}
                  linhas={syncs.dados.jobs.map((j) => {
                    const dur = j.iniciado_em && j.finalizado_em ? Math.round((Date.parse(String(j.finalizado_em)) - Date.parse(String(j.iniciado_em))) / 1000) : null;
                    const total = Object.values((j.progresso ?? {}) as Record<string, number>).reduce((s, v) => s + Number(v || 0), 0);
                    return [quando(j.iniciado_em ?? j.criado_em), String(j.origem), String(j.estado), dur != null ? `${dur} s` : "—", n(total), String(j.erro ?? "")];
                  })} />
              ) : <Vazio>Nenhuma sincronização ainda.</Vazio>}
              <h3 className="font-medium">Registro de eventos</h3>
              {syncs.dados.logs.length ? (
                <Tabela colunas={["Quando", "Nível", "Recurso", "Mensagem", "HTTP"]}
                  linhas={syncs.dados.logs.map((l) => [quando(l.criado_em), String(l.nivel), String(l.recurso ?? "—"), String(l.mensagem), n(l.http_status)])} />
              ) : <Vazio>Sem eventos registrados.</Vazio>}
            </>
          )}
        </TabsContent>

        <TabsContent value="config" className="space-y-4">
          {!admin && <Alert><Lock className="h-4 w-4" /><AlertTitle>Somente leitura</AlertTitle><AlertDescription>Só a administração altera credencial e configurações.</AlertDescription></Alert>}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4 text-gold" /> Chave de API do Zernio</CardTitle>
              <CardDescription>
                A chave é cifrada no servidor e nunca volta para a tela. {c.tem_chave ? `Chave atual: ${c.chave_mascara} (salva em ${quando(c.chave_salva_em)}).` : "Nenhuma chave salva."}
              </CardDescription>
            </CardHeader>
            {admin && (
              <CardContent className="space-y-3">
                <Label htmlFor="zernio-chave">{c.tem_chave ? "Substituir chave" : "Chave de API"}</Label>
                <div className="flex gap-2">
                  <Input id="zernio-chave" type={mostrar ? "text" : "password"} autoComplete="off" spellCheck={false}
                    placeholder="sk_…" value={chave} onChange={(e) => setChave(e.target.value)} />
                  <Button type="button" variant="outline" size="icon" onClick={() => setMostrar((v) => !v)} aria-label={mostrar ? "Ocultar" : "Mostrar"}>
                    {mostrar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={!chave.trim() || !!ocupado}
                    onClick={() => void agir("salvar", { acao: "salvar_chave", chave }, (r) => {
                      const t = r.teste as J | undefined;
                      return t?.ok ? `Chave salva e testada: ${t.contas} conta(s)` : `Chave salva, mas o teste falhou: ${t?.erro ?? ""}`;
                    })}>
                    {ocupado === "salvar" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar credencial
                  </Button>
                  {c.tem_chave && (
                    <Button variant="outline" className="text-destructive" onClick={() => setRevogar(true)} disabled={!!ocupado}>
                      <Trash2 className="mr-2 h-4 w-4" /> Revogar credencial
                    </Button>
                  )}
                </div>
              </CardContent>
            )}
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-gold" /> Permissões e frequência</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {([
                ["coleta_ativa", "Coleta de dados", "Busca publicações, métricas, comentários, conversas e anúncios."],
                ["analises_ativas", "Análises internas pelos agentes", "Nina, Bela, Theo, Bruna e Alex podem consultar os dados coletados."],
                ["sync_automatico", "Sincronização automática", "Roda no servidor, mesmo com esta página fechada."],
                ["acoes_externas_com_aprovacao", "Ações externas com aprovação", "Permite enviar respostas a comentários depois de aprovadas na Central de Aprovações."],
              ] as const).map(([k, titulo, desc]) => (
                <div key={k} className="flex items-center justify-between gap-4 rounded-md border p-3">
                  <div><Label className="font-medium">{titulo}</Label><p className="text-xs text-muted-foreground">{desc}</p></div>
                  <Switch checked={Boolean(c[k])} disabled={!admin || !c.tem_chave || !!ocupado} onCheckedChange={(v) => void configurar({ [k]: v })} aria-label={titulo} />
                </div>
              ))}
              <div className="flex items-center justify-between gap-4 rounded-md border p-3">
                <div><Label htmlFor="zernio-intervalo" className="font-medium">Frequência automática</Label><p className="text-xs text-muted-foreground">Respeita os limites da API; o Zernio guarda caches de até 10 minutos.</p></div>
                <select id="zernio-intervalo" className="h-9 rounded-md border bg-background px-2 text-sm" value={c.intervalo_minutos}
                  disabled={!admin || !!ocupado} onChange={(e) => void configurar({ intervalo_minutos: Number(e.target.value) })}>
                  {[60, 180, 360, 720, 1440].map((m) => <option key={m} value={m}>{m < 1440 ? `a cada ${m / 60} h` : "1 vez por dia"}</option>)}
                </select>
              </div>
              {(["Publicações automáticas", "Respostas automáticas", "Alterações em anúncios e orçamento"] as const).map((t) => (
                <div key={t} className="flex items-center justify-between gap-4 rounded-md border border-dashed p-3 opacity-80">
                  <div><Label className="font-medium">{t}</Label><p className="text-xs text-muted-foreground">Desativado. Depende de decisão própria; hoje toda ação externa passa por aprovação.</p></div>
                  <Badge variant="outline"><Lock className="mr-1 h-3 w-3" /> Desativado</Badge>
                </div>
              ))}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="zernio-ret">Guardar métricas e comentários (dias)</Label>
                  <Input id="zernio-ret" type="number" min={30} max={730} defaultValue={c.retencao_dias} disabled={!admin}
                    onBlur={(e) => Number(e.target.value) !== c.retencao_dias && void configurar({ retencao_dias: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="zernio-ret-msg">Guardar conversas do direct (dias)</Label>
                  <Input id="zernio-ret-msg" type="number" min={7} max={365} defaultValue={c.retencao_mensagens_dias} disabled={!admin}
                    onBlur={(e) => Number(e.target.value) !== c.retencao_mensagens_dias && void configurar({ retencao_mensagens_dias: Number(e.target.value) })} />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={revogar} onOpenChange={setRevogar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revogar a credencial do Zernio?</AlertDialogTitle>
            <AlertDialogDescription>A chave é apagada do JAS, a coleta para e as sincronizações em andamento são canceladas. Os dados já coletados continuam até o prazo de retenção.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void agir("revogar", { acao: "revogar" }, () => "Credencial revogada")}>Revogar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
