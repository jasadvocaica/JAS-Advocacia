import { Editor } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Bold, Italic, Underline as UnderlineIcon, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Indent, Outdent, Variable, Undo, Redo,
  Eye, EyeOff, Strikethrough, Code, Quote, Minus, RemoveFormatting,
  Link2, Link2Off, Superscript as SuperscriptIcon, Subscript as SubscriptIcon,
  Palette, Highlighter, Type,
} from "lucide-react";
import { listarVariaveisPadrao } from "@/lib/documentos-variaveis";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface BarraFerramentasProps {
  editor: Editor | null;
  /** Quando o timbrado está disponível, exibe o toggle de mostrar/ocultar */
  timbradoDisponivel?: boolean;
  timbradoVisivel?: boolean;
  onToggleTimbrado?: () => void;
}

const CORES_TEXTO = [
  "#000000", "#374151", "#6B7280", "#EF4444", "#F59E0B",
  "#10B981", "#3B82F6", "#6366F1", "#8B5CF6", "#EC4899",
];
const CORES_DESTAQUE = [
  "#FEF3C7", "#FED7AA", "#FECACA", "#D1FAE5", "#BFDBFE",
  "#DDD6FE", "#FBCFE8", "#E5E7EB",
];
const TAMANHOS_FONTE = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];

