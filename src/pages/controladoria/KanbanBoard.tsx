import { useState, useMemo } from "react";
import { isPast, isToday } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, AlertTriangle, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ControladoriaItem, KANBAN_COLUMNS, ETAPA_KANBAN_COLUMNS, EtapaKanban,
  StatusItem, TipoItem, TIPO_LABELS, PRIORIDADE_CLASS, PRIORIDADE_LABELS,
} from "./types";
import { podeTransicionar, etapaAtualDe, type EtapaWorkflow } from "./workflow";

/**
 * Item governado pelo workflow (POP 01): qualquer item que já saiu da criação.
 * No modo "Status da tarefa" esses itens são somente leitura — concluir/avançar
 * só pode acontecer pela transição canônica (RPC) no modo Etapa ou no detalhe.
 */
function emWorkflow(it: ControladoriaItem) {
  return etapaAtualDe(it) !== "criacao";
}

import { ResponsavelAvatar } from "./ResponsavelAvatar";
import { TipoBadge } from "./TipoBadge";
import { formatDate } from "@/lib/format";
import { MembroEquipe } from "./equipe";

type GroupBy = "status" | "responsavel" | "tipo";
type Modo = "etapa" | "status";

interface Props {
  itens: ControladoriaItem[];
  equipe: MembroEquipe[];
  podeEditar: boolean;
  onMover: (id: string, status: StatusItem) => void;
  onMoverEtapa?: (id: string, etapa: EtapaKanban) => void;
  onSelect: (id: string) => void;
  currentUserId?: string;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onNovo?: () => void;
}

