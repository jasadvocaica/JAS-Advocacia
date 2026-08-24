import { useRef, useState } from "react";
import { Upload, FileSpreadsheet, AlertCircle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { lerArquivoTabular, type ParsedFile } from "../csv-parser";
import { gerarModeloProcessos, gerarModeloClientes } from "../../modelos-planilha";

interface Props {
  modulo: "processos" | "clientes";
  onArquivoLido: (parsed: ParsedFile, file: File) => void;
}

const MAX_MB = 10;

export function StepUpload({ modulo, onArquivoLido }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const processar = async (file: File) => {
    setErro(null);
    if (file.size > MAX_MB * 1024 * 1024) {
      setErro(`Arquivo maior que ${MAX_MB}MB. Divida em lotes menores.`);
      return;
    }
    setCarregando(true);
    try {
      const parsed = await lerArquivoTabular(file);
      if (parsed.rows.length === 0) {
        setErro("Nenhuma linha de dados encontrada no arquivo.");
        return;
      }
      onArquivoLido(parsed, file);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao ler arquivo");
    } finally {
      setCarregando(false);
    }
  };

  const baixarModelo = () => {
    const blob = modulo === "processos" ? gerarModeloProcessos() : gerarModeloClientes();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `modelo-${modulo}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2">
        <div className="mb-6">
          <h2 className="text-2xl font-serif italic mb-2">Carga de Arquivo</h2>
          <p className="text-sm text-muted-foreground">
            Selecione a planilha contendo os {modulo}. Aceitamos{" "}
            <span className="font-medium text-foreground">.csv</span> e{" "}
            <span className="font-medium text-foreground">.xlsx</span>, até {MAX_MB}MB.
          </p>
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setArrastando(true);
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastando(false);
            const f = e.dataTransfer.files?.[0];
            if (f) processar(f);
          }}
          className={`w-full border border-dashed transition-colors p-12 flex flex-col items-center justify-center gap-3 ${
            arrastando ? "border-gold bg-gold/5" : "border-border hover:border-gold/60"
          }`}
        >
          <Upload className="w-10 h-10 text-gold" />
          <div className="text-center">
            <p className="text-sm font-medium">
              {carregando
                ? "Lendo arquivo…"
                : "Arraste o arquivo aqui ou clique para selecionar"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              .csv ou .xlsx · máx {MAX_MB}MB
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) processar(f);
            }}
          />
        </button>

        {erro && (
          <div className="mt-4 flex gap-2 items-start text-sm text-destructive">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{erro}</span>
          </div>
        )}
      </div>

      <aside className="border border-border bg-muted/30 p-6">
        <h3 className="text-[11px] font-bold uppercase tracking-widest mb-4 pb-2 border-b border-border">
          Antes de Começar
        </h3>
        <ul className="space-y-3 text-xs text-muted-foreground leading-relaxed">
          <li className="flex gap-2">
            <FileSpreadsheet className="w-3.5 h-3.5 mt-0.5 text-gold shrink-0" />
            Use nossa planilha-modelo para garantir que os cabeçalhos batam.
          </li>
          <li className="flex gap-2">
            <span className="text-gold">·</span>
            Datas em <span className="font-medium text-foreground">dd/mm/aaaa</span>.
          </li>
          <li className="flex gap-2">
            <span className="text-gold">·</span>
            CPF/CNPJ podem vir com ou sem máscara.
          </li>
          <li className="flex gap-2">
            <span className="text-gold">·</span>
            Linhas em branco são ignoradas.
          </li>
        </ul>
        <Button
          variant="outline"
          size="sm"
          className="w-full mt-6"
          onClick={baixarModelo}
        >
          <Download className="w-4 h-4 mr-2" />
          Baixar modelo
        </Button>
      </aside>
    </div>
  );
}
