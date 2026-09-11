import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CircleDollarSign,
  FileCheck2,
  MessageCircle,
  Target,
  Users,
  CalendarClock,
  AlertTriangle,
  CheckCircle2,
  Check,
  Timer,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Lead = {
  id: string;
  nome: string;
  status: string | null;
  canal: string | null;
  valor_contrato: number | null;
  criado_em: string;
};

type Followup = {
  id: string;
  conversa_id: string;
  descricao: string;
  agendado_para: string;
  responsavel_id: string | null;
  whatsapp_conversas: { nome_contato: string | null; telefone: string } | Array<{ nome_contato: string | null; telefone: string }>;
};

type Conversa = {
  id: string;
  status: string;
  nao_lidas: number;
  nome_contato: string | null;
  primeira_entrada_em: string | null;
  primeira_resposta_humana_em: string | null;
  sla_primeira_resposta_limite_em: string | null;
};

type AtividadeCRM = {
  id: string;
  lead_id: string;
  descricao: string;
  agendado_para: string;
  responsavel_id: string | null;
  mkt_leads: { nome: string } | Array<{ nome: string }>;
};

const ETAPAS = [
  { label: "Recepção", status: "novo" },
  { label: "Em atendimento", status: "em_atendimento" },
  { label: "Proposta enviada", status: "proposta_enviada" },
  { label: "Convertido", status: "convertido" },
] as const;

