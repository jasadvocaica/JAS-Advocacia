import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Play, Loader2, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/**
 * Agentes de IA — "contratação" e acompanhamento. Só gestão.
 * As tabelas (agentes_ia, agentes_execucoes, agentes_acoes) ainda não estão
 * no types.ts gerado; por isso o acesso via `as any`, como em outras telas.
 */

interface Agente {
  codigo: string;
  nome: string;
  funcao: string;
  descricao: string;
  contratado: boolean;
  config: Record<string, number>;
  limite_mensal_usd: number;
}

const db = supabase as any;
const usd = (v: number) => `US$ ${Number(v ?? 0).toFixed(2)}`;
const dataHora = (s: string) => new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const EM_BREVE = [
  { nome: "Redatora de peças", funcao: "Minuta petições a partir dos prazos conferidos" },
  { nome: "Atendente comercial", funcao: "Qualifica leads do WhatsApp e agenda consultas" },
  { nome: "Analista financeiro", funcao: "Acompanha parcelas, cobranças e repasses" },
];

const ROTULO_ACAO: Record<string, { texto: string; classe: string }> = {
  prazo_lancado: { texto: "Prazo lançado", classe: "bg-success/15 text-success border-success/30" },
  mantida_triagem: { texto: "Triagem humana", classe: "bg-warning/15 text-warning border-warning/30" },
  erro: { texto: "Erro", classe: "bg-destructive/10 text-destructive border-destructive/30" },
};

function useVanessa() {
  return useQuery({
    queryKey: ["agentes-ia", "vanessa_prazos"],
    refetchInterval: 30 * 1000,
    queryFn: async () => {
      const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const [rAgente, rExec, rAcoes, rPendentes, rGasto] = await Promise.all([
        db.from("agentes_ia").select("*").eq("codigo", "vanessa_prazos").maybeSingle(),
        db.from("agentes_execucoes").select("*").eq("agente", "vanessa_prazos").order("iniciado_em", { ascending: false }).limit(1),
        db.from("agentes_acoes").select("id, tipo, resumo, criado_em, item_criado_id, responsavel:profiles!responsavel_id(nome)")
          .eq("agente", "vanessa_prazos").order("criado_em", { ascending: false }).limit(30),
        supabase.from("controladoria_itens").select("id", { count: "exact", head: true })
          .eq("origem", "agente_ia").eq("prazo_conferido", false).not("status", "in", "(concluido,cancelado)"),
        db.from("agentes_execucoes").select("custo_estimado_usd").eq("agente", "vanessa_prazos").gte("iniciado_em", inicioMes),
      ]);
      if (rAgente.error) throw new Error(rAgente.error.message);
      return {
        agente: rAgente.data as Agente | null,
        ultima: (rExec.data ?? [])[0] ?? null,
        acoes: rAcoes.data ?? [],
        aConferir: rPendentes.count ?? 0,
        gastoMes: (rGasto.data ?? []).reduce((s: number, g: any) => s + Number(g.custo_estimado_usd ?? 0), 0),
      };
    },
  });
}

