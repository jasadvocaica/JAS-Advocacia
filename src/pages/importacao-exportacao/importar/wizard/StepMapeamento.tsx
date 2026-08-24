import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowLeft, ArrowRight } from "lucide-react";
import type { CampoSistema, ParsedFile } from "../csv-parser";

interface Props {
  arquivo: ParsedFile;
  campos: CampoSistema[];
  mapeamento: Record<string, string>;
  onChange: (m: Record<string, string>) => void;
  onVoltar: () => void;
  onAvancar: () => void;
}

export function StepMapeamento({
  arquivo,
  campos,
  mapeamento,
  onChange,
  onVoltar,
  onAvancar,
}: Props) {
  const obrigatoriosFaltando = useMemo(
    () => campos.filter((c) => c.obrigatorio && !mapeamento[c.chave]),
    [campos, mapeamento],
  );
  const totalMapeados = campos.filter((c) => mapeamento[c.chave]).length;

  const setCampo = (chave: string, valor: string) =>
    onChange({ ...mapeamento, [chave]: valor === "__none__" ? "" : valor });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2">
        <div className="mb-6">
          <h2 className="text-2xl font-serif italic mb-2">Mapeamento de Atributos</h2>
          <p className="text-sm text-muted-foreground">
            Relacione as colunas detectadas em{" "}
            <span className="font-medium text-foreground">{arquivo.nomeArquivo}</span> aos
            campos do sistema. Marcamos com erro os obrigatórios em branco.
          </p>
        </div>

        <div className="border border-border">
          <div className="grid grid-cols-2 bg-muted/50 text-[10px] font-bold uppercase tracking-widest p-3 border-b border-border">
            <div>Campo do Sistema</div>
            <div>Coluna do Arquivo</div>
          </div>
          <div className="divide-y divide-border">
            {campos.map((campo) => {
              const valor = mapeamento[campo.chave] ?? "";
              const erro = campo.obrigatorio && !valor;
              return (
                <div
                  key={campo.chave}
                  className="grid grid-cols-2 items-center p-4 gap-4 bg-background"
                >
                  <div>
                    <div className={`text-sm font-medium ${erro ? "text-destructive" : ""}`}>
                      {campo.rotulo}
                      {campo.obrigatorio && <span className="text-destructive ml-0.5">*</span>}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 italic">
                      Ex: {campo.exemplo}
                    </div>
                  </div>
                  <Select
                    value={valor || "__none__"}
                    onValueChange={(v) => setCampo(campo.chave, v)}
                  >
                    <SelectTrigger
                      className={`h-9 text-sm ${
                        erro ? "border-destructive bg-destructive/5" : ""
                      }`}
                    >
                      <SelectValue placeholder="Selecionar coluna…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— não importar —</SelectItem>
                      {arquivo.headers.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between">
          <Button variant="ghost" onClick={onVoltar}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
          </Button>
          <Button
            onClick={onAvancar}
            disabled={obrigatoriosFaltando.length > 0}
            className="bg-foreground text-background hover:bg-foreground/90"
          >
            Validar dados <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>

      <aside className="border border-border bg-muted/30 p-6 h-fit">
        <h3 className="text-[11px] font-bold uppercase tracking-widest mb-4 pb-2 border-b border-border">
          Resumo do Arquivo
        </h3>
        <div className="space-y-5 text-sm">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">
              Total de Registros
            </p>
            <p className="text-2xl font-light tabular-nums">
              {arquivo.rows.length.toLocaleString("pt-BR")}{" "}
              <span className="text-xs text-muted-foreground">linhas</span>
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">
              Campos Mapeados
            </p>
            <div className="w-full bg-border h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-gold h-full transition-all"
                style={{ width: `${(totalMapeados / campos.length) * 100}%` }}
              />
            </div>
            <p className="text-[11px] mt-2 text-right tabular-nums">
              {totalMapeados} de {campos.length} campos
            </p>
          </div>

          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2">
              Amostra
            </p>
            <div className="space-y-2">
              {arquivo.rows.slice(0, 3).map((r, i) => (
                <div key={i} className="p-2.5 bg-background border border-border text-[11px]">
                  <div className="font-bold mb-0.5">Linha {String(i + 1).padStart(2, "0")}</div>
                  <div className="text-muted-foreground truncate">
                    {arquivo.headers
                      .slice(0, 3)
                      .map((h) => r[h])
                      .filter(Boolean)
                      .join(" | ")}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {obrigatoriosFaltando.length > 0 && (
            <div className="bg-destructive/5 border border-destructive/30 p-3 flex gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-[11px] text-destructive">
                Faltam {obrigatoriosFaltando.length} campo(s) obrigatório(s):{" "}
                {obrigatoriosFaltando.map((c) => c.rotulo).join(", ")}.
              </p>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