export function KanbanBoard({
  itens, equipe, podeEditar, onMover, onMoverEtapa, onSelect, currentUserId,
  fullscreen = false, onToggleFullscreen, onNovo,
}: Props) {
  const [modo, setModo] = useState<Modo>("etapa");
  const [groupBy, setGroupBy] = useState<GroupBy>("status");
  const [showAllConcluidos, setShowAllConcluidos] = useState(false);
  const [arrastandoId, setArrastandoId] = useState<string | null>(null);


  // Em modo "etapa" só faz sentido swimlane plano (1 lane) — agrupamento extra fica em modo "status"
  const usarSwimlanes = modo === "status";

  const swimlanes = useMemo(() => {
    if (!usarSwimlanes || groupBy === "status") return [{ id: "all", label: "" }];
    if (groupBy === "responsavel") {
      const lanes = equipe.map((m) => ({ id: m.id, label: m.nome.split(" ")[0] }));
      if (itens.some((i) => !i.responsavel_id)) lanes.push({ id: "sem", label: "Sem responsável" });
      return lanes;
    }
    const tipos = Array.from(new Set(itens.map((i) => i.tipo))) as TipoItem[];
    return tipos.map((t) => ({ id: t, label: TIPO_LABELS[t] }));
  }, [usarSwimlanes, groupBy, equipe, itens]);

  const matchSwimlane = (it: ControladoriaItem, laneId: string) => {
    if (!usarSwimlanes || groupBy === "status") return true;
    if (groupBy === "responsavel") {
      if (laneId === "sem") return !it.responsavel_id;
      return it.responsavel_id === laneId;
    }
    return it.tipo === laneId;
  };

  const colunasEtapa = ETAPA_KANBAN_COLUMNS;
  const colunasStatus = KANBAN_COLUMNS;

  return (
    <div className={cn("space-y-4", fullscreen && "fixed inset-0 z-50 bg-background p-6 overflow-auto")}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">Visão:</span>
          <div className="inline-flex rounded-md border bg-muted/30 p-0.5">
            <Button
              size="sm"
              variant={modo === "etapa" ? "default" : "ghost"}
              onClick={() => setModo("etapa")}
              className="h-7"
            >
              Etapa do workflow
            </Button>
            <Button
              size="sm"
              variant={modo === "status" ? "default" : "ghost"}
              onClick={() => setModo("status")}
              className="h-7"
            >
              Status da tarefa
            </Button>
          </div>
          {modo === "status" && (
            <>
              <span className="text-sm text-muted-foreground ml-3">Agrupar por:</span>
              {(["status", "responsavel", "tipo"] as GroupBy[]).map((g) => (
                <Button
                  key={g}
                  size="sm"
                  variant={groupBy === g ? "default" : "outline"}
                  onClick={() => setGroupBy(g)}
                  className="h-7"
                >
                  {g === "status" ? "Status" : g === "responsavel" ? "Responsável" : "Tipo"}
                </Button>
              ))}
            </>
          )}
        </div>
        {onToggleFullscreen && (
          <Button
            size="sm"
            variant="outline"
            onClick={onToggleFullscreen}
            className="h-7 gap-1.5"
          >
            {fullscreen ? <><Minimize2 className="w-3.5 h-3.5" /> Sair de tela cheia</> : <><Maximize2 className="w-3.5 h-3.5" /> Tela cheia</>}
          </Button>
        )}
      </div>

      {modo === "etapa" ? (
        <div className="-mx-1 overflow-x-auto scrollbar-thin pb-2">
          <div className="flex gap-4 px-1 min-w-max">
          {colunasEtapa.map((col) => {
            const colItens = itens.filter((it) => (it.etapa_workflow ?? "criacao") === col.id);
            const vencidos = colItens.filter((it) => {
              const v = new Date(it.data_vencimento);
              return isPast(v) && !isToday(v) && it.status !== "concluido";
            }).length;
            const isFinal = col.id === "finalizado";
            const visiveis = isFinal && !showAllConcluidos
              ? [...colItens].sort((a, b) => (b.concluido_em ?? "").localeCompare(a.concluido_em ?? "")).slice(0, 5)
              : colItens;
            const aceita = (id: string) => {
              const origem = itens.find((i) => i.id === id);
              if (!origem) return false;
              return podeTransicionar(
                etapaAtualDe(origem),
                col.id as EtapaWorkflow,
                origem.exige_revisao !== false,
              );
            };
            return (
              <div
                key={col.id}
                className="w-[290px] shrink-0 rounded-xl border border-border/70 bg-muted/25 p-3 min-h-[260px] flex flex-col"
                onDragOver={(e) => {
                  const id = e.dataTransfer.getData("text/plain") || arrastandoId;
                  if (podeEditar && onMoverEtapa && id && aceita(id)) e.preventDefault();
                }}
                onDrop={(e) => {
                  const id = e.dataTransfer.getData("text/plain");
                  if (!id || !podeEditar || !onMoverEtapa) return;
                  if (!aceita(id)) return;
                  onMoverEtapa(id, col.id);
                }}
              >

                <div className="flex items-center justify-between mb-3 px-1 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn("inline-block w-1.5 h-1.5 rounded-full", col.dot)} />
                    <h4 className="text-[13px] font-semibold tracking-tight truncate">{col.label}</h4>
                    <span className="text-xs text-muted-foreground tabular-nums">{colItens.length}</span>
                  </div>
                  {vencidos > 0 && (
                    <Badge variant="outline" className="h-5 gap-1 border-destructive/40 text-destructive bg-destructive/5 shrink-0">
                      <AlertTriangle className="w-3 h-3" />{vencidos}
                    </Badge>
                  )}
                </div>
                <div className="space-y-2 flex-1">
                  {visiveis.map((it) => (
                    <KanbanCard
                      key={it.id}
                      item={it}
                      draggable={podeEditar && !!onMoverEtapa}
                      onClick={() => onSelect(it.id)}
                      currentUserId={currentUserId}
                      onDragStateChange={setArrastandoId}

                    />
                  ))}
                  {colItens.length === 0 && (
                    <p className="text-xs text-muted-foreground/70 text-center py-6">Nenhuma atividade</p>
                  )}
                  {isFinal && colItens.length > 5 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full h-7 text-xs"
                      onClick={() => setShowAllConcluidos((v) => !v)}
                    >
                      {showAllConcluidos ? <><ChevronDown className="w-3 h-3 mr-1" />Ver menos</> : <><ChevronRight className="w-3 h-3 mr-1" />Ver todos ({colItens.length})</>}
                    </Button>
                  )}
                </div>
                {onNovo && col.id === "criacao" && (
                  <button
                    type="button"
                    onClick={onNovo}
                    className="mt-2 w-full rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 py-2 transition-colors"
                  >
                    + Adicionar atividade
                  </button>
                )}
              </div>
            );
          })}
          </div>
        </div>
      ) : (

        <div className="space-y-6">
          {swimlanes.map((lane) => (
            <div key={lane.id}>
              {lane.label && (
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{lane.label}</h3>
                  <div className="flex-1 h-px bg-border" />
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                {colunasStatus.map((col) => {
                  const colItens = itens.filter((it) => it.status === col.id && matchSwimlane(it, lane.id));
                  const vencidos = colItens.filter((it) => {
                    const v = new Date(it.data_vencimento);
                    return isPast(v) && !isToday(v) && it.status !== "concluido";
                  }).length;
                  const isConcluido = col.id === "concluido";
                  const visiveis = isConcluido && !showAllConcluidos
                    ? [...colItens].sort((a, b) => (b.concluido_em ?? "").localeCompare(a.concluido_em ?? "")).slice(0, 5)
                    : colItens;

                  return (
                    <div
                      key={col.id}
                      className="rounded-lg border bg-muted/20 p-3 min-h-[200px]"
                      onDragOver={(e) => {
                        const id = e.dataTransfer.getData("text/plain") || arrastandoId;
                        const origem = id ? itens.find((i) => i.id === id) : undefined;
                        if (podeEditar && origem && !emWorkflow(origem) && col.id !== "concluido") e.preventDefault();
                      }}
                      onDrop={(e) => {
                        const id = e.dataTransfer.getData("text/plain");
                        if (!id || !podeEditar) return;
                        const origem = itens.find((i) => i.id === id);
                        // Nunca concluir/avançar por aqui: só a RPC canônica finaliza itens.
                        if (!origem || emWorkflow(origem) || col.id === "concluido") return;
                        onMover(id, col.id);
                      }}
                    >
                      <div className="flex items-center justify-between mb-3 px-1 gap-2">
                        <h4 className="text-sm font-semibold">{col.label}</h4>
                        <div className="flex items-center gap-1">
                          {vencidos > 0 && (
                            <Badge variant="outline" className="h-5 gap-1 border-destructive/40 text-destructive bg-destructive/5">
                              <AlertTriangle className="w-3 h-3" />{vencidos}
                            </Badge>
                          )}
                          <Badge variant="secondary" className="h-5">{colItens.length}</Badge>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {visiveis.map((it) => (
                          <KanbanCard
                            key={it.id}
                            item={it}
                            draggable={podeEditar && !emWorkflow(it)}
                            onClick={() => onSelect(it.id)}
                            currentUserId={currentUserId}
                            onDragStateChange={setArrastandoId}
                          />
                        ))}
                        {colItens.length === 0 && (
                          <p className="text-xs text-muted-foreground text-center py-6">Nenhum item</p>
                        )}
                        {isConcluido && colItens.length > 5 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full h-7 text-xs"
                            onClick={() => setShowAllConcluidos((v) => !v)}
                          >
                            {showAllConcluidos ? <><ChevronDown className="w-3 h-3 mr-1" />Ver menos</> : <><ChevronRight className="w-3 h-3 mr-1" />Ver todos ({colItens.length})</>}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function KanbanCard({ item, draggable, onClick, currentUserId, onDragStateChange }: { item: ControladoriaItem; draggable: boolean; onClick: () => void; currentUserId?: string; onDragStateChange?: (id: string | null) => void }) {
  const isMine = !!currentUserId && item.responsavel_id === currentUserId;
  const participa =
    !!currentUserId &&
    !isMine &&
    (item.executor_id === currentUserId ||
      item.corretor_id === currentUserId ||
      item.revisor_id === currentUserId ||
      item.protocolador_id === currentUserId);
  const venc = new Date(item.data_vencimento);
  const atrasado = isPast(venc) && !isToday(venc) && item.status !== "concluido";
  // Qualquer pessoa com acesso ao quadro pode arrastar (todo mundo pode marcar como protocolado).
  const canDrag = draggable;

  const papelUsuario = isMine
    ? "Responsável atual"
    : item.executor_id === currentUserId
      ? "Você executou"
      : item.revisor_id === currentUserId
        ? "Você revisou"
        : item.corretor_id === currentUserId
          ? "Você corrigiu"
          : item.protocolador_id === currentUserId
            ? "Você protocolou"
            : "";


  const mostrarPrioridade = item.prioridade === "urgente" || item.prioridade === "alta";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Abrir atividade ${item.titulo}`}
      draggable={canDrag}
      onDragStart={(e) => { if (canDrag) { e.dataTransfer.setData("text/plain", item.id); onDragStateChange?.(item.id); } }}
      onDragEnd={() => onDragStateChange?.(null)}

      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      title={participa ? `${papelUsuario} — você pode atualizar o andamento` : undefined}
      className={cn(
        "rounded-xl border border-border/70 bg-card p-3 cursor-pointer transition-all",
        "hover:border-primary/40 hover:shadow-[0_1px_2px_hsl(215_30%_20%/0.06)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        canDrag && "active:opacity-60",
        !canDrag && draggable && "cursor-default",
        atrasado && "border-destructive/40",
        isMine && !atrasado && "border-champagne/50",
        participa && "opacity-80 border-dashed bg-muted/30",
      )}
    >
      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
        <TipoBadge tipo={item.tipo} />
        {mostrarPrioridade && (
          <Badge variant="outline" className={cn("text-[10px] py-0 h-4", PRIORIDADE_CLASS[item.prioridade])}>{PRIORIDADE_LABELS[item.prioridade]}</Badge>
        )}
        {isMine && (
          <Badge variant="outline" className="text-[10px] py-0 h-4 border-champagne/60 text-champagne bg-champagne/10">
            Sua vez
          </Badge>
        )}
        {participa && (
          <Badge
            variant="outline"
            className="text-[10px] py-0 h-4 border-muted-foreground/30 text-muted-foreground"
            title={papelUsuario}
          >
            Acompanhando
          </Badge>
        )}
      </div>
      <p className={cn("text-[13px] font-medium leading-snug mb-1 line-clamp-2", participa && "text-muted-foreground")}>{item.titulo}</p>
      {(item.cliente?.nome || item.processo?.numero_cnj) && (
        <p className="text-[11px] text-muted-foreground line-clamp-1 mb-2">
          {item.cliente?.nome ?? item.processo?.numero_cnj}
        </p>
      )}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50">
        <p className={cn("text-[11px] mt-1.5", atrasado ? "text-destructive font-medium" : "text-muted-foreground")}>{formatDate(item.data_vencimento)}</p>
        <div className="mt-1.5">
          <ResponsavelAvatar
            nome={item.responsavel?.nome ?? null}
            id={item.responsavel_id ?? undefined}
            size="xs"
          />
        </div>
      </div>
    </div>
  );
}
