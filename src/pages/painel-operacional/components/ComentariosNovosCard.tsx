import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MessageSquare } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Notif {
  id: string;
  titulo: string;
  descricao: string | null;
  link: string | null;
  item_id: string | null;
  criado_em: string;
}

export function ComentariosNovosCard() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notif[]>([]);

  const carregar = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notificacoes")
      .select("id, titulo, descricao, link, item_id, criado_em")
      .eq("user_id", user.id)
      .eq("tipo", "controladoria_comentario")
      .eq("lida", false)
      .order("criado_em", { ascending: false })
      .limit(5);
    setItems((data ?? []) as Notif[]);
  };

  useEffect(() => {
    carregar();
    if (!user) return;
    const ch = supabase
      .channel(`coment-novos-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notificacoes", filter: `user_id=eq.${user.id}` },
        () => carregar(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  if (!items.length) return null;

  return (
    <Card className="border-primary/30 bg-primary/5 p-4">
      <div className="mb-3 flex items-center gap-2 text-primary">
        <MessageSquare className="h-5 w-5" />
        <h2 className="text-sm font-semibold uppercase tracking-wide">
          Comentários novos · {items.length}
        </h2>
      </div>
      <ul className="space-y-2">
        {items.map((n) => (
          <li
            key={n.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/20 bg-card px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground">{n.titulo}</div>
              {n.descricao && (
                <div className="truncate text-xs text-muted-foreground">{n.descricao}</div>
              )}
              <div className="text-[11px] text-muted-foreground">
                {formatDistanceToNow(new Date(n.criado_em), { addSuffix: true, locale: ptBR })}
              </div>
            </div>
            {n.link && (
              <Button asChild size="sm" variant="default">
                <Link to={n.link}>Abrir</Link>
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
