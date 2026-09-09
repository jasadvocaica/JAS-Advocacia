import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CircleDollarSign,
  FileCheck2,
  MessageCircle,
  Target,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Lead = {
  id: string;
  nome: string;
  status: string | null;
  canal: string | null;
  valor_contrato: number | null;
  criado_em: string;
};

type Conversa = {
  id: string;
  status: string;
  nao_lidas: number;
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
  const { data, isLoading, error } = useQuery({
    queryKey: ["comercial-visao-geral"],
    queryFn: async () => {
      const [leadsResult, conversasResult, clientesResult, fichasResult] = await Promise.all([
        (supabase as any)
          .from("mkt_leads")
          .select("id,nome,status,canal,valor_contrato,criado_em")
          .order("criado_em", { ascending: false }),
        (supabase as any)
          .from("whatsapp_conversas")
          .select("id,status,nao_lidas"),
        (supabase as any)
          .from("clientes")
          .select("id,estado", { count: "exact" })
          .eq("ativo", true),
        (supabase as any)
          .from("cliente_atendimentos")
          .select("id,convertido_em", { count: "exact" }),
      ]);

      if (leadsResult.error) throw leadsResult.error;
      if (conversasResult.error) throw conversasResult.error;
      if (clientesResult.error) throw clientesResult.error;
      if (fichasResult.error) throw fichasResult.error;

      return {
        leads: (leadsResult.data ?? []) as Lead[],
        conversas: (conversasResult.data ?? []) as Conversa[],
        clientesAtivos: clientesResult.count ?? (clientesResult.data ?? []).length,
        clientesComUf: (clientesResult.data ?? []).filter((cliente: any) => !!cliente.estado?.trim()).length,
        fichasTotal: fichasResult.count ?? (fichasResult.data ?? []).length,
        fichasAbertas: (fichasResult.data ?? []).filter((ficha: any) => !ficha.convertido_em).length,
      };
    },
  });

  const leads = data?.leads ?? [];
  const conversas = data?.conversas ?? [];
  const clientesAtivos = data?.clientesAtivos ?? 0;
  const clientesComUf = data?.clientesComUf ?? 0;
  const fichasTotal = data?.fichasTotal ?? 0;
  const fichasAbertas = data?.fichasAbertas ?? 0;

  const resumo = useMemo(() => {
    const totalValor = leads.reduce((soma, lead) => soma + Number(lead.valor_contrato || 0), 0);
    const propostas = leads.filter((lead) => normalizar(lead.status) === "proposta_enviada").length;
    const convertidos = leads.filter((lead) => normalizar(lead.status) === "convertido").length;
    const emAtendimento = leads.filter((lead) => ["novo", "em_atendimento", "proposta_enviada"].includes(normalizar(lead.status))).length;
    const naoLidas = conversas.reduce((soma, conversa) => soma + Number(conversa.nao_lidas || 0), 0);
    const conversao = leads.length > 0 ? (convertidos / leads.length) * 100 : 0;

    return { totalValor, propostas, convertidos, emAtendimento, naoLidas, conversao };
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
      </div>

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
