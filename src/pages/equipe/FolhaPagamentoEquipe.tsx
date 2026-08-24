import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Wallet, Search, ExternalLink, MoreHorizontal, CheckCircle2, DollarSign, RotateCcw, FileDown } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import { LABEL_STATUS_FOLHA, MESES, type Folha, type StatusFolha } from "./types";
import { gerarReciboEstagiariaPdf, gerarReciboConsolidadoPdf } from "./recibo-estagiaria-pdf";

interface FolhaComMembro extends Folha {
  membro_nome?: string;
  membro_cargo?: string;
}

interface FolhaPrevista {
  membro_id: string;
  membro_nome: string;
  membro_cargo: string;
  valor_fixo: number;
  valor_fixo_integral: number;
  dias_trabalhados: number;
  dias_uteis_mes: number;
  proporcional: boolean;
  valor_comissao_exito: number;
  bonus: number;
  desconto: number;
  total: number;
}

const DIA_KEY_TO_DOW: Record<string, number> = {
  dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6,
};
const DIAS_PADRAO = ["seg", "ter", "qua", "qui", "sex"];

function contarDiasJornada(
  diasTrabalho: string[],
  ano: number,
  mes: number,
  inicio?: Date,
  fim?: Date,
): number {
  const dows = new Set(diasTrabalho.map((k) => DIA_KEY_TO_DOW[k]).filter((d) => d !== undefined));
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const ini = new Date(ano, mes - 1, 1);
  const f = new Date(ano, mes - 1, ultimoDia);
  const lo = inicio && inicio > ini ? inicio : ini;
  const hi = fim && fim < f ? fim : f;
  if (lo > hi) return 0;
  let n = 0;
  for (let d = new Date(lo); d <= hi; d.setDate(d.getDate() + 1)) {
    if (dows.has(d.getDay())) n++;
  }
  return n;
}

