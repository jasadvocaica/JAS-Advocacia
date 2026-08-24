import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, CheckCircle2, AlertTriangle, Trash2, RotateCcw, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import {
  useIeImportarInss,
  type ItemValidadoInss,
  type StatusValidacaoInss,
} from "../useIeImportarInss";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

const STATUS_LABELS: Record<StatusValidacaoInss, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  ok_novo_cliente: { label: "Novo cliente", variant: "default" },
  ok_cliente_existente: { label: "Cliente existente", variant: "secondary" },
  atualizar_existente: { label: "Atualizar processo", variant: "outline" },
  duplicado_pdf: { label: "Duplicado no PDF", variant: "destructive" },
  campos_faltando: { label: "Campos faltando", variant: "destructive" },
};

export function ImportarInssPdfDialog({ open, onOpenChange }: Props) {
  const { job, polling, validando, validacao, erroValidacao, validar, confirmar, reset } = useIeImportarInss();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [pular, setPular] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      reset();
      setArquivo(null);
      setPular(new Set());
    }
  }, [open, reset]);

  const handleArquivo = async (f: File) => {
    setArquivo(f);
    setPular(new Set());
    try {
      await validar(f);
    } catch {
      // erro já notificado
    }
  };

  const handleConfirmar = async () => {
    try {
      await confirmar([...pular]);
      toast({ title: "Importação iniciada", description: "Acompanhe o progresso abaixo." });
    } catch {
      // erro já notificado
    }
  };

  const concluido =
    job && ["concluido", "concluido_parcial", "erro"].includes(job.status);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="border-b border-border pb-4">
          <p className="text-[10px] uppercase tracking-widest text-gold font-semibold mb-1">
            Portal de Atendimento INSS
          </p>
          <DialogTitle className="text-2xl font-serif italic">
            Importar processos administrativos (PDF)
          </DialogTitle>
          <DialogDescription>
            Carregue o PDF exportado do Portal INSS. Cada protocolo será vinculado ao cliente pelo CPF
            (criando o cliente caso não exista). Protocolos já cadastrados terão a situação atualizada.
          </DialogDescription>
        </DialogHeader>

        {/* Upload */}
        {!validacao && !erroValidacao && (
          <div className="py-10 flex flex-col items-center gap-4">
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleArquivo(f);
              }}
            />
            <Button
              size="lg"
              onClick={() => inputRef.current?.click()}
              disabled={validando}
            >
              {validando ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Lendo PDF…
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Selecionar PDF do INSS
                </>
              )}
            </Button>
            {arquivo && (
              <p className="text-xs text-muted-foreground">{arquivo.name}</p>
            )}
          </div>
        )}

        {/* Erro de pré-validação */}
        {erroValidacao && !validacao && (
          <div className="py-6 space-y-4">
            <div className="border border-destructive/40 bg-destructive/5 p-4 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-semibold text-destructive">
                    Falha na pré-validação
                  </p>
                  <p className="text-sm text-foreground">{erroValidacao.mensagem}</p>
                  {erroValidacao.detalhe && (
                    <div className="mt-2 pt-2 border-t border-destructive/20">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                        Detalhe do job
                      </p>
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                        {erroValidacao.detalhe}
                      </p>
                    </div>
                  )}
                  {erroValidacao.job_id && (
                    <p className="text-[10px] text-muted-foreground font-mono pt-1">
                      Job: {erroValidacao.job_id}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Verifique se o PDF foi exportado pelo Portal de Atendimento INSS e contém a tabela de
              protocolos (Protocolo, Serviço, Nome, CPF, Situação). PDFs escaneados (sem texto
              pesquisável) não funcionam.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  reset();
                  setArquivo(null);
                  setPular(new Set());
                  if (inputRef.current) inputRef.current.value = "";
                }}
              >
                <Upload className="w-4 h-4 mr-2" /> Selecionar outro PDF
              </Button>
            </div>
          </div>
        )}


        {/* Prévia */}
        {validacao && !job && (
          <PreviaRevisao
            itens={validacao.itens}
            resumo={validacao.resumo}
            pular={pular}
            setPular={setPular}
            onCancelar={() => onOpenChange(false)}
            onConfirmar={handleConfirmar}
            enviando={polling}
          />
        )}

        {/* Progresso/resultado */}
        {job && (
          <div className="py-6 space-y-3">
            <div className="flex items-center gap-2">
              {concluido ? (
                job.status === "erro" ? (
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                )
              ) : (
                <Loader2 className="w-5 h-5 animate-spin text-gold" />
              )}
              <p className="text-sm font-medium">{job.mensagem ?? "Processando…"}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <Stat label="Total" valor={job.total_registros} />
              <Stat label="OK" valor={job.registros_ok} />
              <Stat label="Erros" valor={job.registros_erro} />
            </div>
            {concluido && (
              <div className="flex justify-end pt-2">
                <Button onClick={() => onOpenChange(false)}>Fechar</Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="border border-border p-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-lg font-serif">{valor}</p>
    </div>
  );
}

function fmtData(iso: string | null): string {
  if (!iso) return "—";
  const d = iso.length > 10 ? iso.slice(0, 10) : iso;
  const [y, m, dd] = d.split("-");
  if (!y || !m || !dd) return iso;
  const hora = iso.length > 10 ? iso.slice(11, 16) : "";
  return `${dd}/${m}/${y}${hora ? ` ${hora}` : ""}`;
}

interface PreviaProps {
  itens: ItemValidadoInss[];
  resumo: {
    total: number;
    ok_novo_cliente: number;
    ok_cliente_existente: number;
    atualizar_existente: number;
    duplicado_pdf: number;
    campos_faltando: number;
  };
  pular: Set<string>;
  setPular: React.Dispatch<React.SetStateAction<Set<string>>>;
  onCancelar: () => void;
  onConfirmar: () => void;
  enviando: boolean;
}

/**
 * Tela de revisão antes de gravar. Mostra todos os campos relevantes
 * (CPF, nome, serviço, unidade, situação, datas) e permite excluir
 * itens individualmente ou em massa, com busca por nome/CPF/protocolo
 * e filtro por status.
 */
function PreviaRevisao({
  itens,
  resumo,
  pular,
  setPular,
  onCancelar,
  onConfirmar,
  enviando,
}: PreviaProps) {
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | StatusValidacaoInss>("todos");

  const itensFiltrados = itens.filter((it) => {
    if (filtroStatus !== "todos" && it.status_validacao !== filtroStatus) return false;
    if (!busca.trim()) return true;
    const q = busca.toLowerCase();
    return (
      it.nome.toLowerCase().includes(q) ||
      it.cpf.includes(q) ||
      it.cpf_limpo.includes(q.replace(/\D/g, "")) ||
      it.protocolo.includes(q) ||
      it.servico.toLowerCase().includes(q)
    );
  });

  const visiveisPodemSerExcluidos = itensFiltrados.filter(
    (it) => it.status_validacao !== "duplicado_pdf" && it.status_validacao !== "campos_faltando",
  );
  const todosVisiveisExcluidos =
    visiveisPodemSerExcluidos.length > 0 &&
    visiveisPodemSerExcluidos.every((it) => pular.has(it.protocolo));

  const toggleTodosVisiveis = () => {
    setPular((prev) => {
      const n = new Set(prev);
      if (todosVisiveisExcluidos) {
        for (const it of visiveisPodemSerExcluidos) n.delete(it.protocolo);
      } else {
        for (const it of visiveisPodemSerExcluidos) n.add(it.protocolo);
      }
      return n;
    });
  };

  const togglePular = (proto: string) => {
    setPular((prev) => {
      const n = new Set(prev);
      if (n.has(proto)) n.delete(proto);
      else n.add(proto);
      return n;
    });
  };

  const totalGravar = itens.filter((it) => {
    if (it.status_validacao === "duplicado_pdf") return false;
    if (it.status_validacao === "campos_faltando") return false;
    return !pular.has(it.protocolo);
  }).length;

  const statusOptions: { value: "todos" | StatusValidacaoInss; label: string }[] = [
    { value: "todos", label: `Todos (${resumo.total})` },
    { value: "ok_novo_cliente", label: `Novos clientes (${resumo.ok_novo_cliente})` },
    { value: "ok_cliente_existente", label: `Clientes existentes (${resumo.ok_cliente_existente})` },
    { value: "atualizar_existente", label: `Atualizar (${resumo.atualizar_existente})` },
    { value: "duplicado_pdf", label: `Duplicados (${resumo.duplicado_pdf})` },
    { value: "campos_faltando", label: `Com problema (${resumo.campos_faltando})` },
  ];

  return (
    <div className="py-4 space-y-4">
      {/* Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Stat label="Total no PDF" valor={resumo.total} />
        <Stat label="Novos clientes" valor={resumo.ok_novo_cliente} />
        <Stat label="Clientes existentes" valor={resumo.ok_cliente_existente} />
        <Stat label="Atualizar" valor={resumo.atualizar_existente} />
        <Stat label="Serão gravados" valor={totalGravar} />
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, CPF, protocolo ou serviço…"
            className="pl-8 h-9 text-xs"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <select
          className="h-9 border border-border bg-background px-2 text-xs rounded-md"
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value as "todos" | StatusValidacaoInss)}
        >
          {statusOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {pular.size > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-xs"
            onClick={() => setPular(new Set())}
          >
            <RotateCcw className="w-3 h-3 mr-1" /> Restaurar {pular.size} excluído(s)
          </Button>
        )}
      </div>

      {/* Tabela de revisão */}
      <div className="border border-border max-h-[55vh] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted sticky top-0 z-10">
            <tr>
              <th className="p-2 text-left w-8">
                <Checkbox
                  checked={todosVisiveisExcluidos}
                  onCheckedChange={toggleTodosVisiveis}
                  aria-label="Excluir todos visíveis"
                />
              </th>
              <th className="p-2 text-left">CPF</th>
              <th className="p-2 text-left">Nome</th>
              <th className="p-2 text-left">Protocolo</th>
              <th className="p-2 text-left">Serviço</th>
              <th className="p-2 text-left">Unidade</th>
              <th className="p-2 text-left">Situação</th>
              <th className="p-2 text-left">Protocolado em</th>
              <th className="p-2 text-left">Última atualização</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-right w-10">Ação</th>
            </tr>
          </thead>
          <tbody>
            {itensFiltrados.length === 0 && (
              <tr>
                <td colSpan={11} className="p-6 text-center text-muted-foreground">
                  Nenhum item encontrado com os filtros aplicados.
                </td>
              </tr>
            )}
            {itensFiltrados.map((it) => (
              <LinhaPreview
                key={`${it.protocolo}-${it.cpf_limpo}`}
                item={it}
                pular={pular.has(it.protocolo)}
                onTogglePular={() => togglePular(it.protocolo)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col sm:flex-row sm:justify-between gap-2 pt-2 items-center">
        <p className="text-xs text-muted-foreground">
          {pular.size > 0
            ? `${pular.size} item(s) marcado(s) para excluir. ${totalGravar} processo(s) serão gravados.`
            : `${totalGravar} processo(s) serão gravados.`}
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button onClick={onConfirmar} disabled={enviando || totalGravar === 0}>
            {enviando ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Enviando…
              </>
            ) : (
              <>Confirmar e gravar {totalGravar}</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function LinhaPreview({
  item,
  pular,
  onTogglePular,
}: {
  item: ItemValidadoInss;
  pular: boolean;
  onTogglePular: () => void;
}) {
  const meta = STATUS_LABELS[item.status_validacao];
  const desabilitarSkip =
    item.status_validacao === "duplicado_pdf" ||
    item.status_validacao === "campos_faltando";
  const excluido = pular || desabilitarSkip;
  return (
    <tr className={`border-t border-border ${excluido ? "opacity-40 line-through" : ""}`}>
      <td className="p-2">
        <Checkbox
          checked={excluido}
          disabled={desabilitarSkip}
          onCheckedChange={onTogglePular}
          aria-label="Excluir item"
        />
      </td>
      <td className="p-2 font-mono whitespace-nowrap">{item.cpf}</td>
      <td className="p-2">{item.nome}</td>
      <td className="p-2 font-mono whitespace-nowrap">{item.protocolo}</td>
      <td className="p-2">{item.servico}</td>
      <td className="p-2 text-muted-foreground">{item.unidade ?? "—"}</td>
      <td className="p-2">{item.situacao ?? "—"}</td>
      <td className="p-2 whitespace-nowrap">{fmtData(item.protocolado_em)}</td>
      <td className="p-2 whitespace-nowrap">{fmtData(item.ultima_atualizacao)}</td>
      <td className="p-2">
        <Badge variant={meta.variant}>{meta.label}</Badge>
      </td>
      <td className="p-2 text-right">
        {!desabilitarSkip && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onTogglePular}
            title={pular ? "Restaurar item" : "Excluir item"}
          >
            {pular ? <RotateCcw className="w-3 h-3" /> : <Trash2 className="w-3 h-3" />}
          </Button>
        )}
      </td>
    </tr>
  );
}
