import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  Database,
  HardDrive,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

/**
 * Página de manutenção e diagnóstico.
 * Mostra contadores de tabelas críticas, último job de cada serviço (DataJud,
 * Importação/Exportação) e oferece ações de limpeza.
 */
export default function SistemaManutencao() {
  const qc = useQueryClient();
  const [executando, setExecutando] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["manutencao-diagnostico"],
    queryFn: async () => {
      const [
        clientes,
        processos,
        andamentos,
        documentos,
        controladoriaItens,
        notificacoes,
        ieJobs,
        datajudUltima,
        ieUltimo,
        logsAtividade,
      ] = await Promise.all([
        supabase.from("clientes").select("id", { count: "exact", head: true }),
        supabase.from("processos").select("id", { count: "exact", head: true }),
        supabase.from("andamentos").select("id", { count: "exact", head: true }),
        supabase.from("documentos").select("id", { count: "exact", head: true }),
        supabase.from("controladoria_itens").select("id", { count: "exact", head: true }),
        supabase.from("notificacoes").select("id", { count: "exact", head: true }),
        (supabase as any).from("ie_jobs").select("id", { count: "exact", head: true }),
        supabase
          .from("datajud_log_execucoes")
          .select("iniciado_em, finalizado_em, total_consultados, total_erros, modo")
          .order("iniciado_em", { ascending: false })
          .limit(1)
          .maybeSingle(),
        (supabase as any)
          .from("ie_jobs")
          .select("iniciado_em, status, tipo, modulo")
          .order("iniciado_em", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from("user_log_atividade").select("id", { count: "exact", head: true }),
      ]);

      return {
        contadores: {
          clientes: clientes.count ?? 0,
          processos: processos.count ?? 0,
          andamentos: andamentos.count ?? 0,
          documentos: documentos.count ?? 0,
          controladoria: controladoriaItens.count ?? 0,
          notificacoes: notificacoes.count ?? 0,
          ie_jobs: ieJobs.count ?? 0,
          logs: logsAtividade.count ?? 0,
        },
        datajud: datajudUltima.data,
        ie: ieUltimo.data,
      };
    },
  });

  async function executarAcao(
    id: string,
    label: string,
    rpc: () => Promise<{ data: any; error: any }>,
  ) {
    setExecutando(id);
    try {
      const { error } = await rpc();
      if (error) throw error;
      toast.success(`${label} concluída`);
      qc.invalidateQueries({ queryKey: ["manutencao-diagnostico"] });
    } catch (err) {
      toast.error(`Falha em ${label.toLowerCase()}`, {
        description: err instanceof Error ? err.message : "Tente novamente.",
      });
    } finally {
      setExecutando(null);
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
            <Activity className="w-5 h-5 text-gold" />
            Manutenção e diagnóstico
          </h2>
          <p className="text-sm text-muted-foreground">
            Volume de dados, último funcionamento de cada serviço e ações de limpeza.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Contadores */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="w-4 h-4 text-gold" />
            Volume de dados
          </CardTitle>
          <CardDescription>Quantidade total de registros nas principais tabelas.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border border border-border">
            <Contador label="Clientes" valor={data?.contadores.clientes ?? 0} />
            <Contador label="Processos" valor={data?.contadores.processos ?? 0} />
            <Contador label="Andamentos" valor={data?.contadores.andamentos ?? 0} />
            <Contador label="Documentos" valor={data?.contadores.documentos ?? 0} />
            <Contador label="Itens controladoria" valor={data?.contadores.controladoria ?? 0} />
            <Contador label="Notificações" valor={data?.contadores.notificacoes ?? 0} />
            <Contador label="Logs de atividade" valor={data?.contadores.logs ?? 0} />
            <Contador label="Jobs Imp/Exp" valor={data?.contadores.ie_jobs ?? 0} />
          </div>
        </CardContent>
      </Card>

      {/* Status dos serviços */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sincronização DataJud</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.datajud ? (
              <div className="space-y-2 text-sm">
                <StatusLine
                  ok={data.datajud.total_erros === 0}
                  texto={
                    data.datajud.total_erros === 0
                      ? "Última execução sem erros"
                      : `${data.datajud.total_erros} erro(s) na última execução`
                  }
                />
                <p className="text-muted-foreground text-xs">
                  Iniciada em{" "}
                  {format(new Date(data.datajud.iniciado_em), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  {" · "}
                  Modo: <Badge variant="outline" className="text-[10px]">{data.datajud.modo}</Badge>
                </p>
                <p className="text-xs text-muted-foreground">
                  {data.datajud.total_consultados ?? 0} processo(s) consultado(s).
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma execução registrada ainda.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Último Job de Imp/Exp</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.ie ? (
              <div className="space-y-2 text-sm">
                <StatusLine
                  ok={["concluido", "concluido_parcial"].includes(data.ie.status)}
                  texto={`Status: ${data.ie.status}`}
                />
                <p className="text-muted-foreground text-xs">
                  Iniciado em{" "}
                  {format(new Date(data.ie.iniciado_em), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  {" · "}
                  <Badge variant="outline" className="text-[10px]">
                    {data.ie.tipo} · {data.ie.modulo}
                  </Badge>
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum job registrado ainda.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Ações de manutenção */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HardDrive className="w-4 h-4 text-gold" />
            Ações de limpeza
          </CardTitle>
          <CardDescription>
            Operações irreversíveis. Use com cautela e somente quando solicitado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <AcaoManutencao
            titulo="Recalcular parcelas atrasadas"
            descricao="Marca como 'atrasado' todas as parcelas pendentes vencidas e atualiza status dos contratos."
            cta="Executar"
            executando={executando === "parcelas"}
            onClick={() =>
              executarAcao("parcelas", "Recalcular parcelas", async () => {
                const { data: ret, error } = await supabase.rpc("atualizar_parcelas_atrasadas");
                return { data: ret, error };
              })
            }
          />
          <AcaoManutencao
            titulo="Marcar notificações antigas como lidas"
            descricao="Marca como lidas todas as notificações com mais de 30 dias."
            cta="Limpar"
            destrutivo
            executando={executando === "notif"}
            onClick={async () => {
              setExecutando("notif");
              try {
                const corte = new Date();
                corte.setDate(corte.getDate() - 30);
                const { error } = await supabase
                  .from("notificacoes")
                  .update({ lida: true, lida_em: new Date().toISOString() })
                  .eq("lida", false)
                  .lt("criado_em", corte.toISOString());
                if (error) throw error;
                toast.success("Notificações antigas marcadas como lidas");
                qc.invalidateQueries({ queryKey: ["manutencao-diagnostico"] });
              } catch (err) {
                toast.error("Falha", {
                  description: err instanceof Error ? err.message : "Tente novamente.",
                });
              } finally {
                setExecutando(null);
              }
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Contador({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="bg-background p-3">
      <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{label}</p>
      <p className="text-2xl font-serif tabular-nums">{valor.toLocaleString("pt-BR")}</p>
    </div>
  );
}

function StatusLine({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <div className="flex items-center gap-2">
      {ok ? (
        <CheckCircle2 className="w-4 h-4 text-success" />
      ) : (
        <AlertTriangle className="w-4 h-4 text-warning" />
      )}
      <span className="font-medium">{texto}</span>
    </div>
  );
}

function AcaoManutencao({
  titulo,
  descricao,
  cta,
  executando,
  destrutivo,
  onClick,
}: {
  titulo: string;
  descricao: string;
  cta: string;
  executando: boolean;
  destrutivo?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-3 border border-border rounded-md">
      <div className="flex-1">
        <p className="text-sm font-medium">{titulo}</p>
        <p className="text-xs text-muted-foreground">{descricao}</p>
      </div>
      <Button
        size="sm"
        variant={destrutivo ? "outline" : "default"}
        onClick={onClick}
        disabled={executando}
      >
        {executando ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : destrutivo ? (
          <Trash2 className="w-4 h-4 mr-2" />
        ) : null}
        {cta}
      </Button>
    </div>
  );
}
