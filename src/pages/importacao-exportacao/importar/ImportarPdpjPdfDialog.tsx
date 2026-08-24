import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  CheckCircle2,
  XCircle,
  FileText,
  Upload,
  AlertCircle,
  AlertTriangle,
  Copy,
  Loader2,
  ShieldCheck,
  Search,
  Download,
  ListFilter,
} from "lucide-react";
import { useIeImportarPdpj, type ItemValidadoPdpj } from "../useIeImportarPdpj";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

interface DetalheItem {
  cnj: string;
  status: "ok" | "erro" | "duplicado";
  mensagem?: string;
}

type Etapa = "upload" | "validacao" | "execucao";

const LABEL_CAMPOS: Record<string, string> = {
  autor: "Autor",
  reu: "Réu",
  tribunal: "Tribunal",
  vara: "Vara",
  data_distribuicao: "Data de distribuição",
};

/**
 * Dialog de importação em lote de PDF do Portal PDPJ, em 3 etapas:
 *  1) Upload do PDF
 *  2) Pré-validação (CNJ duplicado no PDF/banco e campos obrigatórios faltando)
 *  3) Gravação e progresso item-a-item
 */
export function ImportarPdpjPdfDialog({ open, onOpenChange }: Props) {
  const [etapa, setEtapa] = useState<Etapa>("upload");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    job,
    polling,
    validando,
    validacao,
    validar,
    confirmar,
    reset,
  } = useIeImportarPdpj();

  // reset ao fechar
  useEffect(() => {
    if (!open) {
      setEtapa("upload");
      setArquivo(null);
      setExcluidos(new Set());
      reset();
      if (inputRef.current) inputRef.current.value = "";
    }
    // reset é estável via useCallback no hook? não — evitamos loop não incluindo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleArquivo = (f: File | null) => {
    if (!f) return;
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      return;
    }
    setArquivo(f);
  };

  const handleValidar = async () => {
    if (!arquivo) return;
    try {
      await validar(arquivo);
      setEtapa("validacao");
    } catch {
      // toast já exibido pelo hook
    }
  };

  const handleConfirmar = async () => {
    setEtapa("execucao");
    try {
      // CNJs explicitamente desmarcados pelo usuário
      const pular = [...excluidos];
      await confirmar(pular);
    } catch {
      setEtapa("validacao");
    }
  };

  const toggleExcluido = (cnj_limpo: string) => {
    setExcluidos((prev) => {
      const novo = new Set(prev);
      if (novo.has(cnj_limpo)) novo.delete(cnj_limpo);
      else novo.add(cnj_limpo);
      return novo;
    });
  };

  // ---- Etapa execução: progresso ----
  const detalhes = (job?.erros_json as unknown as DetalheItem[] | undefined) ?? [];
  const total = job?.total_registros ?? 0;
  const ok = job?.registros_ok ?? 0;
  const err = job?.registros_erro ?? 0;
  const processados = detalhes.length;
  const pct = total > 0 ? Math.round((processados / total) * 100) : polling ? 5 : 0;
  const finalizado = job?.status === "concluido"
    || job?.status === "concluido_parcial"
    || job?.status === "erro";

  const copiarErros = () => {
    const erros = detalhes.filter((d) => d.status === "erro");
    const txt = erros.map((d) => `${d.cnj}\t${d.mensagem ?? ""}`).join("\n");
    navigator.clipboard.writeText(txt);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="border-b border-border pb-6">
          <p className="text-[10px] uppercase tracking-widest text-gold font-semibold mb-1">
            Importação em lote
          </p>
          <DialogTitle className="text-2xl sm:text-3xl font-serif italic">
            Processos via PDF do Portal PDPJ
          </DialogTitle>
          <DialogDescription>
            Carregue o relatório em PDF gerado no Portal de Serviços do Poder
            Judiciário. Antes de gravar, faremos uma pré-validação para
            verificar duplicidades e campos obrigatórios.
          </DialogDescription>
          <EtapaIndicator etapa={etapa} />
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pt-6 space-y-6">
          {/* ============ ETAPA 1: UPLOAD ============ */}
          {etapa === "upload" && (
            <div className="space-y-4">
              <label
                htmlFor="pdf-pdpj-input"
                className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-border rounded-md p-10 cursor-pointer hover:border-gold/50 hover:bg-muted/30 transition-colors"
              >
                <Upload className="w-10 h-10 text-muted-foreground" />
                <div className="text-center">
                  <p className="font-medium">
                    {arquivo ? arquivo.name : "Clique para selecionar o PDF"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Apenas .pdf · até 20 MB
                  </p>
                </div>
                <input
                  id="pdf-pdpj-input"
                  ref={inputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => handleArquivo(e.target.files?.[0] ?? null)}
                />
              </label>

              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <p>
                  Após o upload, faremos uma pré-validação que detecta CNJs
                  duplicados (no PDF e já cadastrados no banco) e processos com
                  campos obrigatórios ausentes (autor, tribunal, vara, data de
                  distribuição).
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleValidar}
                  disabled={!arquivo || validando}
                >
                  {validando ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Validando…
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4 mr-2" />
                      Pré-validar PDF
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* ============ ETAPA 2: PRÉ-VALIDAÇÃO ============ */}
          {etapa === "validacao" && validacao && (
            <ValidacaoView
              itens={validacao.itens}
              resumo={validacao.resumo}
              excluidos={excluidos}
              onToggleExcluido={toggleExcluido}
              onVoltar={() => {
                setEtapa("upload");
                reset();
              }}
              onConfirmar={handleConfirmar}
            />
          )}

          {/* ============ ETAPA 3: EXECUÇÃO ============ */}
          {etapa === "execucao" && (
            <div className="space-y-5">
              <div className="space-y-2">
                <div className="flex items-end justify-between">
                  <p className="text-sm">
                    {finalizado
                      ? "Concluído"
                      : total > 0
                        ? `Processando ${processados}/${total}`
                        : "Iniciando gravação…"}
                  </p>
                  <p className="text-xs text-muted-foreground">{pct}%</p>
                </div>
                <Progress value={pct} className="h-2" />
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline" className="border-gold/40 text-gold">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> {ok} sucesso
                  </Badge>
                  {err > 0 && (
                    <Badge variant="outline" className="border-destructive/40 text-destructive">
                      <XCircle className="w-3 h-3 mr-1" /> {err} erro{err === 1 ? "" : "s"}
                    </Badge>
                  )}
                  {polling && (
                    <Badge variant="secondary" className="animate-pulse">
                      em andamento
                    </Badge>
                  )}
                </div>
                {job?.mensagem && (
                  <p className="text-xs text-muted-foreground italic">{job.mensagem}</p>
                )}
              </div>

              {finalizado && detalhes.length > 0 && (
                <RelatorioFinal detalhes={detalhes} total={total} okCount={ok} errCount={err} />
              )}

              {detalhes.length > 0 && (
                <ListaStatus detalhes={detalhes} okCount={ok} errCount={err} />
              )}

              {finalizado && (
                <div className="flex justify-end gap-2 pt-2 border-t border-border">
                  <Button onClick={() => onOpenChange(false)}>Fechar</Button>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- componentes auxiliares ----------

function EtapaIndicator({ etapa }: { etapa: Etapa }) {
  const itens: { key: Etapa; label: string }[] = [
    { key: "upload", label: "1. Upload" },
    { key: "validacao", label: "2. Pré-validação" },
    { key: "execucao", label: "3. Gravação" },
  ];
  const idxAtual = itens.findIndex((i) => i.key === etapa);
  return (
    <div className="flex items-center gap-2 mt-4">
      {itens.map((i, idx) => {
        const ativo = idx === idxAtual;
        const concluido = idx < idxAtual;
        return (
          <div key={i.key} className="flex items-center gap-2">
            <div
              className={`text-[10px] uppercase tracking-widest font-semibold px-2 py-1 rounded-sm ${
                ativo
                  ? "bg-gold/15 text-gold"
                  : concluido
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground"
              }`}
            >
              {i.label}
            </div>
            {idx < itens.length - 1 && (
              <span className="text-muted-foreground/50">›</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ValidacaoView({
  itens,
  resumo,
  excluidos,
  onToggleExcluido,
  onVoltar,
  onConfirmar,
}: {
  itens: ItemValidadoPdpj[];
  resumo: {
    total: number;
    ok: number;
    duplicado_pdf: number;
    duplicado_banco: number;
    campos_faltando: number;
  };
  excluidos: Set<string>;
  onToggleExcluido: (cnj_limpo: string) => void;
  onVoltar: () => void;
  onConfirmar: () => void;
}) {
  const naoGravaveis = useMemo(
    () =>
      itens.filter(
        (i) =>
          i.status_validacao === "duplicado_pdf" ||
          i.status_validacao === "duplicado_banco",
      ),
    [itens],
  );
  const comAlerta = useMemo(
    () => itens.filter((i) => i.status_validacao === "campos_faltando"),
    [itens],
  );
  const okItens = useMemo(
    () => itens.filter((i) => i.status_validacao === "ok"),
    [itens],
  );

  // Quantos serão efetivamente gravados
  const totalAGravar =
    okItens.length +
    comAlerta.length -
    [...excluidos].filter((c) =>
      comAlerta.some((i) => i.cnj_limpo === c),
    ).length;

  return (
    <div className="space-y-5">
      {/* Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <CardResumo titulo="Total no PDF" valor={resumo.total} tom="neutro" />
        <CardResumo
          titulo="Prontos"
          valor={resumo.ok}
          tom="positivo"
          icone={<CheckCircle2 className="w-4 h-4" />}
        />
        <CardResumo
          titulo="Duplicados"
          valor={resumo.duplicado_pdf + resumo.duplicado_banco}
          tom="neutro"
          icone={<FileText className="w-4 h-4" />}
        />
        <CardResumo
          titulo="Com alertas"
          valor={resumo.campos_faltando}
          tom="aviso"
          icone={<AlertTriangle className="w-4 h-4" />}
        />
      </div>

      {/* Duplicados (informativo, não-gravável) */}
      {naoGravaveis.length > 0 && (
        <SecaoValidacao
          titulo={`Duplicados (${naoGravaveis.length}) — não serão gravados`}
          descricao="CNJs repetidos dentro do PDF ou já cadastrados no banco."
          icone={<FileText className="w-4 h-4" />}
          tom="neutro"
        >
          <ul className="divide-y divide-border max-h-48 overflow-auto">
            {naoGravaveis.map((i) => (
              <li
                key={i.cnj_limpo}
                className="px-3 py-2 text-sm flex items-center justify-between"
              >
                <span className="font-mono text-xs">{i.cnj}</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {i.status_validacao === "duplicado_pdf"
                    ? "repetido no PDF"
                    : "já cadastrado"}
                </span>
              </li>
            ))}
          </ul>
        </SecaoValidacao>
      )}

      {/* Com campos faltando — usuário decide */}
      {comAlerta.length > 0 && (
        <SecaoValidacao
          titulo={`Campos obrigatórios ausentes (${comAlerta.length})`}
          descricao="Esses processos serão gravados com os campos disponíveis. Desmarque para excluí-los desta importação."
          icone={<AlertTriangle className="w-4 h-4" />}
          tom="aviso"
        >
          <ul className="divide-y divide-border max-h-64 overflow-auto">
            {comAlerta.map((i) => {
              const incluir = !excluidos.has(i.cnj_limpo);
              return (
                <li
                  key={i.cnj_limpo}
                  className="px-3 py-2 text-sm flex items-start gap-3"
                >
                  <Checkbox
                    checked={incluir}
                    onCheckedChange={() => onToggleExcluido(i.cnj_limpo)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs">{i.cnj}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {i.autor || "—"}
                      {i.reu ? ` × ${i.reu}` : ""}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {i.campos_faltando.map((c) => (
                        <Badge
                          key={c}
                          variant="outline"
                          className="text-[10px] border-amber-500/40 text-amber-600 dark:text-amber-400"
                        >
                          falta {LABEL_CAMPOS[c] ?? c}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </SecaoValidacao>
      )}

      {/* Sem alertas */}
      {okItens.length > 0 && (
        <SecaoValidacao
          titulo={`Prontos para gravar (${okItens.length})`}
          descricao="Todos os campos obrigatórios estão preenchidos."
          icone={<CheckCircle2 className="w-4 h-4" />}
          tom="positivo"
        >
          <ul className="divide-y divide-border max-h-48 overflow-auto">
            {okItens.map((i) => (
              <li
                key={i.cnj_limpo}
                className="px-3 py-2 text-sm flex items-center justify-between"
              >
                <span className="font-mono text-xs">{i.cnj}</span>
                <span className="text-xs text-muted-foreground truncate max-w-[60%]">
                  {i.autor}
                </span>
              </li>
            ))}
          </ul>
        </SecaoValidacao>
      )}

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 pt-4 border-t border-border">
        <p className="text-xs text-muted-foreground">
          <strong className="text-foreground">{totalAGravar}</strong> de{" "}
          {resumo.total} serão gravados.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onVoltar}>
            Voltar
          </Button>
          <Button onClick={onConfirmar} disabled={totalAGravar === 0}>
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Gravar {totalAGravar} processo{totalAGravar === 1 ? "" : "s"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CardResumo({
  titulo,
  valor,
  tom,
  icone,
}: {
  titulo: string;
  valor: number;
  tom: "neutro" | "positivo" | "aviso";
  icone?: React.ReactNode;
}) {
  const cor =
    tom === "positivo"
      ? "text-gold border-gold/30"
      : tom === "aviso"
        ? "text-amber-600 dark:text-amber-400 border-amber-500/30"
        : "text-foreground border-border";
  return (
    <div className={`border rounded-md p-3 ${cor}`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
        {icone}
        {titulo}
      </div>
      <p className="text-2xl font-serif italic mt-1">{valor}</p>
    </div>
  );
}

function SecaoValidacao({
  titulo,
  descricao,
  icone,
  tom,
  children,
}: {
  titulo: string;
  descricao: string;
  icone: React.ReactNode;
  tom: "neutro" | "positivo" | "aviso";
  children: React.ReactNode;
}) {
  const corHeader =
    tom === "positivo"
      ? "border-gold/30 bg-gold/5"
      : tom === "aviso"
        ? "border-amber-500/30 bg-amber-500/5"
        : "border-border bg-muted/30";
  return (
    <div className="border border-border rounded-md overflow-hidden">
      <div className={`px-3 py-2 border-b ${corHeader}`}>
        <div className="flex items-center gap-2 text-sm font-semibold">
          {icone}
          {titulo}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{descricao}</p>
      </div>
      {children}
    </div>
  );
}

// ---------- Lista de status com filtros, busca e exportação ----------

type FiltroStatus = "todos" | "ok" | "duplicado" | "erro";

function ListaStatus({
  detalhes,
  okCount,
  errCount,
}: {
  detalhes: DetalheItem[];
  okCount: number;
  errCount: number;
}) {
  const [filtro, setFiltro] = useState<FiltroStatus>("todos");
  const [busca, setBusca] = useState("");

  const dupCount = useMemo(
    () => detalhes.filter((d) => d.status === "duplicado").length,
    [detalhes],
  );

  const filtrados = useMemo(() => {
    const termo = busca.replace(/\D/g, "");
    return detalhes.filter((d) => {
      if (filtro !== "todos" && d.status !== filtro) return false;
      if (termo) {
        const cnjLimpo = d.cnj.replace(/\D/g, "");
        if (!cnjLimpo.includes(termo)) return false;
      }
      return true;
    });
  }, [detalhes, filtro, busca]);

  const copiarErros = () => {
    const erros = detalhes.filter((d) => d.status === "erro");
    const txt = erros.map((d) => `${d.cnj}\t${d.mensagem ?? ""}`).join("\n");
    navigator.clipboard.writeText(txt);
  };

  const exportarCsv = () => {
    const header = "cnj;status;mensagem\n";
    const linhas = detalhes
      .map((d) => {
        const msg = (d.mensagem ?? "").replace(/"/g, '""').replace(/[\r\n]+/g, " ");
        return `"${d.cnj}";${d.status};"${msg}"`;
      })
      .join("\n");
    const blob = new Blob([header + linhas], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `importacao-pdpj-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const chips: { key: FiltroStatus; label: string; count: number }[] = [
    { key: "todos", label: "Todos", count: detalhes.length },
    { key: "ok", label: "Sucesso", count: okCount },
    { key: "duplicado", label: "Duplicados", count: dupCount },
    { key: "erro", label: "Erros", count: errCount },
  ];

  return (
    <div className="border border-border rounded-md">
      <div className="px-3 py-2 border-b border-border bg-muted/30 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
            <ListFilter className="w-3.5 h-3.5" />
            Status por processo
          </p>
          <div className="flex gap-1">
            {errCount > 0 && (
              <Button variant="ghost" size="sm" onClick={copiarErros}>
                <Copy className="w-3.5 h-3.5 mr-1" />
                Copiar erros
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={exportarCsv}>
              <Download className="w-3.5 h-3.5 mr-1" />
              Exportar CSV
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => {
            const ativo = filtro === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setFiltro(c.key)}
                className={`text-[11px] uppercase tracking-wider px-2 py-1 rounded-sm border transition-colors ${
                  ativo
                    ? "bg-gold/15 text-gold border-gold/40"
                    : "bg-background text-muted-foreground border-border hover:border-foreground/30"
                }`}
              >
                {c.label} <span className="ml-1 font-mono">{c.count}</span>
              </button>
            );
          })}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por CNJ…"
            className="pl-7 h-8 text-xs"
          />
        </div>
      </div>

      <ScrollArea className="h-[320px]">
        {filtrados.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">
            Nenhum item corresponde aos filtros aplicados.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtrados.map((d, i) => (
              <ItemStatus key={`${d.cnj}-${i}`} item={d} />
            ))}
          </ul>
        )}
      </ScrollArea>

      <div className="px-3 py-2 border-t border-border bg-muted/20 text-[11px] text-muted-foreground flex items-center justify-between">
        <span>
          Exibindo <strong className="text-foreground">{filtrados.length}</strong> de{" "}
          {detalhes.length}
        </span>
        {busca && (
          <button
            type="button"
            onClick={() => setBusca("")}
            className="underline hover:text-foreground"
          >
            limpar busca
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- Item da lista de status (com badge e botão copiar CNJ) ----------

function ItemStatus({ item }: { item: DetalheItem }) {
  const [copiado, setCopiado] = useState(false);

  const copiarCnj = async () => {
    try {
      await navigator.clipboard.writeText(item.cnj);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      /* clipboard indisponível — silencioso */
    }
  };

  const cfg =
    item.status === "ok"
      ? {
          icone: <CheckCircle2 className="w-4 h-4 text-gold" />,
          badge: "Sucesso",
          badgeClass: "border-gold/40 text-gold bg-gold/5",
          mensagemPadrao: "Processo cadastrado com sucesso.",
        }
      : item.status === "duplicado"
        ? {
            icone: <FileText className="w-4 h-4 text-muted-foreground" />,
            badge: "Já existia",
            badgeClass: "border-border text-muted-foreground bg-muted/40",
            mensagemPadrao: "CNJ já cadastrado no banco — não foi gravado novamente.",
          }
        : {
            icone: <XCircle className="w-4 h-4 text-destructive" />,
            badge: "Erro",
            badgeClass: "border-destructive/40 text-destructive bg-destructive/5",
            mensagemPadrao: "Falha ao cadastrar este processo.",
          };

  return (
    <li className="flex items-start gap-3 px-3 py-2.5 text-sm hover:bg-muted/20 transition-colors">
      <div className="mt-0.5 shrink-0">{cfg.icone}</div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-mono text-xs text-foreground">{item.cnj}</p>
          <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${cfg.badgeClass}`}>
            {cfg.badge}
          </Badge>
        </div>
        <p
          className={`text-xs mt-1 ${
            item.status === "erro" ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {item.mensagem ?? cfg.mensagemPadrao}
        </p>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={copiarCnj}
        className="h-7 px-2 shrink-0"
        title="Copiar CNJ"
      >
        {copiado ? (
          <>
            <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-gold" />
            <span className="text-[10px] uppercase tracking-wider">copiado</span>
          </>
        ) : (
          <>
            <Copy className="w-3.5 h-3.5 mr-1" />
            <span className="text-[10px] uppercase tracking-wider">CNJ</span>
          </>
        )}
      </Button>
    </li>
  );
}

// ---------- Relatório final da importação (resumo + tabela CSV) ----------

function RelatorioFinal({
  detalhes,
  total,
  okCount,
  errCount,
}: {
  detalhes: DetalheItem[];
  total: number;
  okCount: number;
  errCount: number;
}) {
  const dupCount = useMemo(
    () => detalhes.filter((d) => d.status === "duplicado").length,
    [detalhes],
  );
  const totalProcessado = detalhes.length;
  const totalEsperado = total > 0 ? total : totalProcessado;
  const taxaSucesso =
    totalProcessado > 0 ? Math.round((okCount / totalProcessado) * 100) : 0;

  const baixarRelatorioCsv = () => {
    const dataHora = new Date().toLocaleString("pt-BR");
    const cabecalho = [
      `# Relatório de importação PDPJ`,
      `# Gerado em: ${dataHora}`,
      `# Total esperado: ${totalEsperado}`,
      `# Processados: ${totalProcessado}`,
      `# Sucesso: ${okCount}`,
      `# Duplicados: ${dupCount}`,
      `# Erros: ${errCount}`,
      `# Taxa de sucesso: ${taxaSucesso}%`,
      "",
    ].join("\n");
    const header = "cnj;status;mensagem\n";
    const linhas = detalhes
      .map((d) => {
        const msg = (d.mensagem ?? "").replace(/"/g, '""').replace(/[\r\n]+/g, " ");
        return `"${d.cnj}";${d.status};"${msg}"`;
      })
      .join("\n");
    const blob = new Blob([cabecalho + header + linhas], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-importacao-pdpj-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const tudoOk = errCount === 0;

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {tudoOk ? (
            <CheckCircle2 className="w-5 h-5 text-gold" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-destructive" />
          )}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
              Relatório final
            </p>
            <p className="text-sm font-serif italic">
              {tudoOk
                ? "Importação concluída com sucesso"
                : "Importação concluída com pendências"}
            </p>
          </div>
        </div>
        <Button size="sm" onClick={baixarRelatorioCsv}>
          <Download className="w-3.5 h-3.5 mr-1.5" />
          Baixar relatório CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-border border-b border-border">
        <Metrica label="Processados" valor={totalProcessado} sub={`de ${totalEsperado}`} />
        <Metrica label="Sucesso" valor={okCount} tone="gold" />
        <Metrica label="Duplicados" valor={dupCount} tone="muted" />
        <Metrica label="Erros" valor={errCount} tone={errCount > 0 ? "destructive" : "muted"} />
      </div>

      <div className="px-4 py-3 bg-background flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Taxa de sucesso</span>
        <span className="font-mono tabular-nums">
          <strong className={tudoOk ? "text-gold" : "text-foreground"}>{taxaSucesso}%</strong>
        </span>
      </div>
    </div>
  );
}

function Metrica({
  label,
  valor,
  sub,
  tone = "default",
}: {
  label: string;
  valor: number;
  sub?: string;
  tone?: "default" | "gold" | "muted" | "destructive";
}) {
  const toneClass =
    tone === "gold"
      ? "text-gold"
      : tone === "destructive"
        ? "text-destructive"
        : tone === "muted"
          ? "text-muted-foreground"
          : "text-foreground";
  return (
    <div className="px-4 py-3">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`text-2xl font-serif tabular-nums ${toneClass}`}>{valor}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}
