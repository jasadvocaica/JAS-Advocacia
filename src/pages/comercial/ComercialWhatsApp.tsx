import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Users, Clock3, CircleCheck, PlugZap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Conversa = {
  id: string;
  nome_contato: string | null;
  telefone: string;
  status: string;
  ultima_mensagem_em: string | null;
  ultima_mensagem_resumo: string | null;
  nao_lidas: number;
};

export default function ComercialWhatsApp() {
  const { data: conversas = [], isLoading } = useQuery({
    queryKey: ["whatsapp-conversas"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("whatsapp_conversas")
        .select("id,nome_contato,telefone,status,ultima_mensagem_em,ultima_mensagem_resumo,nao_lidas")
        .order("ultima_mensagem_em", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Conversa[];
    },
  });

  const indicadores = useMemo(() => ({
    abertas: conversas.filter((c) => c.status !== "encerrada").length,
    aguardando: conversas.filter((c) => c.status === "aguardando_escritorio").length,
    naoLidas: conversas.reduce((total, c) => total + (c.nao_lidas || 0), 0),
    encerradas: conversas.filter((c) => c.status === "encerrada").length,
  }), [conversas]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Comercial</p>
          <h1 className="font-display text-3xl">Atendimento e WhatsApp</h1>
          <p className="mt-1 text-sm text-muted-foreground">Central comercial vinculada aos leads e clientes reais do escritório.</p>
        </div>
        <Button variant="outline" disabled className="gap-2">
          <PlugZap className="h-4 w-4" />
          Configurar provedor
        </Button>
      </header>

      <Card className="border-amber-200 bg-amber-50/70 p-4">
        <div className="flex items-start gap-3">
          <MessageCircle className="mt-0.5 h-5 w-5 text-amber-700" />
          <div>
            <p className="font-medium text-amber-950">Integração ainda não conectada</p>
            <p className="text-sm text-amber-800">A estrutura está pronta, mas nenhuma mensagem será buscada ou enviada até a configuração do provedor oficial.</p>
          </div>
        </div>
      </Card>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador icon={Users} label="Conversas abertas" valor={indicadores.abertas} />
        <Indicador icon={Clock3} label="Aguardando escritório" valor={indicadores.aguardando} />
        <Indicador icon={MessageCircle} label="Não lidas" valor={indicadores.naoLidas} />
        <Indicador icon={CircleCheck} label="Encerradas" valor={indicadores.encerradas} />
      </section>

      <Card className="overflow-hidden">
        <div className="border-b p-5">
          <h2 className="font-display text-xl">Conversas</h2>
          <p className="text-sm text-muted-foreground">Somente contatos vinculados a um lead ou cliente cadastrado.</p>
        </div>
        <div className="divide-y">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Carregando conversas…</p>
          ) : conversas.length === 0 ? (
            <div className="p-10 text-center">
              <MessageCircle className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
              <p className="font-medium">Nenhuma conversa sincronizada</p>
              <p className="mt-1 text-sm text-muted-foreground">Isso é esperado enquanto o provedor do WhatsApp não estiver configurado.</p>
            </div>
          ) : conversas.map((conversa) => (
            <div key={conversa.id} className="flex items-center gap-4 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{conversa.nome_contato || conversa.telefone}</p>
                <p className="truncate text-sm text-muted-foreground">{conversa.ultima_mensagem_resumo || "Sem mensagem registrada"}</p>
              </div>
              {conversa.nao_lidas > 0 && <Badge>{conversa.nao_lidas}</Badge>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Indicador({ icon: Icon, label, valor }: { icon: typeof Users; label: string; valor: number }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="h-5 w-5" /></div>
        <div><p className="text-2xl font-semibold tabular-nums">{valor}</p><p className="text-xs text-muted-foreground">{label}</p></div>
      </div>
    </Card>
  );
}
