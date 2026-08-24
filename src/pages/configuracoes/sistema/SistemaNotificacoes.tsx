import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, Mail, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ConfigEvento {
  id: string;
  chave: string;
  nome: string;
  descricao: string | null;
  modulo: string;
  ativo: boolean;
  enviar_email: boolean;
  papeis_destino: string[];
}

const RotuloModulo: Record<string, string> = {
  controladoria: "Controladoria",
  processos: "Processos",
  financeiro: "Financeiro",
  parceiros: "Parceiros",
  clientes: "Clientes",
  portal: "Portais",
  importacao_exportacao: "Importação/Exportação",
};

/**
 * Página de configuração de notificações internas.
 * Gestor escolhe, por evento, se ele dispara notificação no sino, e-mail e
 * para quais papéis. Os toggles são otimistas mas só persistidos no botão Salvar.
 */
export default function SistemaNotificacoes() {
  const qc = useQueryClient();
  const [salvando, setSalvando] = useState(false);
  const [edits, setEdits] = useState<Record<string, Partial<ConfigEvento>>>({});

  const { data: eventos, isLoading } = useQuery({
    queryKey: ["notificacoes-config-eventos"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("notificacoes_config_eventos")
        .select("*")
        .order("modulo")
        .order("nome");
      if (error) throw error;
      return data as ConfigEvento[];
    },
  });

  // limpar edições pendentes quando os dados recarregam
  useEffect(() => {
    if (eventos) setEdits({});
  }, [eventos?.length]);

  const grupos = useMemo(() => {
    if (!eventos) return [];
    const por: Record<string, ConfigEvento[]> = {};
    for (const e of eventos) {
      if (!por[e.modulo]) por[e.modulo] = [];
      por[e.modulo].push(e);
    }
    return Object.entries(por).sort(([a], [b]) => a.localeCompare(b));
  }, [eventos]);

  function patch(id: string, partial: Partial<ConfigEvento>) {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...partial } }));
  }

  function valorAtual<K extends keyof ConfigEvento>(e: ConfigEvento, campo: K): ConfigEvento[K] {
    const ed = edits[e.id]?.[campo];
    return (ed ?? e[campo]) as ConfigEvento[K];
  }

  const totalPendentes = Object.keys(edits).length;

  async function salvar() {
    if (totalPendentes === 0) return;
    setSalvando(true);
    try {
      for (const [id, partial] of Object.entries(edits)) {
        const { error } = await (supabase as any)
          .from("notificacoes_config_eventos")
          .update(partial)
          .eq("id", id);
        if (error) throw error;
      }
      toast.success(`${totalPendentes} evento(s) atualizado(s)`);
      setEdits({});
      qc.invalidateQueries({ queryKey: ["notificacoes-config-eventos"] });
    } catch (err) {
      toast.error("Falha ao salvar", {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    } finally {
      setSalvando(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Bell className="w-5 h-5 text-gold" />
            Notificações internas
          </h2>
          <p className="text-sm text-muted-foreground">
            Escolha quais eventos disparam notificação no sino e por e-mail, e para quais papéis.
          </p>
        </div>
        <Button onClick={salvar} disabled={totalPendentes === 0 || salvando}>
          {salvando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Salvar {totalPendentes > 0 && `(${totalPendentes})`}
        </Button>
      </div>

      {grupos.map(([modulo, eventosDoModulo]) => (
        <Card key={modulo}>
          <CardHeader>
            <CardTitle className="text-base">{RotuloModulo[modulo] ?? modulo}</CardTitle>
            <CardDescription>
              {eventosDoModulo.filter((e) => valorAtual(e, "ativo")).length} de {eventosDoModulo.length} ativos
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-border -mt-2">
            {eventosDoModulo.map((e) => {
              const ativo = valorAtual(e, "ativo");
              const enviarEmail = valorAtual(e, "enviar_email");
              const papeis = valorAtual(e, "papeis_destino") || [];
              return (
                <div key={e.id} className="py-3 flex items-start justify-between gap-6">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`font-medium text-sm ${!ativo ? "text-muted-foreground" : ""}`}>
                        {e.nome}
                      </p>
                      {papeis.map((p) => (
                        <Badge key={p} variant="outline" className="text-[10px] uppercase">
                          {p}
                        </Badge>
                      ))}
                    </div>
                    {e.descricao && (
                      <p className="text-xs text-muted-foreground mt-0.5">{e.descricao}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-6 shrink-0">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Bell className="w-3.5 h-3.5 text-muted-foreground" />
                      <Switch
                        checked={ativo}
                        onCheckedChange={(v) => patch(e.id, { ativo: v })}
                      />
                    </label>
                    <label
                      className={`flex items-center gap-2 ${ativo ? "cursor-pointer" : "opacity-40 cursor-not-allowed"}`}
                    >
                      <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                      <Switch
                        checked={enviarEmail}
                        disabled={!ativo}
                        onCheckedChange={(v) => patch(e.id, { enviar_email: v })}
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      <p className="text-xs text-muted-foreground italic">
        💡 Os toggles são salvos somente quando você clica em <strong>Salvar</strong>.
        E-mails dependem de configuração SMTP em Configurações → Integrações.
      </p>
    </div>
  );
}
