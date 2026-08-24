import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  CAMPOS_CLIENTES,
  CAMPOS_PROCESSOS,
  sugerirMapeamento,
  validarLinhas,
  type LinhaValidada,
  type ParsedFile,
} from "./csv-parser";
import { useIeImportarServer } from "../useIeImportarServer";
import { StepIndicator } from "./wizard/StepIndicator";
import { StepUpload } from "./wizard/StepUpload";
import { StepMapeamento } from "./wizard/StepMapeamento";
import { StepValidacao } from "./wizard/StepValidacao";
import { StepResultado } from "./wizard/StepResultado";

interface Props {
  modulo: "processos" | "clientes";
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

type Passo = 1 | 2 | 3 | 4;

/**
 * Wizard de importação CSV/XLSX em 4 passos. Estilo "Auditoria Legal".
 * A validação por linha roda no navegador (preview); a persistência
 * acontece no servidor via edge function `ie-importar`.
 */
export function ImportarCsvWizard({ modulo, open, onOpenChange }: Props) {
  const [passo, setPasso] = useState<Passo>(1);
  const [arquivo, setArquivo] = useState<ParsedFile | null>(null);
  const [arquivoBlob, setArquivoBlob] = useState<File | null>(null);
  const [mapeamento, setMapeamento] = useState<Record<string, string>>({});
  const [ignorarErros, setIgnorarErros] = useState(false);
  const [linhasErroFinal, setLinhasErroFinal] = useState<LinhaValidada[]>([]);

  const { job, polling, importar } = useIeImportarServer();
  const campos = modulo === "processos" ? CAMPOS_PROCESSOS : CAMPOS_CLIENTES;

  // reset ao fechar
  useEffect(() => {
    if (!open) {
      setPasso(1);
      setArquivo(null);
      setArquivoBlob(null);
      setMapeamento({});
      setIgnorarErros(false);
      setLinhasErroFinal([]);
    }
  }, [open]);

  // quando o job terminar, calcula linhas com erro localmente para o relatório final
  useEffect(() => {
    if (
      job &&
      ["concluido", "concluido_parcial", "erro"].includes(job.status) &&
      passo === 3
    ) {
      const erros = arquivo
        ? validarLinhas(arquivo.rows, campos, mapeamento).filter((l) => l.status === "erro")
        : [];
      setLinhasErroFinal(erros);
      setPasso(4);
    }
  }, [job, passo, arquivo, campos, mapeamento]);

  const linhasValidadas = useMemo(() => {
    if (!arquivo) return [];
    return validarLinhas(arquivo.rows, campos, mapeamento);
  }, [arquivo, campos, mapeamento]);

  const handleArquivoLido = (parsed: ParsedFile, file: File) => {
    setArquivo(parsed);
    setArquivoBlob(file);
    setMapeamento(sugerirMapeamento(parsed.headers, campos));
    setPasso(2);
  };

  const confirmarImportacao = async () => {
    if (!arquivoBlob) return;
    try {
      await importar({
        modulo,
        arquivo: arquivoBlob,
        mapeamento,
        ignorar_erros: ignorarErros,
      });
    } catch {
      // toast já foi mostrado pelo hook
    }
  };

  const titulo =
    modulo === "processos" ? "Importação de Processos" : "Importação de Clientes";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="border-b border-border pb-6">
          <div className="flex justify-between items-end">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gold font-semibold mb-1">
                Módulo de Importação
              </p>
              <DialogTitle className="text-2xl sm:text-3xl font-serif italic">
                {titulo}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Wizard de 4 passos para importar {modulo} via planilha.
              </DialogDescription>
            </div>
          </div>
          <StepIndicator passoAtual={passo} />
        </DialogHeader>

        <div className="pt-6">
          {passo === 1 && <StepUpload modulo={modulo} onArquivoLido={handleArquivoLido} />}
          {passo === 2 && arquivo && (
            <StepMapeamento
              arquivo={arquivo}
              campos={campos}
              mapeamento={mapeamento}
              onChange={setMapeamento}
              onVoltar={() => setPasso(1)}
              onAvancar={() => setPasso(3)}
            />
          )}
          {passo === 3 && arquivo && (
            <StepValidacao
              campos={campos}
              linhas={linhasValidadas}
              ignorarErros={ignorarErros}
              setIgnorarErros={setIgnorarErros}
              onVoltar={() => setPasso(2)}
              onAvancar={confirmarImportacao}
            />
          )}
          {passo === 4 && job && (
            <StepResultado
              modulo={modulo}
              importados={job.registros_ok}
              falhas={job.registros_erro}
              linhasErro={linhasErroFinal}
              onReiniciar={() => {
                setPasso(1);
                setArquivo(null);
                setArquivoBlob(null);
                setMapeamento({});
              }}
              onFechar={() => onOpenChange(false)}
            />
          )}
          {polling && passo === 3 && (
            <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
              <div className="bg-background border border-border p-6 shadow-lg max-w-md">
                <p className="font-serif italic text-lg">Processando no servidor…</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {job?.status === "processando"
                    ? `Importando ${job.total_registros || ""} registros — aguarde.`
                    : "Enviando arquivo e disparando job."}
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
