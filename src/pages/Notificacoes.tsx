import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Loader2, BellOff, Check, Trash2, ExternalLink, Bell } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Notificacao {
  id: string;
  tipo: string;
  titulo: string;
  descricao: string | null;
  link: string | null;
  lida: boolean;
  criado_em: string;
}

function agruparPorData(items: Notificacao[]) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const ontem = new Date(hoje); ontem.setDate(ontem.getDate() - 1);
  const semana = new Date(hoje); semana.setDate(semana.getDate() - 7);

  const grupos: Record<string, Notificacao[]> = { Hoje: [], Ontem: [], "Esta semana": [], "Mais antigas": [] };
  for (const n of items) {
    const d = new Date(n.criado_em);
    if (d >= hoje) grupos["Hoje"].push(n);
    else if (d >= ontem) grupos["Ontem"].push(n);
    else if (d >= semana) grupos["Esta semana"].push(n);
    else grupos["Mais antigas"].push(n);
  }
  return grupos;
}

export default function Notificacoes() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notificacao[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("notificacoes")
      .select("*")
      .eq("user_id", user.id)
      .order("criado_em", { ascending: false })
      .limit(200);
    setItems(data ?? []);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, [user?.id]);

  const marcarLida = async (n: Notificacao) => {
    if (n.lida) return;
    await supabase.from("notificacoes").update({ lida: true, lida_em: new Date().toISOString() }).eq("id", n.id);
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, lida: true } : x)));
  };

  const lerTodas = async () => {
    if (!user) return;
    await supabase
      .from("notificacoes")
      .update({ lida: true, lida_em: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("lida", false);
    toast.success("Todas marcadas como lidas");
    carregar();
  };

  const excluir = async (id: string) => {
    await supabase.from("notificacoes").delete().eq("id", id);
    setItems((prev) => prev.filter((x) => x.id !== id));
  };

  const grupos = agruparPorData(items);
  const naoLidas = items.filter((x) => !x.lida).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notificações"
        description={naoLidas > 0 ? `${naoLidas} não lida${naoLidas > 1 ? "s" : ""}` : "Tudo em dia"}
      >
        {naoLidas > 0 && (
          <Button variant="outline" onClick={lerTodas}>
            <Check className="w-4 h-4 mr-2" /> Marcar todas como lidas
          </Button>
        )}
      </PageHeader>

      {loading ? (
        <div className="py-16 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      ) : items.length === 0 ? (
        <div className="py-20 text-center">
          <BellOff className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">Nenhuma notificação por aqui.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grupos).map(([titulo, lista]) => lista.length > 0 && (
            <div key={titulo}>
              <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2 px-1">{titulo}</h3>
              <div className="rounded-lg border bg-card divide-y">
                {lista.map((n) => (
                  <div key={n.id} className={cn(
                    "flex items-start gap-3 p-4 transition-colors",
                    !n.lida && "bg-primary/5"
                  )}>
                    <div className={cn(
                      "mt-0.5 w-9 h-9 rounded-full flex items-center justify-center shrink-0",
                      n.lida ? "bg-muted" : "bg-primary text-primary-foreground"
                    )}>
                      <Bell className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium leading-tight">{n.titulo}</p>
                          {n.descricao && <p className="text-sm text-muted-foreground mt-0.5">{n.descricao}</p>}
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(n.criado_em).toLocaleString("pt-BR")}
                          </p>
                        </div>
                        {!n.lida && <span className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" aria-label="Não lida" />}
                      </div>
                      <div className="flex gap-2 mt-2">
                        {n.link && (
                          <Button asChild variant="outline" size="sm" onClick={() => marcarLida(n)}>
                            <Link to={n.link}><ExternalLink className="w-3 h-3 mr-1.5" />Abrir</Link>
                          </Button>
                        )}
                        {!n.lida && (
                          <Button variant="ghost" size="sm" onClick={() => marcarLida(n)}>
                            <Check className="w-3 h-3 mr-1.5" /> Marcar lida
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => excluir(n.id)} className="text-destructive">
                          <Trash2 className="w-3 h-3 mr-1.5" /> Excluir
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
