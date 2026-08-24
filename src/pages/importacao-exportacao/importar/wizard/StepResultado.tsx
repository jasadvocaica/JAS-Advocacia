import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, Download, RotateCcw, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { LinhaValidada } from "../csv-parser";

interface Props {
  modulo: "processos" | "clientes";
  importados: number;
  falhas: number;
  linhasErro: LinhaValidada[];
  onReiniciar: () => void;
  onFechar: () => void;
}

export function StepResultado({
  modulo,
  importados,
  falhas,
  linhasErro,
  onReiniciar,
  onFechar,
}: Props) {
  const sucesso = falhas === 0;

  const baixarRelatorio = () => {
    const linhas = linhasErro.map((l) => ({
      linha: l.linha,
      problemas: l.problemas.map((p) => `[${p.tipo}] ${p.campo}: ${p.mensagem}`).join(" | "),
      ...l.valores,
    }));
    const headers = ["linha", "problemas", ...Object.keys(linhasErro[0]?.valores ?? {})];
    const csv = [
      headers.join(","),
      ...linhas.map((l) =>
        headers.map((h) => `"${String(l[h as keyof typeof l] ?? "").replace(/"/g, '""')}"`).join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-erros-${modulo}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const rota = modulo === "processos" ? "/processos" : "/clientes";

  return (
    <div className="text-center max-w-2xl mx-auto py-6">
      <div className="flex justify-center mb-6">
        {sucesso ? (
          <div className="size-16 rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
            <CheckCircle2 className="w-9 h-9 text-emerald-600" />
          </div>
        ) : (
          <div className="size-16 rounded-full bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
            <AlertCircle className="w-9 h-9 text-amber-600" />
          </div>
        )}
      </div>

      <h2 className="text-3xl font-serif italic mb-3">
        {sucesso ? "Importação concluída" : "Importação parcial"}
      </h2>
      <p className="text-sm text-muted-foreground mb-8">
        {importados.toLocaleString("pt-BR")} {modulo === "processos" ? "processo(s)" : "cliente(s)"}{" "}
        gravado(s) no sistema.
        {falhas > 0 && ` ${falhas.toLocaleString("pt-BR")} linha(s) descartada(s) por erro.`}
      </p>

      <div className="grid grid-cols-2 gap-px bg-border border border-border mb-8">
        <div className="bg-background p-5">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Importados</p>
          <p className="text-3xl font-serif text-emerald-600 tabular-nums">
            {importados.toLocaleString("pt-BR")}
          </p>
        </div>
        <div className="bg-background p-5">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Falhas</p>
          <p className="text-3xl font-serif text-destructive tabular-nums">
            {falhas.toLocaleString("pt-BR")}
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        {falhas > 0 && (
          <Button variant="outline" onClick={baixarRelatorio}>
            <Download className="w-4 h-4 mr-2" /> Baixar relatório de erros
          </Button>
        )}
        <Button variant="outline" onClick={onReiniciar}>
          <RotateCcw className="w-4 h-4 mr-2" /> Importar outro arquivo
        </Button>
        <Button asChild className="bg-foreground text-background hover:bg-foreground/90" onClick={onFechar}>
          <Link to={rota}>
            Ver {modulo} <ArrowRight className="w-4 h-4 ml-2" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
