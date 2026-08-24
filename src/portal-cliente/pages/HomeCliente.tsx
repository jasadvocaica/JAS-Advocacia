// Início do portal: saudação + cards-resumo (processos, atualizações novas, mensagens não lidas)
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Briefcase, Bell, MessageCircle, Folder, Loader2, Clock } from "lucide-react";
import { usePortalCliente } from "../usePortalCliente";

export default function HomeCliente() {
  const { clienteId, clienteNome } = usePortalCliente();
  const [resumo, setResumo] = useState({ processos: 0, novidades: 0, mensagens: 0, documentos: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [procs, atus, msgs, docs] = await Promise.all([
        supabase.from("processos").select("id", { count: "exact", head: true }).eq("cliente_id", clienteId),
        supabase.from("cliente_portal_atualizacoes").select("id", { count: "exact", head: true })
          .eq("cliente_id", clienteId).eq("publicado", true),
        supabase.from("cliente_portal_mensagens").select("id", { count: "exact", head: true })
          .eq("cliente_id", clienteId).eq("lida", false).eq("remetente_tipo", "escritorio"),
        supabase.from("cliente_portal_documentos").select("id", { count: "exact", head: true })
          .eq("cliente_id", clienteId),
      ]);
      setResumo({
        processos: procs.count ?? 0,
        novidades: atus.count ?? 0,
        mensagens: msgs.count ?? 0,
        documentos: docs.count ?? 0,
      });
      setLoading(false);
    })();
  }, [clienteId]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const cards = [
    { to: "/portal-cliente/processos", icon: Briefcase, label: "Processos", n: resumo.processos },
    { to: "/portal-cliente/atualizacoes", icon: Bell, label: "Atualizações", n: resumo.novidades },
    { to: "/portal-cliente/mensagens", icon: MessageCircle, label: "Mensagens novas", n: resumo.mensagens },
    { to: "/portal-cliente/documentos", icon: Folder, label: "Documentos", n: resumo.documentos },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-display text-3xl">Olá, {clienteNome.split(" ")[0]}.</h1>
        <p className="text-muted-foreground">Aqui você acompanha o andamento do seu caso com a transparência que você merece.</p>
      </div>

      <div className="rounded-xl border border-gold/30 bg-gold/5 p-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-gold/15 flex items-center justify-center shrink-0">
          <Clock className="w-5 h-5 text-gold-dark" />
        </div>
        <div className="text-sm leading-relaxed">
          <p className="font-medium text-foreground">Acesso liberado — estamos sincronizando suas informações</p>
          <p className="text-muted-foreground mt-0.5">
            Em até <strong>48 horas</strong> seus processos, documentos, atualizações e dados financeiros terminam de ser carregados aqui no portal. Se algo continuar em branco depois desse prazo, fale com a equipe pela aba <strong>Mensagens</strong>.
          </p>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(c => {
          const Icon = c.icon;
          return (
            <Link key={c.to} to={c.to}>
              <Card className="p-5 hover:shadow-md hover:border-gold/40 transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-md bg-gold/10 flex items-center justify-center text-gold-dark">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-display">{c.n}</p>
                    <p className="text-xs text-muted-foreground">{c.label}</p>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
