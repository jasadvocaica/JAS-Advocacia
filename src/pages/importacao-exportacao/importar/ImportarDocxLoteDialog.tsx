import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { converterDocxParaHtml } from "./docx-converter";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Upload, Loader2, FileText, CheckCircle2, AlertTriangle, X, Trash2, Eye,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sanitizarHtmlDocumento } from "@/lib/documentos-html-sanitize";
import { useAuth } from "@/contexts/AuthContext";
import {
  AREAS_LABEL, CATEGORIAS_LABEL, DocAreaDireito, DocCategoria,
} from "@/pages/documentos/types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

type Etapa = "upload" | "revisar" | "importando" | "concluido";

type ItemStatus = "pendente" | "convertendo" | "pronto" | "salvando" | "ok" | "erro";

interface ItemLote {
  id: string;
  arquivo: File;
  /** Caminho relativo dentro da pasta selecionada (ex.: "Previdenciario/Recursos/x.docx"). */
  caminhoRelativo: string;
  titulo: string;
  categoria: DocCategoria;
  area: DocAreaDireito;
  html: string;
  variaveis: string[];
  status: ItemStatus;
  erro?: string;
  modeloId?: string;
}

const MAX_ARQUIVOS = 50;
const MAX_TAMANHO_MB = 10;

function detectarVariaveis(html: string): string[] {
  const set = new Set<string>();
  const re = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) set.add(m[1].toLowerCase());
  return Array.from(set).sort();
}

/**
 * Envolve cada `{{variavel}}` do HTML em um <mark> amarelo para destaque visual.
 * Roda só sobre o HTML já gerado pelo mammoth (texto sanitizado pelo próprio mammoth).
 */
function realcarVariaveis(html: string): string {
  if (!html) return "";
  return html.replace(
    /\{\{\s*([a-z0-9_]+)\s*\}\}/gi,
    (_match, nome) =>
      `<mark class="bg-amber-200/70 dark:bg-amber-500/30 text-amber-950 dark:text-amber-100 rounded px-1 font-mono text-[0.85em]">{{${String(nome).toLowerCase()}}}</mark>`,
  );
}

function inferirCategoria(nome: string): DocCategoria {
  const n = nome.toLowerCase();
  if (n.includes("recurso") || n.includes("apelaç") || n.includes("agravo")) return "recurso";
  if (n.includes("contrato") || n.includes("honor")) return "contrato";
  if (n.includes("procuraç")) return "procuracao";
  if (n.includes("manifest") || n.includes("réplica") || n.includes("replica")) return "manifestacao";
  if (n.includes("inss") || n.includes("administrativo") || n.includes("requerimento")) return "administrativo_inss";
  if (n.includes("quesito")) return "quesitos";
  if (n.includes("notific")) return "notificacao";
  if (n.includes("inicial") || n.includes("petiç")) return "peticao_inicial";
  return "outro";
}

function inferirArea(nome: string): DocAreaDireito {
  const n = nome.toLowerCase();
  if (n.includes("previd") || n.includes("inss") || n.includes("aposent") || n.includes("auxilio") || n.includes("auxílio")) return "previdenciario";
  if (n.includes("famil") || n.includes("famíl") || n.includes("divorcio") || n.includes("divórcio") || n.includes("alimentos")) return "familia";
  if (n.includes("trabalh")) return "trabalhista";
  if (n.includes("tribut")) return "tributario";
  if (n.includes("consumid") || n.includes("cdc")) return "consumidor";
  if (n.includes("civil")) return "civil";
  return "geral";
}

/**
 * Importa vários .docx de uma vez como modelos.
 * Fluxo: usuário seleciona/arrasta múltiplos arquivos (ou pasta) →
 *   sistema converte cada um com mammoth e mostra tabela editável (título, categoria, área) →
 *   usuário revisa e dispara importação em lote → barra de progresso item-a-item.
 */
