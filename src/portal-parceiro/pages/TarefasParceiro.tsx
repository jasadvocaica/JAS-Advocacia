import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, Eye, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import type { PortalParceiroContext } from "../PortalParceiroLayout";
import { registrarAcaoParceiro } from "../auditLog";

const COLUNAS = [
  { id: "pendente", label: "Pendente" },
  { id: "em_andamento", label: "Em andamento" },
  { id: "concluido", label: "Concluído" },
];

export default function TarefasParceiro() {
  const { parceiro } = useOutletContext<PortalParceiroContext>();
  const { user } = useAuth();
  const [tarefas, setTarefas] = useState<any[]>([]);
  const [responsavelIds, setResponsavelIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    // RLS já garante: visivel_parceiro = true E processo do parceiro
    const { data } = await supabase
      .from("controladoria_itens")
      .select("id, titulo, descricao, data_vencimento, tipo, prioridade, status, processo_id, processos:processo_id(numero_cnj, nb_inss), clientes:cliente_id(nome)")
      .order("data_vencimento", { ascending: true });

    const lista = (data as any[]) ?? [];
    setTarefas(lista);

    // descobre quais itens o parceiro é responsável (única coisa que pode atualizar)
    if (lista.length > 0 && user) {
      const { data: resp } = await supabase
        .from("controladoria_responsaveis")
        .select("item_id")
        .eq("user_id", user.id)
        .in("item_id", lista.map((t) => t.id));
      setResponsavelIds(new Set(((resp as any[]) ?? []).map((r) => r.item_id)));
    } else {
      setResponsavelIds(new Set());
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [parceiro.id, user?.id]);

  const mover = async (id: string, novoStatus: string, ehFatal: boolean, titulo?: string) => {
    if (novoStatus === "concluido" && ehFatal) {
      if (!confirm("Esta tarefa é um PRAZO FATAL. Confirmar conclusão?")) return;
    }
    const updates: any = { status: novoStatus };
    if (novoStatus === "concluido") updates.concluido_em = new Date().toISOString();
    const { error } = await supabase.from("controladoria_itens").update(updates).eq("id", id);
    if (error) { toast.error(error.message); return; }
    if (novoStatus === "concluido") {
      void registrarAcaoParceiro({
        parceiroId: parceiro.id,
        acao: "concluiu_tarefa",
        recursoTipo: "tarefa",
        recursoId: id,
        descricao: titulo,
        contexto: { fatal: ehFatal },
      });
    }
    toast.success("Tarefa atualizada");
    load();
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <PageHeader title="Minhas tarefas" description="Apenas tarefas atribuídas a você pelo escritório" />

      <Card className="p-3 bg-muted/40 border-dashed text-xs text-muted-foreground flex items-start gap-2">
        <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          Você só vê tarefas que o escritório marcou como visíveis para o parceiro.
          Apenas tarefas onde você é o responsável podem ser concluídas por aqui.
        </p>
      </Card>

      <div className="grid md:grid-cols-3 gap-3">
        {COLUNAS.map((col) => {
          const itens = tarefas.filter((t) => t.status === col.id);
          return (
            <div key={col.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm">{col.label}</h3>
                <Badge variant="secondary">{itens.length}</Badge>
              </div>
              <div className="space-y-2 min-h-[200px]">
                {itens.length === 0 ? (
                  <Card className="p-4 text-xs text-muted-foreground text-center border-dashed">Vazio</Card>
                ) : itens.map((t) => {
                  const fatal = t.tipo === "prazo_fatal";
                  const ehResponsavel = responsavelIds.has(t.id);
                  return (
                    <Card key={t.id} className={`p-3 space-y-2 ${fatal ? "border-destructive/40" : ""}`}>
                      <div className="flex items-start gap-2">
                        {fatal && <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />}
                        <p className="text-sm font-medium flex-1">{t.titulo}</p>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {t.processos?.numero_cnj ?? t.processos?.nb_inss} · {t.clientes?.nome}
                      </p>
                      <p className="text-[11px] text-muted-foreground">Vence {formatDate(t.data_vencimento)}</p>
                      {ehResponsavel ? (
                        <div className="flex gap-1 pt-1">
                          {col.id !== "pendente" && (
                            <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => mover(t.id, "pendente", fatal, t.titulo)}>← Pend</Button>
                          )}
                          {col.id !== "em_andamento" && (
                            <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => mover(t.id, "em_andamento", fatal, t.titulo)}>Em and</Button>
                          )}
                          {col.id !== "concluido" && (
                            <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => mover(t.id, "concluido", fatal, t.titulo)}>Concluir</Button>
                          )}
                        </div>
                      ) : (
                        <p className="text-[10px] text-muted-foreground italic flex items-center gap-1 pt-1">
                          <Eye className="w-3 h-3" /> Acompanhamento (responsável: escritório)
                        </p>
                      )}
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