export default function FolhaPagamentoEquipe() {
  const hoje = new Date();
  const [mes, setMes] = useState<number>(hoje.getMonth() === 0 ? 12 : hoje.getMonth());
  const [ano, setAno] = useState<number>(hoje.getMonth() === 0 ? hoje.getFullYear() - 1 : hoje.getFullYear());
  const [membroFiltro, setMembroFiltro] = useState<string>("todos");
  const [statusFiltro, setStatusFiltro] = useState<string>("todos");
  const [search, setSearch] = useState("");
  const [folhas, setFolhas] = useState<FolhaComMembro[]>([]);
  const [membros, setMembros] = useState<{ id: string; nome: string; cargo: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const [previstos, setPrevistos] = useState<FolhaPrevista[]>([]);

  const anos = useMemo(() => {
    const atual = hoje.getFullYear();
    return [atual - 2, atual - 1, atual, atual + 1];
  }, []);

  const load = async () => {
    setLoading(true);
    const ultimoDiaMes = new Date(ano, mes, 0).toISOString().slice(0, 10);
    const primeiroDiaMes = new Date(ano, mes - 1, 1).toISOString().slice(0, 10);

    const [{ data: ms }, { data: fs }, { data: rems }, { data: lancs }, { data: coms }, { data: configs }] = await Promise.all([
      supabase.from("equipe_membros").select("id, nome, cargo, status, data_admissao, data_desligamento").order("nome"),
      supabase
        .from("equipe_folha_pagamento")
        .select("*")
        .eq("mes", mes)
        .eq("ano", ano)
        .order("gerado_em", { ascending: false }),
      supabase
        .from("equipe_remuneracao")
        .select("membro_id, valor_fixo, percentual_exito, data_inicio, data_fim")
        .lte("data_inicio", ultimoDiaMes),
      supabase
        .from("equipe_lancamentos_folha")
        .select("membro_id, natureza, valor, aplicado_folha")
        .eq("mes", mes).eq("ano", ano),
      supabase
        .from("equipe_comissoes_exito")
        .select("membro_id, valor_comissao, incluida_folha")
        .eq("mes_referencia", mes).eq("ano_referencia", ano),
      supabase
        .from("gp_ponto_config")
        .select("membro_id, dias_trabalho"),
    ]);

    const membrosMap = new Map((ms ?? []).map((m: any) => [m.id, m]));
    setMembros((ms ?? []) as any);
    const folhasArr = ((fs ?? []) as any[]).map((f) => ({
      ...f,
      membro_nome: membrosMap.get(f.membro_id)?.nome,
      membro_cargo: membrosMap.get(f.membro_id)?.cargo,
    }));
    setFolhas(folhasArr);

    // Previsto: somente para membros ativos SEM folha gerada para o período
    const comFolha = new Set(folhasArr.map((f) => f.membro_id));
    const remVigentePorMembro = new Map<string, any>();
    for (const r of (rems ?? []) as any[]) {
      if (r.data_fim && r.data_fim < primeiroDiaMes) continue;
      const atual = remVigentePorMembro.get(r.membro_id);
      if (!atual || r.data_inicio > atual.data_inicio) remVigentePorMembro.set(r.membro_id, r);
    }
    const bonusPorMembro = new Map<string, number>();
    const descPorMembro = new Map<string, number>();
    for (const l of (lancs ?? []) as any[]) {
      const m = l.natureza === "bonus" ? bonusPorMembro : descPorMembro;
      m.set(l.membro_id, (m.get(l.membro_id) ?? 0) + Number(l.valor || 0));
    }
    const comPorMembro = new Map<string, number>();
    for (const c of (coms ?? []) as any[]) {
      comPorMembro.set(c.membro_id, (comPorMembro.get(c.membro_id) ?? 0) + Number(c.valor_comissao || 0));
    }
    const configPorMembro = new Map<string, string[]>();
    for (const cfg of (configs ?? []) as any[]) {
      configPorMembro.set(cfg.membro_id, (cfg.dias_trabalho ?? DIAS_PADRAO) as string[]);
    }

    const prev: FolhaPrevista[] = [];
    for (const m of (ms ?? []) as any[]) {
      if (m.status !== "ativo") continue;
      if (comFolha.has(m.id)) continue;
      const rem = remVigentePorMembro.get(m.id);
      const fixoIntegral = Number(rem?.valor_fixo ?? 0) || 0;
      const exito = comPorMembro.get(m.id) ?? 0;
      const bonus = bonusPorMembro.get(m.id) ?? 0;
      const desc = descPorMembro.get(m.id) ?? 0;

      // Proporcionalidade: considera jornada + admissão/desligamento + início da remuneração
      const dias = configPorMembro.get(m.id) ?? DIAS_PADRAO;
      const diasUteisMes = contarDiasJornada(dias, ano, mes);
      const admissao = m.data_admissao ? new Date(m.data_admissao + "T00:00:00") : undefined;
      const desligamento = m.data_desligamento ? new Date(m.data_desligamento + "T00:00:00") : undefined;
      const inicioRem = rem?.data_inicio ? new Date(rem.data_inicio + "T00:00:00") : undefined;
      const fimRem = rem?.data_fim ? new Date(rem.data_fim + "T00:00:00") : undefined;
      // Janela efetiva do membro no mês = max(admissao, inicioRem) .. min(desligamento, fimRem)
      const inicioEfetivo = [admissao, inicioRem].filter(Boolean).reduce<Date | undefined>(
        (acc, d) => (!acc || (d && d > acc) ? d : acc), undefined,
      );
      const fimEfetivo = [desligamento, fimRem].filter(Boolean).reduce<Date | undefined>(
        (acc, d) => (!acc || (d && d < acc) ? d : acc), undefined,
      );
      const diasTrabalhados = contarDiasJornada(dias, ano, mes, inicioEfetivo, fimEfetivo);
      const proporcional = diasUteisMes > 0 && diasTrabalhados < diasUteisMes;
      const fixo = diasUteisMes > 0
        ? Number(((fixoIntegral * diasTrabalhados) / diasUteisMes).toFixed(2))
        : fixoIntegral;

      const total = fixo + exito + bonus - desc;
      if (fixo === 0 && exito === 0 && bonus === 0 && desc === 0) continue;
      prev.push({
        membro_id: m.id,
        membro_nome: m.nome,
        membro_cargo: m.cargo,
        valor_fixo: fixo,
        valor_fixo_integral: fixoIntegral,
        dias_trabalhados: diasTrabalhados,
        dias_uteis_mes: diasUteisMes,
        proporcional,
        valor_comissao_exito: exito,
        bonus,
        desconto: desc,
        total,
      });
    }
    setPrevistos(prev);
    setLoading(false);
  };


  useEffect(() => { load(); /* eslint-disable-next-line */ }, [mes, ano]);

  const filtradas = useMemo(() => {
    return folhas.filter((f) => {
      if (membroFiltro !== "todos" && f.membro_id !== membroFiltro) return false;
      if (statusFiltro !== "todos" && f.status !== statusFiltro) return false;
      if (search && !(f.membro_nome ?? "").toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [folhas, membroFiltro, statusFiltro, search]);

  const previstosFiltrados = useMemo(() => {
    if (statusFiltro !== "todos" && statusFiltro !== "pendente") return [];
    return previstos.filter((p) => {
      if (membroFiltro !== "todos" && p.membro_id !== membroFiltro) return false;
      if (search && !p.membro_nome.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [previstos, membroFiltro, statusFiltro, search]);

  const totalPrevisto = useMemo(
    () => previstosFiltrados.reduce((s, p) => s + p.total, 0),
    [previstosFiltrados]
  );

  const totais = useMemo(() => {
    return filtradas.reduce(
      (acc, f) => {
        acc.fixo += Number(f.valor_fixo) || 0;
        acc.exito += Number(f.valor_comissao_exito) || 0;
        acc.producao += Number(f.valor_comissao_producao) || 0;
        acc.bonus += Number(f.bonus_manual) || 0;
        acc.desconto += Number(f.desconto_manual) || 0;
        acc.total += Number(f.valor_total) || 0;
        if (f.status === "pendente") acc.pendentes += 1;
        if (f.status === "pago") acc.pagas += 1;
        return acc;
      },
      { fixo: 0, exito: 0, producao: 0, bonus: 0, desconto: 0, total: 0, pendentes: 0, pagas: 0 }
    );
  }, [filtradas]);

  const badgeStatus = (s: StatusFolha) =>
    s === "pago"
      ? "bg-success/15 text-success border-success/30"
      : s === "revisado"
        ? "bg-warning/15 text-warning border-warning/30"
        : "bg-muted text-muted-foreground";

  const atualizarStatus = async (folha: FolhaComMembro, novoStatus: StatusFolha) => {
    const agora = new Date();
    const patch = {
      status: novoStatus,
      pago_em: novoStatus === "pago" ? agora.toISOString() : null,
      data_pagamento: novoStatus === "pago" ? agora.toISOString().slice(0, 10) : null,
    };
    // Otimista
    setFolhas((prev) => prev.map((f) => (f.id === folha.id ? { ...f, ...patch } : f)));
    const { error } = await supabase
      .from("equipe_folha_pagamento")
      .update(patch)
      .eq("id", folha.id);
    if (error) {
      toast.error(`Erro ao atualizar: ${error.message}`);
      load();
      return;
    }
    toast.success(
      `Folha de ${folha.membro_nome ?? "membro"} marcada como ${LABEL_STATUS_FOLHA[novoStatus].toLowerCase()}.`
    );
  };

  const imprimirRecibo = async (
    args: { membro_id: string; membro_nome?: string; membro_cargo?: string; valor_fixo: number; bonus?: number; desconto?: number },
  ) => {
    try {
      toast.loading("Gerando recibo...", { id: "recibo" });
      const doc = await gerarReciboEstagiariaPdf({
        membroId: args.membro_id,
        membroNome: args.membro_nome ?? "Estagiária",
        membroCargo: args.membro_cargo ?? "Estagiário(a)",
        mes, ano,
        bolsaMensal: Number(args.valor_fixo || 0),
        bonus: Number(args.bonus || 0),
        desconto: Number(args.desconto || 0),
      });
      const nome = (args.membro_nome ?? "estagiaria").toLowerCase().replace(/[^a-z0-9]+/g, "-");
      doc.save(`recibo-${nome}-${ano}-${String(mes).padStart(2, "0")}.pdf`);
      toast.success("Recibo gerado", { id: "recibo" });
    } catch (e: any) {
      toast.error("Erro ao gerar recibo: " + (e?.message || "desconhecido"), { id: "recibo" });
    }
  };

  const imprimirTodosRecibos = async () => {
    // Coleta estagiárias do previsto + das folhas já geradas
    const estagiariasPrevisto = previstosFiltrados
      .filter((p) => p.membro_cargo === "estagiario")
      .map((p) => ({
        membroId: p.membro_id,
        membroNome: p.membro_nome,
        membroCargo: p.membro_cargo,
        mes, ano,
        bolsaMensal: p.valor_fixo_integral,
        bonus: p.bonus,
        desconto: p.desconto,
      }));

    const estagiariasFolha = filtradas
      .filter((f) => f.membro_cargo === "estagiario")
      .map((f) => ({
        membroId: f.membro_id,
        membroNome: f.membro_nome ?? "Estagiária",
        membroCargo: f.membro_cargo ?? "Estagiário(a)",
        mes, ano,
        bolsaMensal: Number(f.valor_fixo || 0),
        bonus: Number(f.bonus_manual || 0),
        desconto: Number(f.desconto_manual || 0),
      }));

    const mapa = new Map<string, typeof estagiariasPrevisto[number]>();
    for (const e of estagiariasPrevisto) mapa.set(e.membroId, e);
    for (const e of estagiariasFolha) if (!mapa.has(e.membroId)) mapa.set(e.membroId, e);

    const todos = Array.from(mapa.values());
    if (todos.length === 0) {
      toast.error("Nenhuma estagiária encontrada para este período.");
      return;
    }

    try {
      toast.loading(`Gerando ${todos.length} recibo(s)...`, { id: "recibos" });
      const doc = await gerarReciboConsolidadoPdf(todos);
      doc.save(`recibos-estagiarias-${ano}-${String(mes).padStart(2, "0")}.pdf`);
      toast.success(`${todos.length} recibo(s) gerado(s)`, { id: "recibos" });
    } catch (e: any) {
      toast.error("Erro ao gerar recibos: " + (e?.message || "desconhecido"), { id: "recibos" });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Folha de pagamento"
        description="Visão consolidada por mês com filtros por membro e status."
      >
        <Button
          size="sm"
          variant="outline"
          onClick={imprimirTodosRecibos}
          title="Imprimir todos os recibos das estagiárias"
        >
          <FileDown className="w-4 h-4 mr-2" />
          Recibos estagiárias
        </Button>
      </PageHeader>


      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Total do mês</p>
          <p className="font-display text-2xl">{formatBRL(totais.total)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {filtradas.length} folha(s)
            {previstosFiltrados.length > 0 && (
              <> · <span className="text-gold">+ {formatBRL(totalPrevisto)} previsto</span></>
            )}
          </p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Salário fixo</p>
          <p className="font-display text-2xl">{formatBRL(totais.fixo)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Comissões</p>
          <p className="font-display text-2xl">{formatBRL(totais.exito + totais.producao)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Êxito {formatBRL(totais.exito)} · Prod {formatBRL(totais.producao)}
          </p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Status</p>
          <div className="flex gap-3 mt-1">
            <Badge variant="outline" className="bg-success/15 text-success border-success/30">{totais.pagas} pagas</Badge>
            <Badge variant="outline" className="bg-muted text-muted-foreground">{totais.pendentes} pendentes</Badge>
          </div>
        </CardContent></Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Mês</label>
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MESES.map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Ano</label>
            <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {anos.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Membro</label>
            <Select value={membroFiltro} onValueChange={setMembroFiltro}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {membros.map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Status</label>
            <Select value={statusFiltro} onValueChange={setStatusFiltro}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="revisado">Revisada</SelectItem>
                <SelectItem value="pago">Paga</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs text-muted-foreground">Buscar nome</label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" placeholder="Nome do membro" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Previsto do mês (membros sem folha ainda gerada) */}
      {!loading && previstosFiltrados.length > 0 && (
        <Card className="border-gold/40">
          <CardContent className="p-0">
            <div className="p-4 border-b border-gold/30 flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-gold/15 text-gold border-gold/40">Previsto</Badge>
                  <h3 className="font-semibold">Folhas ainda não fechadas — {MESES[mes - 1]}/{ano}</h3>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Estimativa baseada no contrato vigente, comissões pendentes e bônus/descontos lançados.
                </p>
              </div>
              <p className="font-display text-xl text-gold">{formatBRL(totalPrevisto)}</p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Membro</TableHead>
                  <TableHead className="text-right">Fixo</TableHead>
                  <TableHead className="text-right">Comissões</TableHead>
                  <TableHead className="text-right">Bônus</TableHead>
                  <TableHead className="text-right">Desconto</TableHead>
                  <TableHead className="text-right">Total previsto</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previstosFiltrados.map((p) => (
                  <TableRow key={p.membro_id} className="bg-gold/5">
                    <TableCell>
                      <div className="font-medium">{p.membro_nome}</div>
                      <div className="text-xs text-muted-foreground">{p.membro_cargo}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <div>{formatBRL(p.valor_fixo)}</div>
                      {p.proporcional && (
                        <div className="text-[10px] text-muted-foreground">
                          {p.dias_trabalhados}/{p.dias_uteis_mes} dias · int. {formatBRL(p.valor_fixo_integral)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatBRL(p.valor_comissao_exito)}</TableCell>
                    <TableCell className="text-right tabular-nums text-success">
                      {p.bonus > 0 ? `+${formatBRL(p.bonus)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-destructive">
                      {p.desconto > 0 ? `−${formatBRL(p.desconto)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-display font-semibold text-gold">
                      {formatBRL(p.total)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {p.membro_cargo === "estagiario" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Recibo detalhado (dia a dia)"
                            onClick={() => imprimirRecibo({
                              membro_id: p.membro_id,
                              membro_nome: p.membro_nome,
                              membro_cargo: p.membro_cargo,
                              valor_fixo: p.valor_fixo_integral,
                              bonus: p.bonus,
                              desconto: p.desconto,
                            })}
                          >
                            <FileDown className="w-4 h-4" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" asChild>
                          <Link to={`/equipe/${p.membro_id}`}>
                            <ExternalLink className="w-4 h-4" />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-8 text-center text-sm text-muted-foreground">Carregando...</p>
          ) : filtradas.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground space-y-2">
              <Wallet className="w-8 h-8 mx-auto text-gold" />
              <p className="font-medium text-foreground">Nenhuma folha gerada para {MESES[mes - 1]}/{ano}</p>
              <p className="text-sm">
                A folha é gerada automaticamente todo mês, ou manualmente pelo detalhe de cada membro.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Membro</TableHead>
                  <TableHead className="text-right">Fixo</TableHead>
                  <TableHead className="text-right">Êxito</TableHead>
                  <TableHead className="text-right">Produção</TableHead>
                  <TableHead className="text-right">Bônus</TableHead>
                  <TableHead className="text-right">Desconto</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>
                      <div className="font-medium">{f.membro_nome ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{f.membro_cargo}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatBRL(f.valor_fixo)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBRL(f.valor_comissao_exito)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBRL(f.valor_comissao_producao)}</TableCell>
                    <TableCell className="text-right tabular-nums text-success">
                      {Number(f.bonus_manual) > 0 ? `+${formatBRL(f.bonus_manual)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-destructive">
                      {Number(f.desconto_manual) > 0 ? `−${formatBRL(f.desconto_manual)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-display font-semibold">
                      {formatBRL(f.valor_total)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={badgeStatus(f.status)}>
                        {LABEL_STATUS_FOLHA[f.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="ghost">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          {f.status !== "revisado" && (
                            <DropdownMenuItem onClick={() => atualizarStatus(f, "revisado")}>
                              <CheckCircle2 className="w-4 h-4 mr-2 text-warning" />
                              Marcar como revisada
                            </DropdownMenuItem>
                          )}
                          {f.status !== "pago" && (
                            <DropdownMenuItem onClick={() => atualizarStatus(f, "pago")}>
                              <DollarSign className="w-4 h-4 mr-2 text-success" />
                              Marcar como paga
                            </DropdownMenuItem>
                          )}
                          {f.status !== "pendente" && (
                            <DropdownMenuItem onClick={() => atualizarStatus(f, "pendente")}>
                              <RotateCcw className="w-4 h-4 mr-2 text-muted-foreground" />
                              Reverter para pendente
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          {f.membro_cargo === "estagiario" && (
                            <DropdownMenuItem
                              onClick={() => imprimirRecibo({
                                membro_id: f.membro_id,
                                membro_nome: f.membro_nome,
                                membro_cargo: f.membro_cargo,
                                valor_fixo: Number(f.valor_fixo || 0),
                                bonus: Number(f.bonus_manual || 0),
                                desconto: Number(f.desconto_manual || 0),
                              })}
                            >
                              <FileDown className="w-4 h-4 mr-2 text-gold" />
                              Recibo detalhado (dias)
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem asChild>
                            <Link to={`/equipe/${f.membro_id}`}>
                              <ExternalLink className="w-4 h-4 mr-2" />
                              Ver detalhe do membro
                            </Link>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
