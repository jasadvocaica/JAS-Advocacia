import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  FileWarning,
  RotateCw,
  Upload,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useIeJobs, urlAssinadaIe } from "./useIeJobs";
import type { IeJob, IeJobStatus, ErroLinha } from "./types";

const STATUS_LABEL: Record<IeJobStatus, string> = {
  aguardando: "Aguardando",
  processando: "Processando",
  concluido: "Concluído",
  concluido_parcial: "Parcial",
  erro: "Erro",
  expirado: "Expirado",
};

const STATUS_VARIANT: Record<IeJobStatus, "default" | "secondary" | "destructive" | "outline"> = {
  aguardando: "outline",
  processando: "secondary",
  concluido: "default",
  concluido_parcial: "secondary",
  erro: "destructive",
  expirado: "outline",
};

/**
 * Histórico completo de importações.
 * Mostra status, contadores, filtros e permite baixar relatório de erros (CSV)
 * para cada execução.
 */
export default function HistoricoImportacoes() {
  const { jobs, loading, recarregar } = useIeJobs({ tipo: "importacao", limit: 200 });
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<IeJobStatus | "todos">("todos");
  const [moduloFiltro, setModuloFiltro] = useState<string>("todos");

  const modulos = useMemo(
    () => Array.from(new Set(jobs.map((j) => j.modulo))).sort(),
    [jobs],
  );

  const jobsFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return jobs.filter((j) => {
      if (statusFiltro !== "todos" && j.status !== statusFiltro) return false;
      if (moduloFiltro !== "todos" && j.modulo !== moduloFiltro) return false;
      if (termo) {
        const alvo = `${j.modulo} ${j.subtipo ?? ""} ${j.arquivo_entrada_nome ?? ""}`.toLowerCase();
        if (!alvo.includes(termo)) return false;
      }
      return true;
    });
  }, [jobs, busca, statusFiltro, moduloFiltro]);

  const contadores = useMemo(() => {
    const c = { total: jobs.length, ok: 0, parcial: 0, erro: 0, processando: 0 };
    for (const j of jobs) {
      if (j.status === "concluido") c.ok += 1;
      else if (j.status === "concluido_parcial") c.parcial += 1;
      else if (j.status === "erro") c.erro += 1;
      else if (j.status === "processando" || j.status === "aguardando") c.processando += 1;
    }
    return c;
  }, [jobs]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Histórico de importações"
        description="Acompanhe todas as execuções, baixe o relatório de erros e reveja o que foi importado."
      >
        <Button variant="outline" size="sm" onClick={() => recarregar()}>
          <RotateCw className="w-4 h-4 mr-2" /> Atualizar
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <CardContador titulo="Total" valor={contadores.total} icon={Upload} />
        <CardContador titulo="Concluídos" valor={contadores.ok} icon={CheckCircle2} cor="text-success" />
        <CardContador titulo="Parciais" valor={contadores.parcial} icon={FileWarning} cor="text-warning" />
        <CardContador titulo="Com erro" valor={contadores.erro} icon={AlertCircle} cor="text-destructive" />
        <CardContador titulo="Em andamento" valor={contadores.processando} icon={Clock} cor="text-primary" />
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-col md:flex-row gap-3">
            <Input
              placeholder="Buscar por arquivo, módulo ou subtipo…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="md:max-w-xs"
            />
            <Select value={statusFiltro} onValueChange={(v) => setStatusFiltro(v as IeJobStatus | "todos")}>
              <SelectTrigger className="md:max-w-[200px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                {(Object.keys(STATUS_LABEL) as IeJobStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={moduloFiltro} onValueChange={setModuloFiltro}>
              <SelectTrigger className="md:max-w-[200px]">
                <SelectValue placeholder="Módulo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os módulos</SelectItem>
                {modulos.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : jobsFiltrados.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">
              Nenhuma importação encontrada com esses filtros.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Módulo</TableHead>
                    <TableHead>Arquivo</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">OK</TableHead>
                    <TableHead className="text-right">Erros</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobsFiltrados.map((job) => (
                    <LinhaJob key={job.id} job={job} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CardContador({
  titulo,
  valor,
  icon: Icon,
  cor,
}: {
  titulo: string;
  valor: number;
  icon: typeof Upload;
  cor?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{titulo}</p>
          <Icon className={`w-4 h-4 ${cor ?? "text-muted-foreground"}`} />
        </div>
        <p className="text-2xl font-semibold mt-1">{valor}</p>
      </CardContent>
    </Card>
  );
}

function LinhaJob({ job }: { job: IeJob }) {
  const temErros = (job.erros_json?.length ?? 0) > 0 || job.registros_erro > 0;
  const subtituloModulo = job.subtipo ? `${job.modulo} · ${job.subtipo}` : job.modulo;

  async function baixarEntrada() {
    if (!job.arquivo_entrada_url) return;
    const url = await urlAssinadaIe(job.arquivo_entrada_url);
    if (url) window.open(url, "_blank");
  }

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap text-sm">
        {format(new Date(job.iniciado_em), "dd/MM/yy HH:mm", { locale: ptBR })}
      </TableCell>
      <TableCell className="text-sm capitalize">{subtituloModulo}</TableCell>
      <TableCell className="max-w-[260px] truncate text-sm" title={job.arquivo_entrada_nome ?? ""}>
        {job.arquivo_entrada_nome ?? "—"}
      </TableCell>
      <TableCell className="text-right text-sm">{job.total_registros}</TableCell>
      <TableCell className="text-right text-sm text-success">{job.registros_ok}</TableCell>
      <TableCell className="text-right text-sm">
        <span className={temErros ? "text-destructive font-medium" : "text-muted-foreground"}>
          {job.registros_erro}
        </span>
      </TableCell>
      <TableCell>
        <Badge variant={STATUS_VARIANT[job.status]}>{STATUS_LABEL[job.status]}</Badge>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          {job.arquivo_entrada_url && job.status !== "expirado" && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" onClick={baixarEntrada}>
                    <Download className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Baixar arquivo enviado</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {temErros && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => baixarRelatorioErros(job)}
                  >
                    <FileWarning className="w-4 h-4 mr-1" /> Erros
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Baixar relatório de erros (CSV)</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

/** Gera CSV das linhas de erro de um job e dispara download local. */
function baixarRelatorioErros(job: IeJob) {
  const erros: ErroLinha[] = job.erros_json ?? [];
  const cabecalho = ["linha", "campo", "erro", "valor"];
  const linhas = erros.map((e) =>
    [
      e.linha,
      escaparCsv(e.campo),
      escaparCsv(e.erro),
      escaparCsv(e.valor ?? ""),
    ].join(","),
  );
  const conteudo = [cabecalho.join(","), ...linhas].join("\n");
  const blob = new Blob(["\uFEFF" + conteudo], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const data = format(new Date(job.iniciado_em), "yyyyMMdd-HHmm");
  a.href = url;
  a.download = `erros-${job.modulo}-${data}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function escaparCsv(v: string | number): string {
  const s = String(v ?? "");
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