export function BarraFerramentas({
  editor,
  timbradoDisponivel,
  timbradoVisivel,
  onToggleTimbrado,
}: BarraFerramentasProps) {
  const [varsCustomizadas, setVarsCustomizadas] = useState<{ chave: string; nome_legivel: string }[]>([]);
  const [linkUrl, setLinkUrl] = useState("");

  useEffect(() => {
    supabase
      .from("doc_variaveis_customizadas")
      .select("chave,nome_legivel")
      .eq("ativo", true)
      .order("nome_legivel")
      .then(({ data }) => setVarsCustomizadas(data ?? []));
  }, []);

  if (!editor) return null;
  const chain: any = () => editor.chain().focus();
  const can: any = editor.can();

  const inserirVariavel = (variavel: string) => {
    editor.chain().focus().insertContent(variavel).run();
  };

  const aplicarLink = () => {
    if (!linkUrl) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    const url = linkUrl.startsWith("http") ? linkUrl : `https://${linkUrl}`;
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    setLinkUrl("");
  };

  const aplicarTamanhoFonte = (tam: string) => {
    // Usa textStyle com fontSize via CSS inline (compatível com export PDF/DOCX).
    (editor.chain().focus() as any).setMark("textStyle", { fontSize: `${tam}pt` }).run();
  };

  const variaveisPadrao = listarVariaveisPadrao();
  const variaveisAgrupadas = {
    Processo: variaveisPadrao.filter((v) =>
      ["numero_cnj", "nb", "vara", "juiz", "area_direito", "tipo_acao", "valor_causa", "tribunal", "comarca_processo", "data_distribuicao"].some((k) => v.includes(k))
    ),
    Cliente: variaveisPadrao.filter((v) =>
      ["nome_cliente", "cpf", "rg", "nit", "endereco", "cidade_cliente", "estado_cliente", "profissao", "renda", "nascimento", "estado_civil"].some((k) => v.includes(k))
    ),
    Advogado: variaveisPadrao.filter((v) =>
      ["nome_advogado", "oab", "email_adv"].some((k) => v.includes(k))
    ),
    Data: variaveisPadrao.filter((v) =>
      ["data_hoje", "data_extenso", "mes_ano"].some((k) => v.includes(k))
    ),
  };

  return (
    <div className="flex flex-wrap items-center gap-1 border rounded-md bg-card p-2 sticky top-0 z-10">
      <Button variant="ghost" size="sm" onClick={() => chain().undo().run()} disabled={!can.undo?.()} title="Desfazer (Ctrl+Z)">
        <Undo className="w-4 h-4" />
      </Button>
      <Button variant="ghost" size="sm" onClick={() => chain().redo().run()} disabled={!can.redo?.()} title="Refazer (Ctrl+Y)">
        <Redo className="w-4 h-4" />
      </Button>

      <Separator orientation="vertical" className="h-6 mx-1" />

      <Select
        value={
          editor.isActive("heading", { level: 1 }) ? "h1" :
          editor.isActive("heading", { level: 2 }) ? "h2" :
          editor.isActive("heading", { level: 3 }) ? "h3" : "p"
        }
        onValueChange={(v) => {
          if (v === "p") chain().setParagraph().run();
          else chain().toggleHeading({ level: parseInt(v.replace("h", "")) as 1 | 2 | 3 }).run();
        }}
      >
        <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="p">Parágrafo</SelectItem>
          <SelectItem value="h1">Título 1</SelectItem>
          <SelectItem value="h2">Título 2</SelectItem>
          <SelectItem value="h3">Título 3</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={editor.getAttributes("textStyle").fontFamily ?? "'Bookman Old Style', serif"}
        onValueChange={(v) => chain().setFontFamily(v).run()}
      >
        <SelectTrigger className="w-40 h-8"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="'Bookman Old Style', serif">Bookman Old Style</SelectItem>
          <SelectItem value="'Times New Roman', serif">Times New Roman</SelectItem>
          <SelectItem value="Arial, sans-serif">Arial</SelectItem>
          <SelectItem value="'Courier New', monospace">Courier New</SelectItem>
          <SelectItem value="Georgia, serif">Georgia</SelectItem>
          <SelectItem value="Verdana, sans-serif">Verdana</SelectItem>
          <SelectItem value="Calibri, sans-serif">Calibri</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={(editor.getAttributes("textStyle").fontSize ?? "").replace("pt", "") || "12"}
        onValueChange={aplicarTamanhoFonte}
      >
        <SelectTrigger className="w-16 h-8"><SelectValue /></SelectTrigger>
        <SelectContent>
          {TAMANHOS_FONTE.map((t) => (
            <SelectItem key={t} value={String(t)}>{t}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Separator orientation="vertical" className="h-6 mx-1" />

      <Button variant={editor.isActive("bold") ? "secondary" : "ghost"} size="sm" onClick={() => chain().toggleBold().run()} title="Negrito (Ctrl+B)">
        <Bold className="w-4 h-4" />
      </Button>
      <Button variant={editor.isActive("italic") ? "secondary" : "ghost"} size="sm" onClick={() => chain().toggleItalic().run()} title="Itálico (Ctrl+I)">
        <Italic className="w-4 h-4" />
      </Button>
      <Button variant={editor.isActive("underline") ? "secondary" : "ghost"} size="sm" onClick={() => chain().toggleUnderline().run()} title="Sublinhado (Ctrl+U)">
        <UnderlineIcon className="w-4 h-4" />
      </Button>
      <Button variant={editor.isActive("strike") ? "secondary" : "ghost"} size="sm" onClick={() => chain().toggleStrike().run()} title="Tachado">
        <Strikethrough className="w-4 h-4" />
      </Button>
      <Button variant={editor.isActive("superscript") ? "secondary" : "ghost"} size="sm" onClick={() => chain().toggleSuperscript().run()} title="Sobrescrito">
        <SuperscriptIcon className="w-4 h-4" />
      </Button>
      <Button variant={editor.isActive("subscript") ? "secondary" : "ghost"} size="sm" onClick={() => chain().toggleSubscript().run()} title="Subscrito">
        <SubscriptIcon className="w-4 h-4" />
      </Button>

      {/* Cor do texto */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" title="Cor do texto" className="relative">
            <Palette className="w-4 h-4" />
            <span
              className="absolute bottom-1 left-1.5 right-1.5 h-1 rounded"
              style={{ background: editor.getAttributes("textStyle").color ?? "#000000" }}
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-3" align="start">
          <div className="text-xs font-medium mb-2">Cor do texto</div>
          <div className="grid grid-cols-5 gap-1.5 mb-2">
            {CORES_TEXTO.map((c) => (
              <button
                key={c}
                type="button"
                className="w-8 h-8 rounded border hover:scale-110 transition-transform"
                style={{ background: c }}
                onClick={() => chain().setColor(c).run()}
                title={c}
              />
            ))}
          </div>
          <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => chain().unsetColor().run()}>
            Remover cor
          </Button>
        </PopoverContent>
      </Popover>

      {/* Marca-texto */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant={editor.isActive("highlight") ? "secondary" : "ghost"} size="sm" title="Marca-texto">
            <Highlighter className="w-4 h-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-3" align="start">
          <div className="text-xs font-medium mb-2">Cor de destaque</div>
          <div className="grid grid-cols-4 gap-1.5 mb-2">
            {CORES_DESTAQUE.map((c) => (
              <button
                key={c}
                type="button"
                className="w-10 h-8 rounded border hover:scale-110 transition-transform"
                style={{ background: c }}
                onClick={() => chain().toggleHighlight({ color: c }).run()}
                title={c}
              />
            ))}
          </div>
          <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => chain().unsetHighlight().run()}>
            Remover destaque
          </Button>
        </PopoverContent>
      </Popover>

      <Separator orientation="vertical" className="h-6 mx-1" />

      <Button variant={editor.isActive({ textAlign: "left" }) ? "secondary" : "ghost"} size="sm" onClick={() => chain().setTextAlign("left").run()} title="Alinhar à esquerda">
        <AlignLeft className="w-4 h-4" />
      </Button>
      <Button variant={editor.isActive({ textAlign: "center" }) ? "secondary" : "ghost"} size="sm" onClick={() => chain().setTextAlign("center").run()} title="Centralizar">
        <AlignCenter className="w-4 h-4" />
      </Button>
      <Button variant={editor.isActive({ textAlign: "right" }) ? "secondary" : "ghost"} size="sm" onClick={() => chain().setTextAlign("right").run()} title="Alinhar à direita">
        <AlignRight className="w-4 h-4" />
      </Button>
      <Button variant={editor.isActive({ textAlign: "justify" }) ? "secondary" : "ghost"} size="sm" onClick={() => chain().setTextAlign("justify").run()} title="Justificar">
        <AlignJustify className="w-4 h-4" />
      </Button>

      <Separator orientation="vertical" className="h-6 mx-1" />

      <Button variant={editor.isActive("bulletList") ? "secondary" : "ghost"} size="sm" onClick={() => chain().toggleBulletList().run()} title="Lista">
        <List className="w-4 h-4" />
      </Button>
      <Button variant={editor.isActive("orderedList") ? "secondary" : "ghost"} size="sm" onClick={() => chain().toggleOrderedList().run()} title="Lista numerada">
        <ListOrdered className="w-4 h-4" />
      </Button>
      <Button variant="ghost" size="sm" onClick={() => chain().sinkListItem("listItem").run()} title="Aumentar recuo">
        <Indent className="w-4 h-4" />
      </Button>
      <Button variant="ghost" size="sm" onClick={() => editor.chain().focus().liftListItem("listItem").run()} title="Diminuir recuo">
        <Outdent className="w-4 h-4" />
      </Button>

      <Separator orientation="vertical" className="h-6 mx-1" />

      <Button variant={editor.isActive("blockquote") ? "secondary" : "ghost"} size="sm" onClick={() => chain().toggleBlockquote().run()} title="Citação">
        <Quote className="w-4 h-4" />
      </Button>
      <Button variant={editor.isActive("codeBlock") ? "secondary" : "ghost"} size="sm" onClick={() => chain().toggleCodeBlock().run()} title="Bloco de código">
        <Code className="w-4 h-4" />
      </Button>
      <Button variant="ghost" size="sm" onClick={() => chain().setHorizontalRule().run()} title="Linha horizontal">
        <Minus className="w-4 h-4" />
      </Button>

      {/* Link */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant={editor.isActive("link") ? "secondary" : "ghost"} size="sm" title="Inserir link">
            <Link2 className="w-4 h-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3" align="start">
          <div className="text-xs font-medium mb-2">URL do link</div>
          <div className="flex gap-2">
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://exemplo.com"
              className="h-8 text-sm"
              onKeyDown={(e) => { if (e.key === "Enter") aplicarLink(); }}
            />
            <Button size="sm" onClick={aplicarLink}>OK</Button>
          </div>
        </PopoverContent>
      </Popover>
      {editor.isActive("link") && (
        <Button variant="ghost" size="sm" onClick={() => chain().unsetLink().run()} title="Remover link">
          <Link2Off className="w-4 h-4" />
        </Button>
      )}

      <Button
        variant="ghost"
        size="sm"
        onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
        title="Limpar formatação"
      >
        <RemoveFormatting className="w-4 h-4" />
      </Button>

      <Separator orientation="vertical" className="h-6 mx-1" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Variable className="w-4 h-4" />
            Variáveis
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-[400px] overflow-y-auto w-72">
          {Object.entries(variaveisAgrupadas).map(([grupo, vars]) => (
            <DropdownMenuGroup key={grupo}>
              <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">
                {grupo}
              </DropdownMenuLabel>
              {vars.map((v) => (
                <DropdownMenuItem key={v} onSelect={() => inserirVariavel(v)} className="font-mono text-xs">
                  {v}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </DropdownMenuGroup>
          ))}
          {varsCustomizadas.length > 0 && (
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground">
                Customizadas
              </DropdownMenuLabel>
              {varsCustomizadas.map((v) => (
                <DropdownMenuItem
                  key={v.chave}
                  onSelect={() => inserirVariavel(`{{${v.chave}}}`)}
                  className="text-xs"
                >
                  <span className="font-mono mr-2">{`{{${v.chave}}}`}</span>
                  <span className="text-muted-foreground">— {v.nome_legivel}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {timbradoDisponivel && (
        <>
          <Separator orientation="vertical" className="h-6 mx-1" />
          <Button
            variant={timbradoVisivel ? "secondary" : "ghost"}
            size="sm"
            onClick={onToggleTimbrado}
            title={timbradoVisivel ? "Ocultar papel timbrado" : "Mostrar papel timbrado"}
            className="gap-2"
          >
            {timbradoVisivel ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            <span className="hidden sm:inline text-xs">Timbrado</span>
          </Button>
        </>
      )}
    </div>
  );
}
