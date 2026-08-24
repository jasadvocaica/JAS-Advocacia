import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, Check, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface Notif {
  id: string;
  tipo: string;
  titulo: string;
  descricao: string | null;
  link: string | null;
  lida: boolean;
  criado_em: string;
}

export function NotificacoesBadge() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const initialLoad = useRef(true);

  const carregar = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notificacoes")
      .select("id,tipo,titulo,descricao,link,lida,criado_em")
      .eq("user_id", user.id)
      .order("criado_em", { ascending: false })
      .limit(10);
    setItems((data ?? []) as Notif[]);
    const { count } = await supabase
      .from("notificacoes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("lida", false);
    setUnread(count ?? 0);
  };

  useEffect(() => {
    if (!user) return;
    carregar();
    const channel = supabase
      .channel(`notif-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notificacoes", filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload.eventType === "INSERT" && !initialLoad.current) {
            const n = payload.new as Notif;
            toast(n.titulo, { description: n.descricao ?? undefined });
          }
          carregar();
        }
      )
      .subscribe();
    initialLoad.current = false;
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  const marcarLida = async (id: string) => {
    await supabase.from("notificacoes").update({ lida: true, lida_em: new Date().toISOString() }).eq("id", id);
    carregar();
  };

  const marcarTodas = async () => {
    if (!user) return;
    await supabase.from("notificacoes").update({ lida: true, lida_em: new Date().toISOString() })
      .eq("user_id", user.id).eq("lida", false);
    carregar();
  };

  const abrir = (n: Notif) => {
    if (!n.lida) marcarLida(n.id);
    setOpen(false);
    if (n.link) navigate(n.link);
    else navigate("/notificacoes");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {unread > 0 && (
            <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-gold text-sidebar flex items-center justify-center leading-none">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-3 border-b">
          <h3 className="font-semibold text-sm">Notificações</h3>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={marcarTodas}>
              <CheckCheck className="w-3 h-3" /> Marcar todas
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-96">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8 px-3">Nenhuma notificação</p>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={cn(
                    "p-3 hover:bg-accent/40 cursor-pointer flex gap-2",
                    !n.lida && "bg-primary/5",
                  )}
                  onClick={() => abrir(n)}
                >
                  <div className={cn("w-1.5 h-1.5 rounded-full mt-1.5 shrink-0", !n.lida ? "bg-primary" : "bg-transparent")} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{n.titulo}</p>
                    {n.descricao && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.descricao}</p>}
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(n.criado_em), { addSuffix: true, locale: ptBR })}
                    </p>
                  </div>
                  {!n.lida && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={(e) => { e.stopPropagation(); marcarLida(n.id); }}
                    >
                      <Check className="w-3 h-3" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
        <div className="p-2 border-t">
          <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => { setOpen(false); navigate("/notificacoes"); }}>
            Ver todas
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
