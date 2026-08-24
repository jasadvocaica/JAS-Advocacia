import { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Loader2, ListChecks, Check, ExternalLink, Briefcase, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import {
  TIPO_LABELS, PRIORIDADE_CLASS, TIPO_CLASS, TipoItem, StatusItem, Prioridade,
} from "@/pages/controladoria/types";
import NovaTarefaPanel from "./NovaTarefaPanel";

interface TarefaCli {
  id: string;
  titulo: string;
  tipo: TipoItem;
  status: StatusItem;
  prioridade: Prioridade;
  data_vencimento: string;
  processo_id: string | null;
  processo?: { numero_cnj: string | null; tipo_acao: string | null } | null;
  responsavel?: { nome: string } | null;
}

interface Props {
  clienteId: string;
  clienteNome: string;
  onChanged?: () => void;
}

const STATUS_ABERTOS: StatusItem[] = ["pendente", "em_andamento", "aguardando"];

export default function TarefasTab({ clienteId, clienteNome, onChanged }: Props) {
  const { user, hasPermission } = useAuth();
  const [tarefas, setTarefas] = useState<TarefaCli[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<"abertas" | "todas" | "atrasadas" | "concluidas">("abertas");
  const [filtroResp, setFiltroResp] = useState<string>("todos");
  const [painelAberto, setPainelAberto] = useState(false);

  const podeCriar = hasPermission("controladoria", "criar");
  const podeEditar = hasPermission("controladoria", "editar");

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("controladoria_itens")
      .select(`
        id, titulo, tipo, status, prioridade, data_vencimento, processo_id,
        processo:processos(numero_cnj, tipo_acao),
        responsaveis:controladoria_responsaveis(user_id, papel)
      `)
      .eq("cliente_id", clienteId)
      .order("data_vencimento", { ascending: true });

    if (error) {
      toast.error("Erro ao carregar tarefas", { description: error.message });
      setTarefas([]);
      setLoading(false);
      return;
    }

    // Buscar nomes dos responsáveis em separado (sem FK direta para profiles)
    const userIds = Array.from(
      new Set((data ?? []).flatMap((t: any) => (t.responsaveis ?? []).map((r: any) => r.user_id)))
    );
    let nomesPorId = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, nome")
        .in("id", userIds);
      (profs ?? []).forEach((p: any) => nomesPorId.set(p.id, p.nome));
    }

    const list = (data ?? []).map((t: any) => {
      const principal = (t.responsaveis ?? []).find((r: any) => r.papel === "principal") ?? t.responsaveis?.[0];
      const nome = principal ? nomesPorId.get(principal.user_id) : null;
      return {
        ...t,
        responsavel: nome ? { nome } : null,
      } as TarefaCli;
    });
    setTarefas(list);
    setLoading(false);
  }, [clienteId]);

  useEffect(() => { carregar(); }, [carregar]);

  const responsaveisUnicos = useMemo(() => {
    const set = new Map<string, string>();
    tarefas.forEach((t) => {
      if (t.responsavel?.nome) set.set(t.responsavel.nome, t.responsavel.nome);
    });
    return Array.from(set.values()).sort();
  }, [tarefas]);

  const hoje = new Date().toISOString().slice(0, 10);

  const filtradas = useMemo(() => {
    return tarefas.filter((t) => {
      const dv = (t.data_vencimento ?? "").slice(0, 10);
      const aberto = STATUS_ABERTOS.includes(t.status);
      if (filtroStatus === "abertas" && !aberto) return false;
      if (filtroStatus === "concluidas" && t.status !== "concluido") return false;
      if (filtroStatus === "atrasadas" && (!aberto || dv >= hoje)) return false;
      // "todas" passa
      if (filtroResp !== "todos" && t.responsavel?.nome !== filtroResp) return false;
      return true;
    });
  }, [tarefas, filtroStatus, filtroResp, hoje]);

  const abertas = filtradas.filter((t) => STATUS_ABERTOS.includes(t.status));
  const concluidas = filtradas.filter((t) => t.status === "concluido");

  async function concluirRapido(id: string) {
    const patch = {
      status: "concluido" as StatusItem,
      concluido_em: new Date().toISOString(),
      concluido_por: user?.id ?? null,
    };
    // Otimista
    setTarefas((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    const { error } = await supabase.from("controladoria_itens").update(patch).eq("id", id);
    if (error) {
      toast.error("Não foi possível concluir", { description: error.message });
      carregar();
    } else {
      toast.success("Tarefa concluída");
      onChanged?.();
    }
  }

  return (
    <div className="space-y-4">
      {/* Header da aba */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filtroStatus} onValueChange={(v) => setFiltroStatus(v as any)}>
            <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="abertas">Em aberto</SelectItem>
              <SelectItem value="atrasadas">Atrasadas</SelectItem>
              <SelectItem value="concluidas">Concluídas</SelectItem>
              <SelectItem value="todas">Todas</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filtroResp} onValueChange={setFiltroResp}>
            <SelectTrigger className="h-9 w-[200px]">
              <SelectValue placeholder="Responsável" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Qualquer responsável</SelectItem>
              {responsaveisUnicos.map((n) => (
                <SelectItem key={n} value={n}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {podeCriar && (
          <Button variant="gold" size="sm" onClick={() => setPainelAberto(true)}>
            <Plus className="w-4 h-4" /> Nova tarefa
          </Button>
        )}
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gold" />
        </div>
      ) : filtradas.length === 0 ? (
        <Card className="p-10 text-center">
          <ListChecks className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">Nenhuma tarefa encontrada</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Ajuste os filtros ou crie a primeira tarefa para este cliente.
          </p>
          {podeCriar && (
            <Button variant="outline" size="sm" className="mt-4" onClick={() => setPainelAberto(true)}>
              <Plus className="w-4 h-4" /> Criar primeira tarefa
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-5">
          {abertas.length > 0 && (filtroStatus === "abertas" || filtroStatus === "todas" || filtroStatus === "atrasadas") && (
            <section className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Em aberto · {abertas.length}
              </h4>
              <div className="space-y-2">
                {abertas.map((t) => (
                  <CardTarefa
                    key={t.id}
                    tarefa={t}
                    hoje={hoje}
                    podeEditar={podeEditar}
                    onConcluir={() => concluirRapido(t.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {concluidas.length > 0 && (filtroStatus === "concluidas" || filtroStatus === "todas") && (
            <section className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Concluídas · {concluidas.length}
              </h4>
              <div className="space-y-2">
                {concluidas.map((t) => (
                  <CardTarefa key={t.id} tarefa={t} hoje={hoje} podeEditar={podeEditar} concluida />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <NovaTarefaPanel
        open={painelAberto}
        onClose={() => setPainelAberto(false)}
        clienteId={clienteId}
        clienteNome={clienteNome}
        onCriada={() => { carregar(); onChanged?.(); }}
      />
    </div>
  );
}

function CardTarefa({
  tarefa, hoje, concluida, podeEditar, onConcluir,
}: {
  tarefa: TarefaCli;
  hoje: string;
  concluida?: boolean;
  podeEditar?: boolean;
  onConcluir?: () => void;
}) {
  const dv = (tarefa.data_vencimento ?? "").slice(0, 10);
  const vencida = !concluida && dv && dv < hoje;
  const ehHoje = !concluida && dv === hoje;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-md border bg-card px-3 py-2.5",
        vencida && "border-l-4 border-l-destructive bg-destructive/5",
        ehHoje && "border-l-4 border-l-warning",
        concluida && "opacity-70",
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("font-medium text-sm truncate", concluida && "line-through")}>{tarefa.titulo}</span>
          <Badge variant="outline" className={cn("text-[10px]", TIPO_CLASS[tarefa.tipo])}>
            {TIPO_LABELS[tarefa.tipo]}
          </Badge>
          {!concluida && (
            <Badge variant="outline" className={cn("text-[10px]", PRIORIDADE_CLASS[tarefa.prioridade])}>
              {tarefa.prioridade}
            </Badge>
          )}
          {vencida && (
            <Badge variant="outline" className="text-[10px] bg-destructive/15 text-destructive border-destructive/30">
              <AlertTriangle className="w-3 h-3 mr-1" /> Vencida
            </Badge>
          )}
          {ehHoje && (
            <Badge variant="outline" className="text-[10px] bg-warning/15 text-warning border-warning/30">
              Hoje
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span>Vence {formatDate(tarefa.data_vencimento)}</span>
          {tarefa.responsavel?.nome && (<><span>·</span><span>{tarefa.responsavel.nome}</span></>)}
          {tarefa.processo?.numero_cnj && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <Briefcase className="w-3 h-3" /> {tarefa.processo.numero_cnj}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {!concluida && podeEditar && onConcluir && (
          <Button size="icon" variant="ghost" className="h-7 w-7" title="Concluir" onClick={onConcluir}>
            <Check className="w-4 h-4" />
          </Button>
        )}
        <Button size="icon" variant="ghost" className="h-7 w-7" asChild title="Abrir na Controladoria">
          <Link to={`/controladoria?item=${tarefa.id}`}>
            <ExternalLink className="w-4 h-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
