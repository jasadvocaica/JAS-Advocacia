import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, UserCog, BarChart3, Wallet, CalendarClock } from "lucide-react";
import { LABEL_CARGO, LABEL_VINCULO, type MembroEquipe } from "./types";
import { formatBRL } from "@/lib/format";

interface MembroComExtras extends MembroEquipe {
  remuneracao_atual?: { tipo: string; valor_fixo: number | null; percentual_exito: number | null };
  desempenho_ultimo?: { atingimento_geral_pct: number | null; mes: number; ano: number };
  tarefas_abertas?: number;
}

export default function EquipeList() {
  const { isGestor } = useAuth();
  const [membros, setMembros] = useState<MembroComExtras[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("ativo");
  const [resumo, setResumo] = useState({ totalAtivos: 0, folhaMes: 0, folhasPendentes: 0, mediaAting: 0 });

  const load = async () => {
    setLoading(true);
    const { data: ms } = await supabase
      .from("equipe_membros")
      .select("*")
      .order("nome");
    const lista = (ms ?? []) as MembroComExtras[];

    // Carregar remuneração vigente e desempenho do último mês
    const hoje = new Date();
    const mesAnt = hoje.getMonth() === 0 ? 12 : hoje.getMonth();
    const anoAnt = hoje.getMonth() === 0 ? hoje.getFullYear() - 1 : hoje.getFullYear();

    for (const m of lista) {
      if (isGestor) {
        const { data: rem } = await supabase
          .from("equipe_remuneracao")
          .select("tipo, valor_fixo, percentual_exito")
          .eq("membro_id", m.id)
          .is("data_fim", null)
          .order("data_inicio", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (rem) m.remuneracao_atual = rem as any;
      }
      const { data: desp } = await supabase
        .from("equipe_desempenho")
        .select("atingimento_geral_pct, mes, ano")
        .eq("membro_id", m.id)
        .order("ano", { ascending: false })
        .order("mes", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (desp) m.desempenho_ultimo = desp as any;
    }

    setMembros(lista);

    // Resumo
    const ativos = lista.filter((m) => m.status === "ativo");
    let folhaMes = 0, pendentes = 0, somaAting = 0, qtdAting = 0;
    if (isGestor) {
      const { data: fols } = await supabase
        .from("equipe_folha_pagamento")
        .select("valor_total, status")
        .eq("mes", mesAnt).eq("ano", anoAnt);
      (fols ?? []).forEach((f: any) => {
        folhaMes += Number(f.valor_total ?? 0);
        if (f.status !== "pago") pendentes++;
      });
    }
    ativos.forEach((m) => {
      if (m.desempenho_ultimo?.atingimento_geral_pct != null) {
        somaAting += Number(m.desempenho_ultimo.atingimento_geral_pct);
        qtdAting++;
      }
    });
    setResumo({
      totalAtivos: ativos.length,
      folhaMes,
      folhasPendentes: pendentes,
      mediaAting: qtdAting > 0 ? somaAting / qtdAting : 0,
    });
    setLoading(false);
  };

  useEffect(() => { load(); }, [isGestor]);

  const filtered = useMemo(() => membros.filter((m) => {
    const q = search.toLowerCase();
    const matchSearch = !q || m.nome.toLowerCase().includes(q) || (m.cpf ?? "").includes(q);
    const matchStatus = filterStatus === "todos" || m.status === filterStatus;
    return matchSearch && matchStatus;
  }), [membros, search, filterStatus]);

  const corAtingimento = (pct: number | null | undefined) => {
    if (pct == null) return "bg-muted text-muted-foreground";
    if (pct >= 100) return "bg-success/15 text-success border-success/30";
    if (pct >= 70) return "bg-warning/15 text-warning border-warning/30";
    return "bg-destructive/15 text-destructive border-destructive/30";
  };

  const tempoCasa = (data: string) => {
    const meses = Math.floor((Date.now() - new Date(data).getTime()) / (1000 * 60 * 60 * 24 * 30.44));
    if (meses < 12) return `${meses} ${meses === 1 ? "mês" : "meses"}`;
    const anos = Math.floor(meses / 12);
    const restMeses = meses % 12;
    return restMeses === 0 ? `${anos} ${anos === 1 ? "ano" : "anos"}` : `${anos}a ${restMeses}m`;
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Equipe" description={`${resumo.totalAtivos} membro${resumo.totalAtivos !== 1 ? "s" : ""} ativo${resumo.totalAtivos !== 1 ? "s" : ""}`}>
        {isGestor && (
          <>
            <Button variant="outline" asChild><Link to="/equipe/dashboard"><BarChart3 className="w-4 h-4" /> Dashboard</Link></Button>
            <Button variant="outline" asChild><Link to="/equipe/folha"><Wallet className="w-4 h-4" /> Folha do mês</Link></Button>
            <Button variant="gold" asChild><Link to="/equipe/novo"><Plus className="w-4 h-4" /> Novo membro</Link></Button>
          </>
        )}
      </PageHeader>

      {/* Cards resumo */}
      {isGestor && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Equipe ativa</p>
            <p className="text-2xl font-display mt-1">{resumo.totalAtivos}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Folha do mês ant.</p>
            <p className="text-2xl font-display mt-1">{formatBRL(resumo.folhaMes)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Folhas pendentes</p>
            <p className="text-2xl font-display mt-1 text-warning">{resumo.folhasPendentes}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Atingimento médio</p>
            <p className="text-2xl font-display mt-1">{resumo.mediaAting.toFixed(0)}%</p>
          </CardContent></Card>
        </div>
      )}

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome ou CPF..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="ativo">Ativos</SelectItem>
              <SelectItem value="afastado">Afastados</SelectItem>
              <SelectItem value="inativo">Inativos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {loading ? (
        <p className="text-center text-muted-foreground py-12">Carregando...</p>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-16 text-center">
          <UserCog className="w-12 h-12 mx-auto text-muted-foreground/40" />
          <p className="mt-3 text-muted-foreground">Nenhum membro cadastrado.</p>
          {isGestor && (
            <Button variant="outline" className="mt-4" asChild>
              <Link to="/equipe/novo"><Plus className="w-4 h-4" /> Cadastrar primeiro membro</Link>
            </Button>
          )}
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((m) => {
            const iniciais = m.nome.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();
            return (
              <Link key={m.id} to={`/equipe/${m.id}`}>
                <Card className="hover:border-gold transition-colors h-full">
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-start gap-3">
                      <Avatar className="w-12 h-12 bg-sidebar text-gold">
                        <AvatarFallback className="bg-sidebar text-gold font-display">{iniciais}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">{m.nome}</h3>
                        <p className="text-xs text-muted-foreground">
                          {LABEL_CARGO[m.cargo]} · {LABEL_VINCULO[m.tipo_vinculo]}
                        </p>
                      </div>
                      <Badge variant={m.status === "ativo" ? "default" : "outline"} className={
                        m.status === "ativo" ? "bg-success/15 text-success border-success/30" :
                        m.status === "afastado" ? "bg-warning/15 text-warning border-warning/30" :
                        "bg-muted text-muted-foreground"
                      }>{m.status}</Badge>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CalendarClock className="w-3.5 h-3.5" />
                      Casa há {tempoCasa(m.data_admissao)}
                    </div>

                    {isGestor && m.remuneracao_atual && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Remuneração: </span>
                        <span className="font-medium">
                          {m.remuneracao_atual.tipo} · {m.remuneracao_atual.valor_fixo ? formatBRL(m.remuneracao_atual.valor_fixo) : ""}
                          {m.remuneracao_atual.percentual_exito ? ` ${m.remuneracao_atual.percentual_exito}%` : ""}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-border">
                      <span className="text-xs text-muted-foreground">Atingimento {m.desempenho_ultimo ? `${String(m.desempenho_ultimo.mes).padStart(2,"0")}/${m.desempenho_ultimo.ano}` : "—"}</span>
                      <Badge variant="outline" className={corAtingimento(m.desempenho_ultimo?.atingimento_geral_pct)}>
                        {m.desempenho_ultimo?.atingimento_geral_pct != null
                          ? `${Number(m.desempenho_ultimo.atingimento_geral_pct).toFixed(0)}%`
                          : "Sem dados"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
