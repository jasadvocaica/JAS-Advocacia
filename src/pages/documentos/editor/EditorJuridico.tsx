import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { FontFamily } from "@tiptap/extension-font-family";
import { TextStyle } from "@tiptap/extension-text-style";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { BarraFerramentas } from "./BarraFerramentas";
import { VariavelMark } from "./VariavelExtension";
import {
  substituirVariaveis,
  extrairVariaveis,
  type VariavelCtx,
} from "@/lib/documentos-variaveis";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, AlertTriangle, Save } from "lucide-react";
import { useTimbrado } from "@/hooks/useTimbrado";
import { calcularMargensEditor } from "./margensEditor";
import { sanitizarHtmlDocumento } from "@/lib/documentos-html-sanitize";

interface EditorJuridicoProps {
  /** HTML inicial / controlado */
  value: string;
  onChange: (html: string) => void;
  /** Salva no backend; chamado a cada 30s se houve mudança */
  onAutosave?: (html: string) => Promise<void> | void;
  /** Contexto para substituição de variáveis (cliente/processo/advogado) */
  contexto?: VariavelCtx;
  /** Aplica substituição de variáveis na renderização (não altera o source) */
  aplicarVariaveis?: boolean;
  /** Estilo da página */
  fonte?: string;
  tamanhoFonte?: number;
  espacamento?: number;
  margens?: { sup: number; inf: number; esq: number; dir: number }; // cm
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
  /** Intervalo do autosave em ms (default 30000) */
  intervaloAutosaveMs?: number;
  /** Mostra a barra de ferramentas (default true se editável) */
  mostrarBarra?: boolean;
}

type StatusAutosave = "idle" | "salvando" | "salvo" | "erro";

