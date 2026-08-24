import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Sparkles, Loader2, Trophy, AlertTriangle, TrendingUp,
  Clock, Briefcase, ExternalLink,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ParceiroAvatar } from "./ParceiroAvatar";
import { UFS } from "./types";
import { toast } from "sonner";

interface ItemRanking {
  parceiro_id: string;
  nome: string;
  score: number;
  motivo: string;
  sinais: string[];
}

interface ItemAlerta {
  parceiro_id: string;
  nome: string;
  dias_sem_indicacao: number;
  sugestao: string;
}

interface DadosBrutos {
  id: string;
  nome: string;
  processos_ativos: number;
  taxa_exito_pct: number | null;
  dias_sem_indicacao: number | null;
  cidade: string | null;
  estado: string | null;
}

interface Resposta {
  resumo: string;
  ranking: ItemRanking[];
  alertas_esfriando: ItemAlerta[];
  dados_brutos: DadosBrutos[];
}

const AREAS = [
  "Cível", "Trabalhista", "Previdenciário", "Tributário", "Família",
  "Criminal", "Empresarial", "Consumidor", "Imobiliário", "Administrativo",
];

export default function ParceirosDistribuicaoIA() {
  const [area, setArea] = useState<string>("nenhuma");
  const [uf, setUf] = useState<string>("nenhuma");
  const [observacao, setObservacao] = useState("");
  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<Resposta | null>(null);
  const [carga, setCarga] = useState<DadosBrutos[]>([]);

  // Pré-carrega visão geral leve (carga atual) sem IA
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: parc } = await supabase
        .from("parceiros")
        .select("id, nome, cidade, estado")
        .eq("status", "ativo").eq("ativo", true);
      if (!parc || !alive) return;
      const ids = parc.map((p: any) => p.id);
      const { data: vinc } = await supabase
        .from("processo_parceiros")
        .select("parceiro_id, criado_em, ativo, processos:processo_id(status)")
        .in("parceiro_id", ids);
      const agora = Date.now();
      const out: DadosBrutos[] = parc.map((p: any) => {
        const meus = (vinc ?? []).filter((v: any) => v.parceiro_id === p.id);
        const ativos = meus.filter(
          (v: any) => v.ativo && v.processos?.status && !["encerrado", "arquivado"].includes(v.processos.status),
        ).length;
        const ult = meus.map((v: any) => v.criado_em).filter(Boolean).sort().pop();
        const dias = ult ? Math.floor((agora - new Date(ult).getTime()) / 86400000) : null;
        return {
          id: p.id, nome: p.nome, cidade: p.cidade, estado: p.estado,
          processos_ativos: ativos, taxa_exito_pct: null, dias_sem_indicacao: dias,
        };
      });
      if (alive) setCarga(out.sort((a, b) => a.processos_ativos - b.processos_ativos));
    })();
    return () => { alive = false; };
  }, []);

  const analisar = async () => {
    setLoading(true);
    setResp(null);
    try {
      const { data, error } = await supabase.functions.invoke("parceiros-distribuicao-ia", {
        body: {
          area_direito: area === "nenhuma" ? "" : area,
          uf: uf === "nenhuma" ? "" : uf,
          observacao,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) {
        toast.error((data as any).message ?? "Erro na IA");
        return;
      }
      setResp(data as Resposta);
      toast.success("Análise concluída");
    } catch (e: any) {
      toast.error("Erro: " + (e?.message ?? String(e)));
    } finally {
      setLoading(false);
    }
  };

  const totalCarga = useMemo(() => carga.reduce((s, c) => s + c.processos_ativos, 0), [carga]);
  const mediaCarga = carga.length ? Math.round((totalCarga / carga.length) * 10) / 10 : 0;
  const esfriando = useMemo(
    () => carga.filter((c) => c.dias_sem_indicacao !== null && c.dias_sem_indicacao > 60).length,
    [carga],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Distribuição inteligente de parceiros"
        description="A IA sugere o melhor parceiro para a próxima indicação"
      >
        <Button asChild variant="ghost" size="sm">
          <Link to="/parceiros"><ArrowLeft className="w-4 h-4" /> Voltar</Link>
        </Button>
      </PageHeader>

      {/* KPIs rápidos */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Parceiros ativos</div>
          <p className="font-display text-2xl">{carga.length}</p>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Processos vinculados</div>
          <p className="font-display text-2xl">{totalCarga}</p>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Carga média</div>
          <p className="font-display text-2xl">{mediaCarga}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">processos por parceiro</p>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Esfriando
          </div>
          <p className="font-display text-2xl text-amber-600">{esfriando}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">+60 dias sem indicação</p>
        </Card>
      </div>

      {/* Painel de análise */}
      <Card className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-primary/10 p-2 shrink-0">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-lg">Pedir sugestão à IA</h3>
            <p className="text-sm text-muted-foreground">
              Informe (opcionalmente) a área e UF do processo que você quer indicar. A IA cruza
              carga atual, tempo sem indicação, área de atuação e taxa de êxito.
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Área do direito (opcional)</Label>
            <Select value={area} onValueChange={setArea}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhuma">— Qualquer área —</SelectItem>
                {AREAS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">UF do processo (opcional)</Label>
            <Select value={uf} onValueChange={setUf}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhuma">— Qualquer UF —</SelectItem>
                {UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Observação para a IA (opcional)</Label>
          <Textarea
            placeholder="Ex.: caso urgente, cliente em Cuiabá, parceiro precisa fazer audiência presencial..."
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            rows={2}
          />
        </div>

        <Button onClick={analisar} disabled={loading} variant="gold" className="w-full sm:w-auto">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {loading ? "Analisando..." : "Analisar com IA"}
        </Button>
      </Card>

      {/* Resposta da IA */}
      {resp && (
        <>
          <Card className="p-5 bg-primary/5 border-primary/20">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-xs uppercase tracking-wider text-primary font-medium mb-1">Resumo da IA</p>
                <p className="text-sm">{resp.resumo}</p>
              </div>
            </div>
          </Card>

          {/* Ranking */}
          <div>
            <h3 className="font-display text-lg flex items-center gap-2 mb-3">
              <Trophy className="w-5 h-5 text-amber-500" /> Top recomendações
            </h3>
            <div className="space-y-3">
              {resp.ranking.map((r, idx) => {
                const bruto = resp.dados_brutos.find((d) => d.id === r.parceiro_id);
                return (
                  <Card key={r.parceiro_id} className="p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start gap-4">
                      <div className="flex flex-col items-center gap-1 shrink-0">
                        <Badge variant="outline" className={
                          idx === 0 ? "bg-amber-500/15 text-amber-700 border-amber-500/30" :
                          idx === 1 ? "bg-slate-300/30 text-slate-700 border-slate-400/30" :
                          idx === 2 ? "bg-orange-700/15 text-orange-800 border-orange-700/30" :
                          "bg-muted"
                        }>
                          #{idx + 1}
                        </Badge>
                        <ParceiroAvatar nome={r.nome} size="sm" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            to={`/parceiros/${r.parceiro_id}`}
                            className="font-medium hover:text-primary truncate"
                          >
                            {r.nome}
                          </Link>
                          <Badge variant="outline" className="font-mono">
                            <TrendingUp className="w-3 h-3 mr-1" />
                            {r.score}/100
                          </Badge>
                        </div>
                        <p className="text-sm mt-1.5">{r.motivo}</p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {r.sinais.map((s, i) => (
                            <Badge key={i} variant="outline" className="text-[10px] bg-muted">
                              {s}
                            </Badge>
                          ))}
                        </div>
                        {bruto && (
                          <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Briefcase className="w-3 h-3" />
                              {bruto.processos_ativos} ativo{bruto.processos_ativos !== 1 ? "s" : ""}
                            </span>
                            {bruto.taxa_exito_pct !== null && (
                              <span>Êxito: <strong>{bruto.taxa_exito_pct}%</strong></span>
                            )}
                            {bruto.dias_sem_indicacao !== null && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {bruto.dias_sem_indicacao}d sem indicação
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <Button asChild size="sm" variant="ghost">
                        <Link to={`/parceiros/${r.parceiro_id}`}>
                          <ExternalLink className="w-4 h-4" />
                        </Link>
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Alertas */}
          {resp.alertas_esfriando.length > 0 && (
            <div>
              <h3 className="font-display text-lg flex items-center gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-amber-600" /> Parcerias esfriando
              </h3>
              <div className="space-y-2">
                {resp.alertas_esfriando.map((a) => (
                  <Card key={a.parceiro_id} className="p-3 border-amber-500/30 bg-amber-500/5">
                    <div className="flex items-start gap-3">
                      <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-1" />
                      <div className="flex-1 min-w-0">
                        <Link
                          to={`/parceiros/${a.parceiro_id}`}
                          className="text-sm font-medium hover:text-primary"
                        >
                          {a.nome}
                        </Link>
                        <span className="text-xs text-amber-700 ml-2">
                          {a.dias_sem_indicacao} dias sem indicação
                        </span>
                        <p className="text-xs text-muted-foreground mt-1">{a.sugestao}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Visão de carga (sempre visível) */}
      {!resp && carga.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30">
            <h3 className="font-medium text-sm">Carga atual (do menos sobrecarregado ao mais)</h3>
          </div>
          <div className="divide-y max-h-96 overflow-y-auto">
            {carga.slice(0, 15).map((c) => (
              <Link
                key={c.id}
                to={`/parceiros/${c.id}`}
                className="flex items-center gap-3 p-3 hover:bg-muted/40"
              >
                <ParceiroAvatar nome={c.nome} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.cidade && c.estado && `${c.cidade}/${c.estado} · `}
                    {c.dias_sem_indicacao !== null
                      ? `Última indicação há ${c.dias_sem_indicacao}d`
                      : "Sem indicações registradas"}
                  </p>
                </div>
                <Badge variant="outline" className={
                  c.processos_ativos === 0 ? "bg-success/15 text-success border-success/30" :
                  c.processos_ativos < mediaCarga ? "bg-muted" :
                  "bg-amber-500/15 text-amber-700 border-amber-500/30"
                }>
                  {c.processos_ativos} ativo{c.processos_ativos !== 1 ? "s" : ""}
                </Badge>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
