import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { FontFamily } from "@tiptap/extension-font-family";
import { TextStyle, FontSize } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useRef, useState } from "react";
import { BarraFerramentas } from "./BarraFerramentas";
import { cn } from "@/lib/utils";
import { useTimbrado } from "@/hooks/useTimbrado";
import { calcularMargensEditor, MARGENS_PADRAO_CM } from "./margensEditor";
import { Button } from "@/components/ui/button";

interface PecaEditorProps {
  value: string;
  onChange: (html: string) => void;
  fonte?: string;
  tamanhoFonte?: number;
  espacamento?: number;
  className?: string;
  placeholder?: string;
  readOnly?: boolean;
  onSelectionChange?: (texto: string) => void;
}

export function PecaEditor({
  value,
  onChange,
  fonte = "Bookman Old Style",
  tamanhoFonte = 12,
  espacamento = 1.5,
  className,
  placeholder = "Comece a escrever a peça...",
  readOnly = false,
  onSelectionChange,
}: PecaEditorProps) {
  const conteudoInicial = useRef(value);
  const { timbrado } = useTimbrado();
  const [timbradoVisivel, setTimbradoVisivel] = useState(true);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(900);
  const [zoom, setZoom] = useState<number | null>(null);
  useEffect(() => {
    const el = workspaceRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setLargura(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const escala = zoom ?? Math.min(1, Math.max(0.25, (largura - 32) / 794));

  const timbradoDisponivel =
    timbrado.ativo &&
    ((timbrado.modo === "imagem_fundo" && !!timbrado.paginaInteiraUrl) ||
      (timbrado.modo === "cabecalho_rodape" &&
        (!!timbrado.cabecalhoUrl || !!timbrado.rodapeUrl || !!timbrado.marcaDaguaUrl)));

  const usandoFundoTimbrado =
    timbradoVisivel &&
    timbrado.ativo &&
    timbrado.modo === "imagem_fundo" &&
    !!timbrado.paginaInteiraUrl;
  const usandoCabecalhoRodape =
    timbradoVisivel && timbrado.ativo && timbrado.modo === "cabecalho_rodape";

  const editor = useEditor({
    editable: !readOnly,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false, underline: false }),
      Underline,
      TextStyle,
      FontSize,
      Color.configure({ types: ["textStyle"] }),
      Highlight.configure({ multicolor: true }),
      FontFamily.configure({ types: ["textStyle"] }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Subscript,
      Superscript,
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } }),
      Placeholder.configure({ placeholder }),
    ],
    content: conteudoInicial.current || "<p></p>",
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      if (from !== to) onSelectionChange?.(editor.state.doc.textBetween(from, to, " ").slice(0, 4000));
    },
    editorProps: {
      attributes: {
        class: "prose-juridico focus:outline-none min-h-[600px] text-black",
      },
    },
  });

  // Atualiza quando o conteúdo externo muda (ex.: aplicar modelo, restaurar versão)
  useEffect(() => {
    if (!editor) return;
    const atual = editor.getHTML();
    if (value !== atual) {
      try {
        editor.commands.setContent(value || "<p></p>", { emitUpdate: false, errorOnInvalidContent: false });
      } catch (err) {
        console.error("[PecaEditor] erro ao aplicar conteúdo, tentando fallback", err);
        try {
          editor.commands.setContent(value);
        } catch (err2) {
          console.error("[PecaEditor] fallback também falhou", err2);
        }
      }
    }
  }, [value, editor]);

  useEffect(() => {
    if (editor) editor.setEditable(!readOnly);
  }, [readOnly, editor]);

  // Margens efetivas calculadas pelo helper compartilhado — garante que
  // Modelo e Peça produzam impressão e PDF idênticos.
  const margensEfetivas = calcularMargensEditor({
    timbrado,
    timbradoVisivel,
    margensUsuario: MARGENS_PADRAO_CM,
  });
  const padding = {
    top: `${margensEfetivas.sup}cm`,
    bottom: `${margensEfetivas.inf}cm`,
    left: `${margensEfetivas.esq}cm`,
    right: `${margensEfetivas.dir}cm`,
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-2 px-2 text-xs text-muted-foreground print:hidden"><span>Folha A4 · {readOnly ? "Leitura" : "Edição"}</span><div className="flex items-center gap-1"><Button size="sm" variant="ghost" onClick={() => setZoom(null)}>Ajustar à largura</Button><select aria-label="Zoom do documento" className="rounded border bg-background p-1" value={zoom ?? "auto"} onChange={(e) => setZoom(e.target.value === "auto" ? null : Number(e.target.value))}><option value="auto">Automático</option>{[0.5, 0.75, 1, 1.25, 1.5].map((z) => <option key={z} value={z}>{Math.round(z * 100)}%</option>)}</select></div></div>
      {!readOnly && (
        <BarraFerramentas
          editor={editor}
          timbradoDisponivel={timbradoDisponivel}
          timbradoVisivel={timbradoVisivel}
          onToggleTimbrado={() => setTimbradoVisivel((v) => !v)}
        />
      )}
      {/* @page A4 + posição fixa do timbrado em cada página impressa */}
      <style>{`
        @media print {
          @page { size: A4; margin: ${padding.top} ${padding.right} ${padding.bottom} ${padding.left}; }
          .editor-juridico-print { background-image: none !important; }
          .editor-juridico-print .timbrado-bg-print {
            display: block !important;
            position: fixed !important;
            top: -${padding.top}; left: -${padding.left};
            width: 21cm; height: 29.7cm;
            object-fit: fill;
            z-index: 0;
            pointer-events: none;
          }
          .editor-juridico-print .timbrado-header {
            position: fixed !important;
            top: -${padding.top};
            left: -${padding.left};
            width: 21cm;
            height: ${timbrado.cabecalhoAlturaMm / 10}cm;
            object-fit: contain;
            z-index: 1;
          }
          .editor-juridico-print .timbrado-footer {
            position: fixed !important;
            bottom: -${padding.bottom};
            left: -${padding.left};
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
      <div
        ref={workspaceRef}
        className="editor-workspace"
        style={{ fontFamily: `${fonte}, "Bookman Old Style", "Book Antiqua", "EB Garamond", Georgia, serif`, fontSize: `${tamanhoFonte}pt`, lineHeight: espacamento }}
      >
        <div
          className="editor-juridico-page editor-juridico-print"
          style={{
            zoom: escala,
            paddingTop: padding.top,
            paddingBottom: padding.bottom,
            paddingLeft: padding.left,
            paddingRight: padding.right,
            backgroundImage: usandoFundoTimbrado
              ? `url("${timbrado.paginaInteiraUrl}")`
              : undefined,
            backgroundSize: usandoFundoTimbrado ? "100% 100%" : undefined,
            backgroundRepeat: usandoFundoTimbrado ? "no-repeat" : undefined,
            backgroundPosition: usandoFundoTimbrado ? "top left" : undefined,
          }}
        >
          {usandoFundoTimbrado && (
            <img
              src={timbrado.paginaInteiraUrl!}
              alt=""
              aria-hidden
              className="timbrado-bg-print pointer-events-none select-none"
              style={{ display: "none" }}
            />
          )}
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
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
    </div>
  );
}
