import { useState } from "react";
import { toast } from "sonner";
import { chamarMotor } from "@/pages/agentes-ia/escritorio/missoes/motor";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
interface Agente {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  executor: string | null;
  ferramentas: string[];
}
export default function AgentesMarketing() {
  const { user, isGestor } = useAuth();
  const [pedido, setPedido] = useState<{ agente: Agente; chave: string; titulo: string; objetivo: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  async function solicitar() {
    if (!pedido || !isGestor || enviando) return;
    setEnviando(true);
    try {
      await chamarMotor({ acao: "criar_missao", agente_id: pedido.agente.id,
        titulo: pedido.titulo.trim(), objetivo: pedido.objetivo.trim(), chave: pedido.chave, prioridade: 3 });
      toast.success("Missão registrada. Acompanhe a execução e revise a entrega no Escritório.");
      setPedido(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível registrar a missão"); }
    finally { setEnviando(false); }
  }
  const q = useQuery({
    queryKey: ["mkt-equipe-real", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("mkt_equipe_disponivel" as never);
      if (error) throw error;
      return data as unknown as Agente[];
    },
    retry: false,
  });
  // Não reutiliza nomes/permissões anteriores após revogação de acesso.
  const agentes = q.error ? [] : q.data ?? [];
  return (
    <section className="space-y-3">
      <h2 className="font-semibold text-xl">Equipe de apoio ao Marketing</h2>
      <p className="text-sm text-muted-foreground">
        Agentes cadastrados na sala de Marketing. As entregas passam por revisão;
        o motor confere permissões e orçamento antes de cada execução.
      </p>
      {q.isPending && <p role="status">Conferindo equipe…</p>}
      {q.error && <p role="alert">Não foi possível consultar a equipe. Recarregue ou confira seu acesso.</p>}
      {q.isSuccess && !agentes.length && <p>Nenhum agente cadastrado na sala de Marketing. O planejamento e a produção manual continuam disponíveis.</p>}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {agentes.map(a => (
          <Card key={a.id} className="p-4 space-y-2">
            <h3 className="font-semibold">{a.nome}</h3>
            {a.descricao && <p className="text-sm whitespace-pre-wrap">{a.descricao}</p>}
            <p className="text-sm">{!a.ativo ? "Desativado" : a.executor ? "Disponível para missões com revisão" : "Executor ainda não configurado"}</p>
            <p className="text-xs text-muted-foreground">
              {a.ferramentas.length} ferramentas concedidas. Cadastro ativo não comprova entrega ou publicação.
            </p>
            {isGestor && <Button disabled={!a.ativo || !a.executor} size="sm" onClick={() => setPedido({ agente: a, chave: `marketing-${crypto.randomUUID()}`, titulo: `Análise de Marketing · ${a.nome}`, objetivo: "" })}>Solicitar entrega</Button>}
            <Button asChild variant="outline" size="sm"><Link to="/escritorio/missoes">Acompanhar missões</Link></Button>
          </Card>
        ))}
      </div>
      {isGestor && <Button asChild variant="outline"><Link to="/escritorio">Gerenciar equipe e entregas</Link></Button>}
      <Dialog open={!!pedido} onOpenChange={aberto => { if (!aberto && !enviando) setPedido(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Solicitar entrega · {pedido?.agente.nome}</DialogTitle><DialogDescription>A missão usa o motor e o orçamento existentes. A entrega precisa de revisão; uma missão registrada ainda não é uma execução concluída.</DialogDescription></DialogHeader>
          <label className="text-sm">Título<Input maxLength={200} disabled={enviando} value={pedido?.titulo ?? ""} onChange={e => setPedido(p => p && ({ ...p, titulo: e.target.value }))} /></label>
          <label className="text-sm">O que precisa ser feito<Textarea rows={5} maxLength={4000} disabled={enviando} placeholder="Informe o objetivo, a conta e o período. Não inclua senhas ou dados sensíveis desnecessários." value={pedido?.objetivo ?? ""} onChange={e => setPedido(p => p && ({ ...p, objetivo: e.target.value }))} /></label>
          <Button disabled={enviando || !pedido?.titulo.trim() || !pedido?.objetivo.trim()} onClick={solicitar}>{enviando ? "Registrando…" : "Registrar missão"}</Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