export function ImportarDocxLoteDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const [etapa, setEtapa] = useState<Etapa>("upload");
  const [itens, setItens] = useState<ItemLote[]>([]);
  const [progresso, setProgresso] = useState(0);

  useEffect(() => {
    if (!open) return;
    setEtapa("upload");
    setItens([]);
    setProgresso(0);
  }, [open]);

  /**
   * Recebe arquivos vindos de input simples, drag-and-drop ou seleção de pasta
   * (`webkitdirectory`). Faz o varredura recursiva implícita (o browser já entrega
   * tudo achatado), mas precisamos:
   *  - filtrar somente `.docx` (a pasta pode ter PDFs, .doc, imagens, sub-pastas);
   *  - ignorar arquivos de sistema (`~$*`, `.DS_Store`);
   *  - preservar o caminho relativo (`webkitRelativePath`) para o usuário identificar
   *    onde cada modelo morava na pasta original;
   *  - dar feedback claro de quantos foram lidos e quantos foram descartados.
   */
  async function adicionarArquivos(files: FileList | File[], origem: "arquivos" | "pasta" = "arquivos") {
    const lista = Array.from(files);
    if (lista.length === 0) return;

    type ArquivoComCaminho = File & { webkitRelativePath?: string };

    // 1. Descarta arquivos temporários do Office/Mac e ocultos.
    const visiveis = lista.filter((f) => {
      const nome = f.name;
      if (!nome) return false;
      if (nome.startsWith("~$")) return false; // lock do Word aberto
      if (nome === ".DS_Store" || nome === "Thumbs.db") return false;
      return true;
    });

    // 2. Separa por extensão real para diagnóstico detalhado.
    const docx = visiveis.filter((f) => f.name.toLowerCase().endsWith(".docx"));
    const docLegado = visiveis.filter((f) => f.name.toLowerCase().endsWith(".doc"));
    const outros = visiveis.length - docx.length - docLegado.length;

    // Conta sub-pastas únicas — útil pra confirmar ao usuário que a varredura recursiva funcionou.
    const subPastas = new Set<string>();
    for (const f of docx) {
      const rel = (f as ArquivoComCaminho).webkitRelativePath || "";
      const partes = rel.split("/");
      if (partes.length > 2) subPastas.add(partes.slice(0, -1).join("/"));
    }

    if (origem === "pasta") {
      const detalhes: string[] = [];
      detalhes.push(`${docx.length} .docx encontrado(s)`);
      if (subPastas.size > 0) detalhes.push(`em ${subPastas.size} subpasta(s)`);
      if (docLegado.length > 0) detalhes.push(`${docLegado.length} .doc ignorado(s) — converta para .docx`);
      if (outros > 0) detalhes.push(`${outros} arquivo(s) de outros tipos ignorado(s)`);

      if (docx.length === 0) {
        toast.error("Nenhum .docx encontrado nessa pasta", {
          description:
            docLegado.length > 0
              ? `Encontrei ${docLegado.length} arquivo(s) .doc — abra no Word e salve como .docx.`
              : "A pasta varrida não contém arquivos .docx (.doc antigo não é suportado).",
        });
        return;
      }
      toast.success(`Pasta lida com sucesso`, { description: detalhes.join(" · ") });
    } else if (docx.length === 0) {
      toast.warning("Nenhum .docx selecionado", {
        description: "Apenas arquivos .docx são suportados (o formato .doc antigo não).",
      });
      return;
    } else if (visiveis.length - docx.length > 0) {
      toast.warning(`${visiveis.length - docx.length} arquivo(s) ignorado(s)`, {
        description: "Apenas .docx são suportados nessa importação.",
      });
    }

    // 3. Limite de tamanho.
    const muitoGrandes = docx.filter((f) => f.size > MAX_TAMANHO_MB * 1024 * 1024);
    if (muitoGrandes.length > 0) {
      toast.error(`${muitoGrandes.length} arquivo(s) acima de ${MAX_TAMANHO_MB} MB`, {
        description: "Esses arquivos não foram adicionados ao lote.",
      });
    }
    const aceitos = docx.filter((f) => f.size <= MAX_TAMANHO_MB * 1024 * 1024);
    if (aceitos.length === 0) return;

    // 4. Limite global de arquivos por lote.
    if (itens.length + aceitos.length > MAX_ARQUIVOS) {
      toast.error(`Limite de ${MAX_ARQUIVOS} arquivos por lote`, {
        description: `Você tentou adicionar ${aceitos.length}, mas só cabem mais ${
          MAX_ARQUIVOS - itens.length
        }. Faça em mais de uma rodada.`,
      });
      return;
    }

    // 5. Deduplica pelo caminho relativo (ou nome+tamanho como fallback) — evita
    // adicionar a mesma pasta duas vezes.
    const chaveExistente = new Set(
      itens.map((i) => i.caminhoRelativo || `${i.arquivo.name}::${i.arquivo.size}`),
    );
    const semDuplicar = aceitos.filter((f) => {
      const rel = (f as ArquivoComCaminho).webkitRelativePath || "";
      const chave = rel || `${f.name}::${f.size}`;
      return !chaveExistente.has(chave);
    });
    const duplicados = aceitos.length - semDuplicar.length;
    if (duplicados > 0) {
      toast.info(`${duplicados} arquivo(s) já estavam no lote`, {
        description: "Pulei as duplicatas — você pode revisar a lista.",
      });
    }
    if (semDuplicar.length === 0) return;

    // 6. Cria itens em estado "convertendo" e processa em paralelo (limitado).
    const novos: ItemLote[] = semDuplicar.map((f) => {
      const rel = (f as ArquivoComCaminho).webkitRelativePath || "";
      // Para quem subiu pasta, o título inicial inclui a primeira subpasta como dica
      // (ex.: "Recursos/Apelação INSS"), facilita revisão em massa.
      const partes = rel.split("/").filter(Boolean);
      const nomeBase = f.name.replace(/\.docx$/i, "");
      const tituloInicial =
        partes.length > 2 ? `${partes[partes.length - 2]} — ${nomeBase}` : nomeBase;
      return {
        id: crypto.randomUUID(),
        arquivo: f,
        caminhoRelativo: rel,
        titulo: tituloInicial,
        categoria: inferirCategoria(rel || f.name),
        area: inferirArea(rel || f.name),
        html: "",
        variaveis: [],
        status: "convertendo" as ItemStatus,
      };
    });
    setItens((prev) => [...prev, ...novos]);
    setEtapa("revisar");

    // Converte em paralelo, no máx 4 ao mesmo tempo, pra não travar o navegador.
    const fila = [...novos];
    const workers = Array.from({ length: Math.min(4, fila.length) }, async () => {
      while (fila.length) {
        const it = fila.shift()!;
        try {
          const buffer = await it.arquivo.arrayBuffer();
          const { html: htmlGerado } = await converterDocxParaHtml(buffer);
          const vars = detectarVariaveis(htmlGerado);
          setItens((prev) =>
            prev.map((p) =>
              p.id === it.id ? { ...p, html: htmlGerado, variaveis: vars, status: "pronto" } : p,
            ),
          );
        } catch (e) {
          setItens((prev) =>
            prev.map((p) =>
              p.id === it.id
                ? {
                    ...p,
                    status: "erro",
                    erro: e instanceof Error ? e.message : "Falha ao ler arquivo",
                  }
                : p,
            ),
          );
        }
      }
    });
    await Promise.all(workers);
  }

  function atualizarItem(id: string, patch: Partial<ItemLote>) {
    setItens((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function removerItem(id: string) {
    setItens((prev) => prev.filter((p) => p.id !== id));
  }

  function aplicarEmTodos(campo: "categoria" | "area", valor: string) {
    setItens((prev) =>
      prev.map((p) =>
        p.status === "pronto" || p.status === "convertendo"
          ? { ...p, [campo]: valor as never }
          : p,
      ),
    );
  }

  async function importarTudo() {
    const prontos = itens.filter((i) => i.status === "pronto");
    if (prontos.length === 0) {
      toast.error("Nada para importar", { description: "Aguarde a conversão ou remova os erros." });
      return;
    }

    const semTitulo = prontos.find((i) => !i.titulo.trim());
    if (semTitulo) {
      toast.error("Há itens sem título", { description: "Preencha todos antes de continuar." });
      return;
    }

    setEtapa("importando");
    setProgresso(0);

    let feitos = 0;
    for (const it of prontos) {
      atualizarItem(it.id, { status: "salvando" });
      const { data, error } = await supabase
        .from("doc_modelos")
        .insert({
          titulo: it.titulo.trim(),
          categoria: it.categoria,
          area_direito: it.area,
          conteudo_html: it.html,
          variaveis_usadas: it.variaveis,
          criado_por: user?.id ?? null,
          ativo: true,
        })
        .select("id")
        .single();

      if (error) {
        atualizarItem(it.id, { status: "erro", erro: error.message });
      } else {
        atualizarItem(it.id, { status: "ok", modeloId: data?.id });
      }
      feitos++;
      setProgresso(Math.round((feitos / prontos.length) * 100));
    }

    setEtapa("concluido");
  }

  const stats = useMemo(() => {
    return {
      total: itens.length,
      prontos: itens.filter((i) => i.status === "pronto").length,
      convertendo: itens.filter((i) => i.status === "convertendo").length,
      ok: itens.filter((i) => i.status === "ok").length,
      erro: itens.filter((i) => i.status === "erro").length,
    };
  }, [itens]);

  function fechar() {
    if (etapa === "importando") return;
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Importar modelos .docx em lote</DialogTitle>
          <DialogDescription>
            Selecione vários arquivos de uma vez (ou arraste uma pasta inteira).
            Cada .docx vira um modelo. Categoria e área são chutadas pelo nome — você revisa antes.
          </DialogDescription>
        </DialogHeader>

        {/* UPLOAD */}
        {etapa === "upload" && (
          <div className="flex-1 flex flex-col gap-3">
            <div
              className="flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-10 cursor-pointer hover:border-gold/50 transition-colors min-h-[280px]"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files?.length) adicionarArquivos(e.dataTransfer.files, "arquivos");
              }}
            >
              <Upload className="w-10 h-10 text-muted-foreground/60 mb-3" />
              <p className="text-sm font-medium">Clique para escolher arquivos ou arraste aqui</p>
              <p className="text-xs text-muted-foreground mt-1">
                Até {MAX_ARQUIVOS} arquivos .docx · {MAX_TAMANHO_MB} MB cada
              </p>
              <p className="text-[11px] text-muted-foreground/80 mt-3 max-w-md text-center">
                Para importar uma pasta inteira (com subpastas), use o botão abaixo.
                O navegador vai pedir permissão para ler a pasta.
              </p>
              <input
                ref={inputRef}
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) adicionarArquivos(e.target.files, "arquivos");
                  e.target.value = "";
                }}
              />
              <input
                ref={folderRef}
                type="file"
                // @ts-expect-error - atributo não-padrão suportado em Chrome/Edge/Firefox/Safari recente
                webkitdirectory=""
                directory=""
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) adicionarArquivos(e.target.files, "pasta");
                  e.target.value = "";
                }}
              />
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  inputRef.current?.click();
                }}
              >
                <FileText className="w-4 h-4 mr-1" />
                Selecionar arquivos
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  folderRef.current?.click();
                }}
              >
                <Upload className="w-4 h-4 mr-1" />
                Selecionar pasta inteira (recursivo)
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground text-center">
              Dica: ao escolher uma pasta, todos os <code>.docx</code> dentro dela
              (e em subpastas) entram no lote. Outros formatos são descartados automaticamente.
            </p>
          </div>
        )}

        {/* REVISAR / IMPORTANDO / CONCLUIDO */}
        {etapa !== "upload" && (
          <div className="flex-1 overflow-hidden flex flex-col gap-3">
            {/* Resumo */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{stats.total} arquivo(s)</Badge>
              {stats.convertendo > 0 && (
                <Badge variant="outline" className="text-muted-foreground">
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  {stats.convertendo} convertendo
                </Badge>
              )}
              {stats.prontos > 0 && (
                <Badge className="bg-success/15 text-success hover:bg-success/15">
                  {stats.prontos} prontos
                </Badge>
              )}
              {stats.ok > 0 && (
                <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/15">
                  {stats.ok} importados
                </Badge>
              )}
              {stats.erro > 0 && (
                <Badge variant="destructive">{stats.erro} com erro</Badge>
              )}

              {etapa === "revisar" && (
                <>
                  <div className="flex-1" />
                  <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                    <FileText className="w-3 h-3 mr-1" /> Adicionar arquivos
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => folderRef.current?.click()}>
                    <Upload className="w-3 h-3 mr-1" /> Adicionar pasta
                  </Button>
                </>
              )}
            </div>

            {/* Aplicar a todos (atalho útil pra padronizar) */}
            {etapa === "revisar" && stats.prontos > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs">
                <span className="text-muted-foreground">Aplicar a todos:</span>
                <Select onValueChange={(v) => aplicarEmTodos("categoria", v)}>
                  <SelectTrigger className="h-7 w-[180px] text-xs">
                    <SelectValue placeholder="Categoria…" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORIAS_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select onValueChange={(v) => aplicarEmTodos("area", v)}>
                  <SelectTrigger className="h-7 w-[180px] text-xs">
                    <SelectValue placeholder="Área…" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(AREAS_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Progresso global */}
            {etapa === "importando" && (
              <div className="space-y-1">
                <Progress value={progresso} />
                <p className="text-xs text-muted-foreground text-center">
                  Salvando modelos… {progresso}%
                </p>
              </div>
            )}

            {/* Tabela */}
            <ScrollArea className="flex-1 border rounded-md">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-[34%]">Arquivo / Título</TableHead>
                    <TableHead className="w-[18%]">Categoria</TableHead>
                    <TableHead className="w-[16%]">Área</TableHead>
                    <TableHead className="w-[14%] text-center">Conteúdo</TableHead>
                    <TableHead className="w-[12%]">Status</TableHead>
                    <TableHead className="w-[6%]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itens.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell className="align-top">
                        <Input
                          value={it.titulo}
                          onChange={(e) => atualizarItem(it.id, { titulo: e.target.value })}
                          className="h-8 text-sm"
                          disabled={etapa !== "revisar" || it.status === "erro"}
                        />
                        <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1 truncate" title={it.caminhoRelativo || it.arquivo.name}>
                          <FileText className="w-3 h-3 shrink-0" />
                          <span className="truncate">
                            {it.caminhoRelativo || it.arquivo.name}
                          </span>
                        </p>
                      </TableCell>
                      <TableCell className="align-top">
                        <Select
                          value={it.categoria}
                          onValueChange={(v) =>
                            atualizarItem(it.id, { categoria: v as DocCategoria })
                          }
                          disabled={etapa !== "revisar" || it.status === "erro"}
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(CATEGORIAS_LABEL).map(([k, v]) => (
                              <SelectItem key={k} value={k}>{v}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="align-top">
                        <Select
                          value={it.area}
                          onValueChange={(v) =>
                            atualizarItem(it.id, { area: v as DocAreaDireito })
                          }
                          disabled={etapa !== "revisar" || it.status === "erro"}
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(AREAS_LABEL).map(([k, v]) => (
                              <SelectItem key={k} value={k}>{v}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-center align-top">
                        <PreviewPopover item={it} />
                      </TableCell>
                      <TableCell className="align-top">
                        <StatusBadge item={it} />
                      </TableCell>
                      <TableCell className="align-top">
                        {etapa === "revisar" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => removerItem(it.id)}
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {etapa === "concluido" && it.status === "ok" && it.modeloId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => {
                              onOpenChange(false);
                              navigate(`/documentos/modelos/${it.modeloId}`);
                            }}
                          >
                            Abrir
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>

            {etapa === "concluido" && (
              <Alert className="border-success/30 bg-success/5">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <AlertTitle className="text-success">Importação concluída</AlertTitle>
                <AlertDescription className="text-xs">
                  {stats.ok} modelo(s) importado(s) com sucesso
                  {stats.erro > 0 && ` · ${stats.erro} falharam (veja a coluna Status)`}.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter>
          {etapa === "upload" && (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
          )}
          {etapa === "revisar" && (
            <>
              <Button variant="ghost" onClick={() => setItens([])}>
                <Trash2 className="w-4 h-4 mr-1" /> Limpar lista
              </Button>
              <Button
                variant="gold"
                onClick={importarTudo}
                disabled={stats.prontos === 0 || stats.convertendo > 0}
              >
                {stats.convertendo > 0 ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Aguarde a conversão</>
                ) : (
                  <>Importar {stats.prontos} modelo(s)</>
                )}
              </Button>
            </>
          )}
          {etapa === "importando" && (
            <Button variant="gold" disabled>
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Importando…
            </Button>
          )}
          {etapa === "concluido" && (
            <Button variant="gold" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ item }: { item: ItemLote }) {
  switch (item.status) {
    case "convertendo":
      return (
        <Badge variant="outline" className="text-xs">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Lendo…
        </Badge>
      );
    case "pronto":
      return <Badge variant="secondary" className="text-xs">Pronto</Badge>;
    case "salvando":
      return (
        <Badge variant="outline" className="text-xs">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Salvando
        </Badge>
      );
    case "ok":
      return (
        <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/15 text-xs">
          <CheckCircle2 className="w-3 h-3 mr-1" /> Importado
        </Badge>
      );
    case "erro":
      return (
        <Badge variant="destructive" className="text-xs" title={item.erro}>
          <AlertTriangle className="w-3 h-3 mr-1" /> Erro
        </Badge>
      );
    default:
      return null;
  }
}

/**
 * Botão pequeno que abre um Popover com a pré-visualização do HTML convertido,
 * com as variáveis {{...}} destacadas em amarelo. Mostra também a contagem de
 * variáveis encontradas no botão (badge).
 */
function PreviewPopover({ item }: { item: ItemLote }) {
  if (item.status === "convertendo") {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  if (item.status === "erro") {
    return (
      <span className="text-xs text-muted-foreground" title={item.erro}>
        indisponível
      </span>
    );
  }
  const htmlRealcado = realcarVariaveis(sanitizarHtmlDocumento(item.html));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs gap-1">
          <Eye className="w-3 h-3" />
          Ver
          {item.variaveis.length > 0 && (
            <Badge
              variant="secondary"
              className="ml-1 h-4 px-1 text-[10px] font-mono leading-none"
            >
              {item.variaveis.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="left"
        align="start"
        className="w-[560px] max-w-[90vw] p-0"
      >
        <div className="border-b px-3 py-2 flex items-center justify-between gap-2">
          <p className="text-xs font-medium truncate flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{item.arquivo.name}</span>
          </p>
          <Badge variant="outline" className="text-[10px] shrink-0">
            {item.variaveis.length} {item.variaveis.length === 1 ? "variável" : "variáveis"}
          </Badge>
        </div>

        {item.variaveis.length > 0 && (
          <div className="border-b px-3 py-2 flex flex-wrap gap-1 max-h-20 overflow-y-auto">
            {item.variaveis.map((v) => (
              <Badge
                key={v}
                className="bg-amber-200/70 dark:bg-amber-500/30 text-amber-950 dark:text-amber-100 hover:bg-amber-200/70 font-mono text-[10px] px-1.5"
              >
                {`{{${v}}}`}
              </Badge>
            ))}
          </div>
        )}

        <ScrollArea className="h-[360px]">
          <div
            className="prose prose-sm max-w-none dark:prose-invert p-3 [&_mark]:rounded"
            dangerouslySetInnerHTML={{ __html: htmlRealcado }}
          />
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
