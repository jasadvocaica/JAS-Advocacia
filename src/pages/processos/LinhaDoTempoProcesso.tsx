import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import {
  MessageSquare,
  ClipboardCheck,
  FileText,
  DollarSign,
  Workflow,
  Loader2,
} from "lucide-react";
import { formatBRL, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type TipoEvento = "andamento" | "tarefa" | "peca" | "pagamento" | "fluxo";

interface EventoTimeline {
  id: string;
  tipo: TipoEvento;
  data: string; // ISO
  titulo: string;
  descricao?: string | null;
  badge?: string;
  link?: string;
}

interface Props {
  processoId: string;
}

const META_TIPO: Record<TipoEvento, { label: string; icon: typeof MessageSquare; cor: string; bg: string }> = {
  andamento: {
    label: "Andamento",
    icon: MessageSquare,
    cor: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900",
  },
  tarefa: {
    label: "Tarefa / Prazo",
    icon: ClipboardCheck,
    cor: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900",
  },
  peca: {
    label: "Peça",
    icon: FileText,
    cor: "text-purple-600 dark:text-purple-400",
    bg: "bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-900",
  },
  pagamento: {
    label: "Financeiro",
    icon: DollarSign,
    cor: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900",
  },
  fluxo: {
    label: "Fluxo",
    icon: Workflow,
    cor: "text-indigo-600 dark:text-indigo-400",
    bg: "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-900",
  },
};

export function LinhaDoTempoProcesso({ processoId }: Props) {
  const [eventos, setEventos] = useState<EventoTimeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState<TipoEvento[]>([
    "andamento",
    "tarefa",
    "peca",
    "pagamento",
    "fluxo",
  ]);

  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      setLoading(true);
      try {
        // Buscar contratos do processo (para alcançar pagamentos)
        const { data: contratos } = await supabase
          .from("honorarios_contratos")
          .select("id")
          .eq("processo_id", processoId);
        const contratoIds = (contratos ?? []).map((c) => c.id);

        const [resAnd, resTar, resPec, resPag, resFlux] = await Promise.all([
          supabase
            .from("andamentos")
            .select("id, data, descricao, fonte")
            .eq("processo_id", processoId)
            .order("data", { ascending: false })
            .limit(200),
          supabase
            .from("controladoria_itens")
            .select("id, titulo, tipo, status, data_vencimento, criado_em, prioridade")
            .eq("processo_id", processoId)
            .order("data_vencimento", { ascending: false })
            .limit(100),
          supabase
            .from("doc_pecas")
            .select("id, titulo, status, criado_em, protocolado_em, finalizado_em, categoria")
            .eq("processo_id", processoId)
            .order("criado_em", { ascending: false })
            .limit(50),
          contratoIds.length > 0
            ? supabase
                .from("honorarios_pagamentos")
                .select("id, valor_recebido, data_pagamento, tipo_pagamento, forma_pagamento")
                .in("contrato_id", contratoIds)
                .order("data_pagamento", { ascending: false })
                .limit(50)
            : Promise.resolve({ data: [] as any[] }),
          supabase
            .from("fluxo_instancias")
            .select("id, template_nome, status, data_gatilho, criado_em, concluido_em, progresso_pct")
            .eq("processo_id", processoId)
            .order("criado_em", { ascending: false })
            .limit(20),
        ]);

        if (cancelado) return;

        const lista: EventoTimeline[] = [];

        (resAnd.data ?? []).forEach((a: any) => {
          lista.push({
            id: `and-${a.id}`,
            tipo: "andamento",
            data: a.data,
            titulo: a.descricao?.split("\n")[0]?.slice(0, 140) || "Andamento",
            descricao: a.descricao && a.descricao.length > 140 ? a.descricao.slice(140, 400) + "…" : null,
            badge: a.fonte,
          });
        });

        (resTar.data ?? []).forEach((t: any) => {
          lista.push({
            id: `tar-${t.id}`,
            tipo: "tarefa",
            data: t.data_vencimento ?? t.criado_em,
            titulo: t.titulo,
            descricao: `${t.tipo?.replace(/_/g, " ")} • ${t.status}`,
            badge: t.prioridade,
            link: "/controladoria",
          });
        });

        (resPec.data ?? []).forEach((p: any) => {
          // Cria 1-3 eventos por peça (criação, finalização, protocolo)
          lista.push({
            id: `pec-criada-${p.id}`,
            tipo: "peca",
            data: p.criado_em,
            titulo: `Peça criada: ${p.titulo}`,
            descricao: p.categoria,
            badge: "criada",
            link: `/documentos/pecas/${p.id}`,
          });
          if (p.finalizado_em) {
            lista.push({
              id: `pec-final-${p.id}`,
              tipo: "peca",
              data: p.finalizado_em,
              titulo: `Peça finalizada: ${p.titulo}`,
              badge: "finalizada",
              link: `/documentos/pecas/${p.id}`,
            });
          }
          if (p.protocolado_em) {
            lista.push({
              id: `pec-prot-${p.id}`,
              tipo: "peca",
              data: p.protocolado_em,
              titulo: `Peça protocolada: ${p.titulo}`,
              badge: "protocolada",
              link: `/documentos/pecas/${p.id}`,
            });
          }
        });

        (resPag.data ?? []).forEach((pg: any) => {
          lista.push({
            id: `pag-${pg.id}`,
            tipo: "pagamento",
            data: pg.data_pagamento,
            titulo: `Pagamento recebido: ${formatBRL(pg.valor_recebido)}`,
            descricao: `${pg.tipo_pagamento} • ${pg.forma_pagamento}`,
            badge: pg.tipo_pagamento,
          });
        });

        (resFlux.data ?? []).forEach((f: any) => {
          lista.push({
            id: `flux-ini-${f.id}`,
            tipo: "fluxo",
            data: f.criado_em,
            titulo: `Fluxo iniciado: ${f.template_nome}`,
            descricao: `${f.progresso_pct ?? 0}% concluído`,
            badge: f.status,
            link: `/fluxos/instancia/${f.id}`,
          });
          if (f.concluido_em) {
            lista.push({
              id: `flux-fim-${f.id}`,
              tipo: "fluxo",
              data: f.concluido_em,
              titulo: `Fluxo concluído: ${f.template_nome}`,
              badge: "concluído",
              link: `/fluxos/instancia/${f.id}`,
            });
          }
        });

        // Ordenar desc por data
        lista.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
        setEventos(lista);
      } finally {
        if (!cancelado) setLoading(false);
      }
    }
    carregar();
    return () => {
      cancelado = true;
    };
  }, [processoId]);

  const eventosFiltrados = useMemo(
    () => eventos.filter((e) => filtros.includes(e.tipo)),
    [eventos, filtros]
  );

  // Agrupar por dia
  const agrupados = useMemo(() => {
    const grupos: Record<string, EventoTimeline[]> = {};
    eventosFiltrados.forEach((e) => {
      const dia = e.data.slice(0, 10);
      if (!grupos[dia]) grupos[dia] = [];
      grupos[dia].push(e);
    });
    return Object.entries(grupos).sort(([a], [b]) => (a < b ? 1 : -1));
  }, [eventosFiltrados]);

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2 text-muted-foreground mb-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          Carregando linha do tempo...
        </div>
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card className="p-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground mr-2">Filtrar:</span>
        <ToggleGroup
          type="multiple"
          value={filtros}
          onValueChange={(v) => setFiltros((v.length ? v : filtros) as TipoEvento[])}
          className="flex flex-wrap gap-1"
        >
          {(Object.keys(META_TIPO) as TipoEvento[]).map((t) => {
            const m = META_TIPO[t];
            const Icon = m.icon;
            const count = eventos.filter((e) => e.tipo === t).length;
            return (
              <ToggleGroupItem key={t} value={t} size="sm" className="gap-1.5">
                <Icon className={cn("w-3.5 h-3.5", m.cor)} />
                <span className="text-xs">{m.label}</span>
                <Badge variant="secondary" className="h-4 px-1 text-[10px]">{count}</Badge>
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
      </Card>

      {/* Timeline */}
      {agrupados.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground text-sm">
          Nenhum evento para os filtros selecionados.
        </Card>
      ) : (
        <div className="relative">
          <div className="absolute left-[18px] top-2 bottom-2 w-px bg-border" aria-hidden />
          <div className="space-y-6">
            {agrupados.map(([dia, eventosDia]) => (
              <div key={dia} className="relative">
                <div className="sticky top-16 z-10 mb-3 ml-10">
                  <Badge variant="outline" className="bg-background font-medium">
                    {new Date(dia + "T12:00:00").toLocaleDateString("pt-BR", {
                      weekday: "short",
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {eventosDia.map((ev) => {
                    const m = META_TIPO[ev.tipo];
                    const Icon = m.icon;
                    const conteudo = (
                      <Card
                        className={cn(
                          "p-3 ml-10 hover:shadow-sm transition-shadow border-l-4",
                          m.bg
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <span className="text-[10px] uppercase tracking-wider font-semibold opacity-70">
                                {m.label}
                              </span>
                              {ev.badge && (
                                <Badge variant="outline" className="text-[10px] capitalize h-4 px-1.5">
                                  {ev.badge}
                                </Badge>
                              )}
                              <span className="text-[10px] text-muted-foreground ml-auto">
                                {formatDateTime(ev.data)}
                              </span>
                            </div>
                            <div className="text-sm font-medium leading-snug">{ev.titulo}</div>
                            {ev.descricao && (
                              <div className="text-xs text-muted-foreground mt-1 capitalize">
                                {ev.descricao}
                              </div>
                            )}
                          </div>
                        </div>
                      </Card>
                    );
                    return (
                      <div key={ev.id} className="relative">
                        <div
                          className={cn(
                            "absolute left-2 top-3 w-7 h-7 rounded-full flex items-center justify-center border-2 border-background z-[1]",
                            m.bg
                          )}
                        >
                          <Icon className={cn("w-3.5 h-3.5", m.cor)} />
                        </div>
                        {ev.link ? (
                          <Link to={ev.link} className="block">
                            {conteudo}
                          </Link>
                        ) : (
                          conteudo
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