export default function AgentesIA() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useVanessa();
  const agente = data?.agente;
  const [form, setForm] = useState({ antecedencia: "2", confianca: "75", limiteItens: "25", limiteUsd: "10" });
  const [salvando, setSalvando] = useState(false);
  const [rodando, setRodando] = useState(false);

  useEffect(() => {
    if (!agente) return;
    setForm({
      antecedencia: String(agente.config?.antecedencia_interna_dias ?? 2),
      confianca: String(Math.round(Number(agente.config?.confianca_minima ?? 0.75) * 100)),
      limiteItens: String(agente.config?.limite_itens_abertos ?? 25),
      limiteUsd: String(agente.limite_mensal_usd ?? 10),
    });
  }, [agente]);

  const recarregar = () => qc.invalidateQueries({ queryKey: ["agentes-ia"] });

  async function salvar(patch: Partial<Agente>) {
    setSalvando(true);
    const { error: err } = await db.from("agentes_ia").update(patch).eq("codigo", "vanessa_prazos");
    setSalvando(false);
    if (err) return toast.error(err.message);
    toast.success("Configuração salva");
    recarregar();
  }

  function salvarConfig() {
    const n = (v: string, min: number, max: number) => Math.min(max, Math.max(min, Number(v) || min));
    salvar({
      config: {
        ...(agente?.config ?? {}),
        antecedencia_interna_dias: n(form.antecedencia, 0, 15),
        confianca_minima: n(form.confianca, 50, 99) / 100,
        limite_itens_abertos: n(form.limiteItens, 1, 200),
      },
      limite_mensal_usd: n(form.limiteUsd, 0, 500),
    });
  }

  async function rodarAgora() {
    setRodando(true);
    const { data: r, error: err } = await supabase.functions.invoke("agente-prazos", { body: { origem: "manual" } });
    setRodando(false);
    recarregar();
    if (err) return toast.error(`A Vanessa não conseguiu trabalhar: ${err.message}`);
    if (r?.ok === false) return toast.message(r.motivo);
    toast.success(`Vanessa leu ${r.lidas} publicação(ões): ${r.lancadas} prazo(s) lançado(s), ${r.triagem} para triagem humana.`);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Agentes de IA" description="A equipe digital do escritório. Cada agente trabalha dentro do sistema, com regras e registro de tudo o que fez." />

      {error && <p className="text-sm text-destructive">Não foi possível carregar os agentes: {(error as Error).message}. A atualização do banco já foi aplicada?</p>}
      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {agente && (
        <Card className="border-gold/40">
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div className="flex items-start gap-4">
              <div className="grid size-12 shrink-0 place-items-center rounded-full bg-primary text-lg font-semibold text-primary-foreground ring-2 ring-gold">V</div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  {agente.nome}
                  <Badge variant="outline">{agente.funcao}</Badge>
                  {agente.contratado ? <Badge className="bg-success text-white">Contratada</Badge> : <Badge variant="secondary">Disponível</Badge>}
                </CardTitle>
                <CardDescription className="mt-1 max-w-2xl">{agente.descricao}</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="contratar" className="text-sm">Contratar</Label>
              <Switch id="contratar" checked={agente.contratado} disabled={salvando} onCheckedChange={(v) => salvar({ contratado: v })} />
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-4">
              <Metrica rotulo="Aguardando conferência" valor={String(data.aConferir)} destaque={data.aConferir > 0} />
              <Metrica rotulo="Último trabalho" valor={data.ultima ? dataHora(data.ultima.iniciado_em) : "—"} />
              <Metrica rotulo="Última execução" valor={data.ultima ? `${data.ultima.lancadas} lançados · ${data.ultima.triagem} triagem · ${data.ultima.erros} erros` : "—"} />
              <Metrica rotulo="Custo no mês" valor={`${usd(data.gastoMes)} de ${usd(agente.limite_mensal_usd)}`} />
            </div>

            <div className="rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed">
              <p className="mb-2 flex items-center gap-2 font-medium"><ShieldCheck className="size-4 text-success" /> Como a Vanessa trabalha</p>
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>Dias úteis às 07h15, depois da captura do DJEN, ela lê as publicações com triagem pendente.</li>
                <li>Identifica a providência e o prazo; as datas são contadas pelo sistema com dias úteis e feriados.</li>
                <li>Lança na Controladoria como <b>prazo não conferido</b> e distribui por tipo e carga (prazos → Lana, tarefas → Esther, audiências e diligências → Valeska).</li>
                <li>O que não estiver claro continua na triagem humana, com o motivo anotado.</li>
                <li>A pessoa responsável confere a contagem e marca o prazo como conferido.</li>
              </ol>
            </div>

            <div className="grid gap-4 sm:grid-cols-4">
              <Campo id="antecedencia" rotulo="Meta interna (dias úteis antes)" valor={form.antecedencia} onChange={(v) => setForm({ ...form, antecedencia: v })} />
              <Campo id="confianca" rotulo="Confiança mínima para lançar (%)" valor={form.confianca} onChange={(v) => setForm({ ...form, confianca: v })} />
              <Campo id="limite-itens" rotulo="Máx. itens abertos por pessoa" valor={form.limiteItens} onChange={(v) => setForm({ ...form, limiteItens: v })} />
              <Campo id="limite-usd" rotulo="Limite de custo por mês (US$)" valor={form.limiteUsd} onChange={(v) => setForm({ ...form, limiteUsd: v })} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={salvarConfig} disabled={salvando}><Save className="mr-2 size-4" />Salvar regras</Button>
              <Button onClick={rodarAgora} disabled={rodando || !agente.contratado} title={agente.contratado ? undefined : "Contrate a Vanessa para ela poder trabalhar"}>
                {rodando ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Play className="mr-2 size-4" />}
                {rodando ? "Trabalhando…" : "Pedir para trabalhar agora"}
              </Button>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold">O que a Vanessa fez</h3>
              {data.acoes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma ação ainda.</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {data.acoes.map((a: any) => {
                    const r = ROTULO_ACAO[a.tipo] ?? ROTULO_ACAO.erro;
                    return (
                      <li key={a.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                        <span className="w-24 shrink-0 text-xs text-muted-foreground">{dataHora(a.criado_em)}</span>
                        <Badge variant="outline" className={r.classe}>{r.texto}</Badge>
                        <span className="min-w-0 flex-1">{a.resumo}</span>
                        {a.responsavel?.nome && <span className="text-xs text-muted-foreground">→ {a.responsavel.nome}</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {EM_BREVE.map((a) => (
          <Card key={a.nome} className="opacity-70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Bot className="size-4" />{a.nome}<Badge variant="secondary">Em breve</Badge></CardTitle>
              <CardDescription>{a.funcao}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Metrica({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${destaque ? "border-warning/50 bg-warning/5" : ""}`}>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="mt-1 text-sm font-semibold">{valor}</p>
    </div>
  );
}

function Campo({ id, rotulo, valor, onChange }: { id: string; rotulo: string; valor: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">{rotulo}</Label>
      <Input id={id} type="number" inputMode="numeric" value={valor} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
