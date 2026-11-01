import { useMemo, useState } from "react";
import { RefreshCw, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { usePainelAgentes } from "./hooks/usePainelAgentes";
import { ResumoAgentes } from "./components/ResumoAgentes";
import { AgenteCard } from "./components/AgenteCard";
import { AgenteDetalheSheet } from "./components/AgenteDetalheSheet";
import { LABEL_STATUS_AGENTE, type AgentePainel, type StatusAgente } from "./types";

export default function PainelAgentes() {
  const { agentes, resumo, loading, error, ultimaCarga, recarregar } = usePainelAgentes();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | StatusAgente>("todos");
  const [selecionado, setSelecionado] = useState<AgentePainel | null>(null);

  const maxCarga = useMemo(
    () => agentes.reduce((m, a) => Math.max(m, a.carga), 0),
    [agentes],
  );

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return agentes.filter((a) => {
      if (filtro !== "todos" && a.status !== filtro) return false;
      if (!termo) return true;
      return (
        a.nome.toLowerCase().includes(termo) ||
        (a.email ?? "").toLowerCase().includes(termo)
      );
    });
  }, [agentes, busca, filtro]);

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Users className="h-5 w-5 text-muted-foreground" aria-hidden />
            Painel de agentes
          </h1>
          <p className="text-sm text-muted-foreground">
            Carga de trabalho e prazos de cada pessoa da equipe, consolidados da Controladoria.
            {ultimaCarga ? (
              <span className="ml-1 text-xs">
                Atualizado às{" "}
                {ultimaCarga.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.
              </span>
            ) : null}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar pessoa…"
              className="h-9 w-full pl-8 sm:w-56"
              aria-label="Buscar pessoa"
            />
          </div>

          <Select value={filtro} onValueChange={(v) => setFiltro(v as typeof filtro)}>
            <SelectTrigger className="h-9 w-[170px]" aria-label="Filtrar por situação">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as situações</SelectItem>
              {(Object.keys(LABEL_STATUS_AGENTE) as StatusAgente[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {LABEL_STATUS_AGENTE[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={recarregar}
            disabled={loading}
            aria-label="Recarregar"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </header>

      <ResumoAgentes resumo={resumo} />

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Erro ao carregar: {error}
        </div>
      ) : null}

      {loading && agentes.length === 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-lg" />
          ))}
        </div>
      ) : visiveis.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {agentes.length === 0
              ? "Nenhuma pessoa com demandas ou cadastro na equipe."
              : "Nenhum resultado para o filtro aplicado."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visiveis.map((a) => (
            <AgenteCard key={a.userId} agente={a} maxCarga={maxCarga} onAbrir={setSelecionado} />
          ))}
        </div>
      )}

      <AgenteDetalheSheet agente={selecionado} onOpenChange={(aberto) => !aberto && setSelecionado(null)} />
    </div>
  );
}