const moeda = (valor: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(valor);

const normalizar = (status?: string | null) => (status || "novo").trim().toLowerCase();

export default function ComercialVisaoGeral() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["comercial-visao-geral", user?.id],
    queryFn: async () => {
      const [leadsResult, conversasResult, clientesResult, fichasResult, followupsResult, atividadesResult] = await Promise.all([
        (supabase as any)
          .from("mkt_leads")
          .select("id,nome,status,canal,valor_contrato,criado_em")
          .order("criado_em", { ascending: false }),
        (supabase as any)
          .from("whatsapp_conversas")
          .select("id,status,nao_lidas,nome_contato,primeira_entrada_em,primeira_resposta_humana_em,sla_primeira_resposta_limite_em"),
        (supabase as any)
          .from("clientes")
          .select("id,estado", { count: "exact" })
          .eq("ativo", true),
        (supabase as any)
          .from("cliente_atendimentos")
          .select("id,convertido_em", { count: "exact" }),
        user?.id
          ? (supabase as any)
              .from("whatsapp_conversa_followups")
              .select("id,conversa_id,descricao,agendado_para,responsavel_id,whatsapp_conversas!inner(nome_contato,telefone)")
              .eq("responsavel_id", user.id)
              .eq("status", "pendente")
              .order("agendado_para", { ascending: true })
              .limit(20)
          : Promise.resolve({ data: [], error: null }),
        user?.id
          ? (supabase as any)
              .from("mkt_lead_atividades")
              .select("id,lead_id,descricao,agendado_para,responsavel_id,mkt_leads!inner(nome)")
              .eq("responsavel_id", user.id)
              .eq("status", "pendente")
              .order("agendado_para", { ascending: true })
              .limit(20)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (leadsResult.error) throw leadsResult.error;
      if (conversasResult.error) throw conversasResult.error;
      if (clientesResult.error) throw clientesResult.error;
      if (fichasResult.error) throw fichasResult.error;
      if (followupsResult.error) throw followupsResult.error;
      if (atividadesResult.error) throw atividadesResult.error;

      return {
        leads: (leadsResult.data ?? []) as Lead[],
        conversas: (conversasResult.data ?? []) as Conversa[],
        clientesAtivos: clientesResult.count ?? (clientesResult.data ?? []).length,
        clientesComUf: (clientesResult.data ?? []).filter((cliente: any) => !!cliente.estado?.trim()).length,
        fichasTotal: fichasResult.count ?? (fichasResult.data ?? []).length,
        fichasAbertas: (fichasResult.data ?? []).filter((ficha: any) => !ficha.convertido_em).length,
        followups: (followupsResult.data ?? []) as Followup[],
        atividades: (atividadesResult.data ?? []) as AtividadeCRM[],
      };
    },
  });

  const concluirAtividade = useMutation({
    mutationFn: async (atividadeId: string) => {
      if (!user?.id) throw new Error("Sessão não identificada.");
      const { data: concluida, error: erroConclusao } = await (supabase as any)
        .from("mkt_lead_atividades")
        .update({
          status: "concluida",
          concluido_por: user.id,
          concluido_em: new Date().toISOString(),
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", atividadeId)
        .eq("responsavel_id", user.id)
        .eq("status", "pendente")
        .select("id")
        .maybeSingle();
      if (erroConclusao) throw erroConclusao;
      if (!concluida) throw new Error("A pendência já foi atualizada ou não está atribuída a você.");
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["comercial-visao-geral"] }),
        queryClient.invalidateQueries({ queryKey: ["mkt-lead-atividades-pendentes"] }),
      ]);
      toast.success("Pendência concluída.");
    },
    onError: (erro: Error) => toast.error(erro.message || "Não foi possível concluir a pendência."),
  });

  const leads = data?.leads ?? [];
  const conversas = data?.conversas ?? [];
  const clientesAtivos = data?.clientesAtivos ?? 0;
  const clientesComUf = data?.clientesComUf ?? 0;
  const fichasTotal = data?.fichasTotal ?? 0;
  const fichasAbertas = data?.fichasAbertas ?? 0;
  const followups = data?.followups ?? [];
  const atividades = data?.atividades ?? [];
  const agora = Date.now();
  const followupsVencidos = followups.filter((item) => new Date(item.agendado_para).getTime() < agora);
  const atividadesVencidas = atividades.filter((item) => new Date(item.agendado_para).getTime() < agora);
  const pendenciasVencidas = followupsVencidos.length + atividadesVencidas.length;

  const resumo = useMemo(() => {
    const totalValor = leads.reduce((soma, lead) => soma + Number(lead.valor_contrato || 0), 0);
    const propostas = leads.filter((lead) => normalizar(lead.status) === "proposta_enviada").length;
    const convertidos = leads.filter((lead) => normalizar(lead.status) === "convertido").length;
    const emAtendimento = leads.filter((lead) => ["novo", "em_atendimento", "proposta_enviada"].includes(normalizar(lead.status))).length;
    const naoLidas = conversas.reduce((soma, conversa) => soma + Number(conversa.nao_lidas || 0), 0);
    const conversao = leads.length > 0 ? (convertidos / leads.length) * 100 : 0;
    const slaPendentes = conversas.filter((item) =>
      item.primeira_entrada_em &&
      item.sla_primeira_resposta_limite_em &&
      !item.primeira_resposta_humana_em &&
      item.status !== "encerrada"
    );
    const slaVencidos = slaPendentes.filter((item) =>
      new Date(item.sla_primeira_resposta_limite_em!).getTime() < Date.now()
    );
    const respondidas = conversas.filter((item) => item.primeira_entrada_em && item.primeira_resposta_humana_em);
    const tempoMedioResposta = respondidas.length > 0
      ? respondidas.reduce((soma, item) =>
          soma + Math.max(0, new Date(item.primeira_resposta_humana_em!).getTime() - new Date(item.primeira_entrada_em!).getTime()), 0
        ) / respondidas.length
      : null;

    return {
      totalValor, propostas, convertidos, emAtendimento, naoLidas, conversao,
      slaPendentes, slaVencidos, tempoMedioResposta,
    };
  }, [leads, conversas]);

  const etapas = useMemo(
    () =>
      ETAPAS.map((etapa) => ({
        ...etapa,
        quantidade: leads.filter((lead) => normalizar(lead.status) === etapa.status).length,
      })),
    [leads],
  );

  const origens = useMemo(() => {
    const contagem = new Map<string, number>();
    leads.forEach((lead) => {
      const origem = lead.canal?.trim() || "Não informada";
      contagem.set(origem, (contagem.get(origem) || 0) + 1);
    });
    return Array.from(contagem.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [leads]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Comercial</p>
          <h1 className="font-display text-3xl">Visão geral comercial</h1>
          <p className="text-sm text-muted-foreground">
            Do atendimento registrado à contratação, com dados reais do escritório.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to="/comercial"><MessageCircle className="mr-2 h-4 w-4" />Conversas</Link>
          </Button>
          <Button asChild>
            <Link to="/comercial/crm">Abrir CRM<ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
        </div>
      </header>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Não foi possível carregar os indicadores comerciais. Tente novamente ou sincronize o acesso.
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        <Metrica icon={Users} label="Clientes ativos" value={isLoading ? "…" : String(clientesAtivos)} />
        <Metrica icon={Users} label="Clientes com UF" value={isLoading ? "…" : String(clientesComUf)} />
        <Metrica icon={FileCheck2} label="Fichas registradas" value={isLoading ? "…" : String(fichasTotal)} />
        <Metrica icon={Target} label="Fichas em aberto" value={isLoading ? "…" : String(fichasAbertas)} />
        <Metrica icon={Users} label="Leads registrados" value={isLoading ? "…" : String(leads.length)} />
        <Metrica icon={MessageCircle} label="Em atendimento" value={isLoading ? "…" : String(resumo.emAtendimento)} />
        <Metrica icon={Target} label="Propostas" value={isLoading ? "…" : String(resumo.propostas)} />
        <Metrica icon={FileCheck2} label="Convertidos" value={isLoading ? "…" : String(resumo.convertidos)} />
        <Metrica icon={CircleDollarSign} label="Valor informado" value={isLoading ? "…" : moeda(resumo.totalValor)} />
        <Metrica icon={MessageCircle} label="Mensagens não lidas" value={isLoading ? "…" : String(resumo.naoLidas)} />
        <Metrica icon={CalendarClock} label="Minhas pendências" value={isLoading ? "…" : String(followups.length + atividades.length)} />
        <Metrica icon={AlertTriangle} label="Minhas pendências vencidas" value={isLoading ? "…" : String(pendenciasVencidas)} />
        <Metrica icon={Timer} label="SLA aguardando resposta" value={isLoading ? "…" : String(resumo.slaPendentes.length)} />
        <Metrica icon={AlertTriangle} label="SLA vencido" value={isLoading ? "…" : String(resumo.slaVencidos.length)} />
        <Metrica
          icon={CheckCircle2}
          label="Tempo médio da 1ª resposta"
          value={isLoading
            ? "…"
            : resumo.tempoMedioResposta == null
              ? "Sem dados"
              : `${Math.round(resumo.tempoMedioResposta / 60000)} min`}
        />
      </div>

      <Card className="p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-2xl">SLA da primeira resposta</h2>
            <p className="text-sm text-muted-foreground">
              Conversas reais aguardando a primeira resposta confirmada da equipe.
            </p>
          </div>
          <Badge variant={resumo.slaVencidos.length > 0 ? "destructive" : "secondary"}>
            {resumo.slaVencidos.length} vencido(s)
          </Badge>
        </div>
        {resumo.slaPendentes.length === 0 ? (
          <p className="mt-5 rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
            Nenhuma conversa com primeira resposta pendente.
          </p>
        ) : (
          <div className="mt-5 divide-y">
            {[...resumo.slaPendentes]
              .sort((a, b) => new Date(a.sla_primeira_resposta_limite_em!).getTime() - new Date(b.sla_primeira_resposta_limite_em!).getTime())
              .slice(0, 8)
              .map((item) => {
                const limite = new Date(item.sla_primeira_resposta_limite_em!).getTime();
                const minutos = Math.ceil((limite - agora) / 60000);
                const vencido = minutos <= 0;
                return (
                  <Link
                    key={item.id}
                    to={`/comercial?conversa=${item.id}`}
                    className="flex items-center justify-between gap-3 py-3 transition-colors hover:bg-muted/40 sm:px-2"
                  >
                    <div>
                      <p className="text-sm font-medium">{item.nome_contato || "Contato sem nome informado"}</p>
                      <p className="text-xs text-muted-foreground">Aguardando primeira resposta humana</p>
                    </div>
                    <Badge variant={vencido ? "destructive" : "outline"}>
                      {vencido ? `Vencido há ${Math.abs(minutos)} min` : `${minutos} min restantes`}
                    </Badge>
                  </Link>
                );
              })}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-2xl">Precisa de mim agora</h2>
            <p className="text-sm text-muted-foreground">
              Retornos de conversas e próximas ações do CRM explicitamente atribuídos a você.
            </p>
          </div>
          <Badge variant={pendenciasVencidas > 0 ? "destructive" : "secondary"}>
            {pendenciasVencidas} vencido(s)
          </Badge>
        </div>
        {followups.length === 0 && atividades.length === 0 ? (
          <p className="mt-5 rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
            Nenhuma pendência atribuída a você.
          </p>
        ) : (
          <div className="mt-5 divide-y">
            {atividades.slice(0, 8).map((atividade) => {
              const dadosLead = Array.isArray(atividade.mkt_leads) ? atividade.mkt_leads[0] : atividade.mkt_leads;
              const vencido = new Date(atividade.agendado_para).getTime() < agora;
              return (
                <div key={atividade.id} className="flex items-center gap-2 py-3 sm:px-2">
                  <Link
                    to={`/comercial/crm?lead=${atividade.lead_id}&acao=abrir`}
                    className="flex min-w-0 flex-1 flex-col gap-2 transition-colors hover:text-primary sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{atividade.descricao}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        CRM · {dadosLead?.nome || "Negociação vinculada"}
                      </p>
                    </div>
                    <Badge variant={vencido ? "destructive" : "outline"} className="w-fit shrink-0">
                      {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(atividade.agendado_para))}
                    </Badge>
                  </Link>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="shrink-0"
                    title="Concluir pendência"
                    aria-label={`Concluir: ${atividade.descricao}`}
                    disabled={concluirAtividade.isPending}
                    onClick={() => concluirAtividade.mutate(atividade.id)}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
            {followups.slice(0, Math.max(0, 8 - atividades.length)).map((followup) => {
              const dadosConversa = Array.isArray(followup.whatsapp_conversas)
                ? followup.whatsapp_conversas[0]
                : followup.whatsapp_conversas;
              const vencido = new Date(followup.agendado_para).getTime() < agora;
              return (
                <Link
                  key={followup.id}
                  to={`/comercial?conversa=${followup.conversa_id}`}
                  className="flex flex-col gap-2 py-3 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between sm:px-2"
                >
                  <div>
                    <p className="text-sm font-medium">{followup.descricao}</p>
                    <p className="text-xs text-muted-foreground">
                      {dadosConversa?.nome_contato || dadosConversa?.telefone || "Conversa vinculada"}
                    </p>
                  </div>
                  <Badge variant={vencido ? "destructive" : "outline"}>
                    {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(followup.agendado_para))}
                  </Badge>
                </Link>
              );
            })}
          </div>
        )}
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <Card className="p-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl">Funil comercial</h2>
              <p className="text-sm text-muted-foreground">Distribuição atual dos registros do CRM.</p>
            </div>
            <Badge variant="outline">{resumo.conversao.toFixed(1).replace(".", ",")}% de conversão</Badge>
          </div>

          {leads.length === 0 && !isLoading ? (
            <div className="rounded-xl border border-dashed p-10 text-center">
              <Target className="mx-auto h-9 w-9 text-primary/35" />
              <p className="mt-3 font-medium">O funil ainda está vazio</p>
              <p className="mt-1 text-sm text-muted-foreground">
                As etapas serão preenchidas pelos atendimentos e negociações registrados.
              </p>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-4">
              {etapas.map((etapa, indice) => (
                <div
                  key={etapa.label}
                  className="relative overflow-hidden rounded-xl border bg-gradient-to-b from-primary/10 to-background p-4"
                >
                  <p className="text-xs font-medium text-muted-foreground">{etapa.label}</p>
                  <p className="mt-3 text-3xl font-semibold">{isLoading ? "…" : etapa.quantidade}</p>
                  {indice < etapas.length - 1 && (
                    <ArrowRight className="absolute right-2 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-primary/30 sm:block" />
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="font-display text-2xl">Origem dos atendimentos</h2>
          <p className="text-sm text-muted-foreground">Canais informados nos cadastros.</p>
          <div className="mt-5 space-y-3">
            {origens.length === 0 ? (
              <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
                Nenhuma origem registrada.
              </p>
            ) : (
              origens.map(([origem, quantidade]) => (
                <div key={origem} className="flex items-center justify-between border-b pb-3 text-sm last:border-0">
                  <span>{origem}</span>
                  <Badge variant="secondary">{quantidade}</Badge>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">Indicadores sem simulação</p>
          <p className="text-sm text-muted-foreground">
            Se um bloco estiver zerado, significa que ainda não há registros correspondentes no banco.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/comercial/campanhas">Ver campanhas e origens</Link>
        </Button>
      </Card>
    </div>
  );
}

function Metrica({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-4 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </Card>
  );
}