export function EditorJuridico({
  value,
  onChange,
  onAutosave,
  contexto,
  aplicarVariaveis = false,
  fonte = "Bookman Old Style",
  tamanhoFonte = 12,
  espacamento = 1.5,
  margens = { sup: 3, inf: 2, esq: 3, dir: 2 },
  placeholder = "Comece a escrever a peça...",
  readOnly = false,
  className,
  intervaloAutosaveMs = 30000,
  mostrarBarra,
}: EditorJuridicoProps) {
  const conteudoInicial = useRef(value);
  const ultimoSalvoRef = useRef(value);
  const [status, setStatus] = useState<StatusAutosave>("idle");
  const [ultimoSalvoEm, setUltimoSalvoEm] = useState<Date | null>(null);
  const [htmlRender, setHtmlRender] = useState<string>(value);

  const editor = useEditor({
    editable: !readOnly,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TextStyle,
      FontFamily.configure({ types: ["textStyle"] }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder }),
      VariavelMark,
    ],
    content: conteudoInicial.current || "<p></p>",
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: "prose-juridico focus:outline-none",
      },
    },
  });

  // Sincroniza valor externo (ex.: aplicar modelo)
  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML() && value !== conteudoInicial.current) {
      conteudoInicial.current = value;
      editor.commands.setContent(value || "<p></p>", { emitUpdate: false });
    }
  }, [value, editor]);

  useEffect(() => {
    if (editor) editor.setEditable(!readOnly);
  }, [readOnly, editor]);

  // Autosave: dispara a cada N ms se conteúdo mudou desde o último salvo
  const salvar = useCallback(async () => {
    if (!onAutosave || readOnly) return;
    const atual = editor?.getHTML() ?? value;
    if (atual === ultimoSalvoRef.current) return;
    setStatus("salvando");
    try {
      await onAutosave(atual);
      ultimoSalvoRef.current = atual;
      setUltimoSalvoEm(new Date());
      setStatus("salvo");
    } catch (e) {
      console.error("Autosave falhou", e);
      setStatus("erro");
    }
  }, [editor, value, onAutosave, readOnly]);

  useEffect(() => {
    if (!onAutosave || readOnly) return;
    const id = setInterval(salvar, intervaloAutosaveMs);
    return () => clearInterval(id);
  }, [salvar, intervaloAutosaveMs, onAutosave, readOnly]);

  // Salva ao desmontar / fechar aba
  useEffect(() => {
    if (!onAutosave || readOnly) return;
    const handler = () => {
      const atual = editor?.getHTML() ?? value;
      if (atual !== ultimoSalvoRef.current) onAutosave(atual);
    };
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("beforeunload", handler);
      handler();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, onAutosave, readOnly]);

  // Renderização com variáveis substituídas (preview)
  useEffect(() => {
    let ativo = true;
    if (!aplicarVariaveis || !contexto) {
      setHtmlRender(sanitizarHtmlDocumento(value));
      return;
    }
    substituirVariaveis(value, contexto, { destacarPendentes: true }).then((html) => {
      if (ativo) setHtmlRender(sanitizarHtmlDocumento(html));
    });
    return () => {
      ativo = false;
    };
  }, [value, contexto, aplicarVariaveis]);

  const variaveisPendentes = useMemo(
    () => (aplicarVariaveis ? extrairVariaveis(htmlRender) : []),
    [htmlRender, aplicarVariaveis]
  );

  const podeMostrarBarra = mostrarBarra ?? !readOnly;
  const { timbrado } = useTimbrado();
  const [timbradoVisivel, setTimbradoVisivel] = useState(true);

  // Margens efetivas: se o timbrado modo "imagem_fundo" estiver ativo,
  // usamos as margens definidas no timbrado (em mm convertidos p/ cm) para
  // que o conteúdo respeite a área útil do papel timbrado também na tela.
  const timbradoDisponivel =
    timbrado.ativo &&
    ((timbrado.modo === "imagem_fundo" && !!timbrado.paginaInteiraUrl) ||
      (timbrado.modo === "cabecalho_rodape" &&
        (!!timbrado.cabecalhoUrl || !!timbrado.rodapeUrl || !!timbrado.marcaDaguaUrl)));

  const usandoFundoTimbrado =
    timbradoVisivel && timbrado.ativo && timbrado.modo === "imagem_fundo" && !!timbrado.paginaInteiraUrl;
  const usandoCabecalhoRodape =
    timbradoVisivel && timbrado.ativo && timbrado.modo === "cabecalho_rodape";

  const margensEfetivas = calcularMargensEditor({
    timbrado,
    timbradoVisivel,
    margensUsuario: margens,
  });

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {podeMostrarBarra && (
        <BarraFerramentas
          editor={editor}
          timbradoDisponivel={timbradoDisponivel}
          timbradoVisivel={timbradoVisivel}
          onToggleTimbrado={() => setTimbradoVisivel((v) => !v)}
        />
      )}

      {/* Status do autosave */}
      {onAutosave && !readOnly && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground px-1">
          <StatusBadge status={status} />
          {ultimoSalvoEm && (
            <span>
              Salvo às {ultimoSalvoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
          <button
            type="button"
            onClick={salvar}
            className="ml-auto inline-flex items-center gap-1 text-primary hover:underline"
          >
            <Save className="h-3 w-3" /> Salvar agora
          </button>
        </div>
      )}

      {variaveisPendentes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <span className="font-medium">Variáveis sem valor:</span>
          {variaveisPendentes.map((v) => (
            <Badge key={v} variant="outline" className="font-mono">
              {v}
            </Badge>
          ))}
        </div>
      )}

      {/* @page A4 + posição fixa do timbrado em cada página impressa */}
      <style>{`
        @media print {
          @page { size: A4; margin: ${margensEfetivas.sup}cm ${margensEfetivas.dir}cm ${margensEfetivas.inf}cm ${margensEfetivas.esq}cm; }
          .editor-juridico-print { background-image: none !important; }
          .editor-juridico-print .timbrado-bg-print {
            display: block !important;
            position: fixed !important;
            top: -${margensEfetivas.sup}cm; left: -${margensEfetivas.esq}cm;
            width: 21cm; height: 29.7cm;
            object-fit: fill;
            z-index: 0;
            pointer-events: none;
          }
          .editor-juridico-print .timbrado-header {
            position: fixed !important;
            top: -${margensEfetivas.sup}cm;
            left: -${margensEfetivas.esq}cm;
            width: 21cm;
            height: ${timbrado.cabecalhoAlturaMm / 10}cm;
            object-fit: contain;
            z-index: 1;
          }
          .editor-juridico-print .timbrado-footer {
            position: fixed !important;
            bottom: -${margensEfetivas.inf}cm;
            left: -${margensEfetivas.esq}cm;
            width: 21cm;
            height: ${timbrado.rodapeAlturaMm / 10}cm;
            object-fit: contain;
            z-index: 1;
          }
          .editor-juridico-print .timbrado-watermark {
            position: fixed !important;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%) !important;
            width: ${timbrado.marcaDaguaLarguraMm / 10}cm;
            opacity: ${timbrado.marcaDaguaOpacidade};
            z-index: 0;
          }
          .editor-juridico-print .relative { position: relative; z-index: 2; }
        }
      `}</style>

      {/* Mesa de trabalho + Folha A4 */}
      <div className="editor-workspace">
        <div
          className={cn("editor-juridico-page editor-juridico-print")}
          style={{
            paddingTop: `${margensEfetivas.sup}cm`,
            paddingBottom: `${margensEfetivas.inf}cm`,
            paddingLeft: `${margensEfetivas.esq}cm`,
            paddingRight: `${margensEfetivas.dir}cm`,
            fontFamily: `${fonte}, "Bookman Old Style", "Book Antiqua", "EB Garamond", Georgia, serif`,
            fontSize: `${tamanhoFonte}pt`,
            lineHeight: espacamento,
            backgroundImage: usandoFundoTimbrado
              ? `url("${timbrado.paginaInteiraUrl}")`
              : undefined,
            backgroundSize: usandoFundoTimbrado ? "100% 100%" : undefined,
            backgroundRepeat: usandoFundoTimbrado ? "no-repeat" : undefined,
            backgroundPosition: usandoFundoTimbrado ? "top left" : undefined,
          }}
        >
          {/* Versão impressa do fundo timbrado: img fixa repetida em cada página */}
          {usandoFundoTimbrado && (
            <img
              src={timbrado.paginaInteiraUrl!}
              alt=""
              aria-hidden
              className="timbrado-bg-print pointer-events-none select-none"
              style={{ display: "none" }}
            />
          )}
          {/* Cabeçalho/Rodapé/Marca-d'água do modo legado, renderizados como overlay */}
          {usandoCabecalhoRodape && timbrado.cabecalhoUrl && (
            <img
              src={timbrado.cabecalhoUrl}
              alt=""
              aria-hidden
              className="timbrado-header pointer-events-none absolute left-0 right-0 top-0 w-full select-none"
              style={{ height: `${timbrado.cabecalhoAlturaMm / 10}cm`, objectFit: "contain" }}
            />
          )}
          {usandoCabecalhoRodape && timbrado.rodapeUrl && (
            <img
              src={timbrado.rodapeUrl}
              alt=""
              aria-hidden
              className="timbrado-footer pointer-events-none absolute left-0 right-0 bottom-0 w-full select-none"
              style={{ height: `${timbrado.rodapeAlturaMm / 10}cm`, objectFit: "contain" }}
            />
          )}
          {usandoCabecalhoRodape && timbrado.marcaDaguaUrl && (
            <img
              src={timbrado.marcaDaguaUrl}
              alt=""
              aria-hidden
              className="timbrado-watermark pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none"
              style={{
                width: `${timbrado.marcaDaguaLarguraMm / 10}cm`,
                opacity: timbrado.marcaDaguaOpacidade,
              }}
            />
          )}

          <div className="relative">
            {aplicarVariaveis && readOnly ? (
              <div
                className="prose-juridico"
                dangerouslySetInnerHTML={{ __html: htmlRender }}
              />
            ) : (
              <EditorContent editor={editor} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: StatusAutosave }) {
  if (status === "salvando")
    return (
      <span className="inline-flex items-center gap-1 text-primary">
        <Loader2 className="h-3 w-3 animate-spin" /> Salvando…
      </span>
    );
  if (status === "salvo")
    return (
      <span className="inline-flex items-center gap-1 text-success">
        <CheckCircle2 className="h-3 w-3" /> Tudo salvo
      </span>
    );
  if (status === "erro")
    return (
      <span className="inline-flex items-center gap-1 text-destructive">
        <AlertTriangle className="h-3 w-3" /> Falha ao salvar
      </span>
    );
  return <span className="text-muted-foreground">Autosave a cada 30s</span>;
}
