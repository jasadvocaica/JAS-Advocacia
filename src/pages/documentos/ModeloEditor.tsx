import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/layout/PageHeader";
import { PecaEditor } from "./editor/PecaEditor";
import { AREAS_LABEL, CATEGORIAS_LABEL, DocModelo, DocCategoria, DocAreaDireito } from "./types";
import { extrairVariaveis } from "@/lib/documentos-variaveis";
import { toast } from "@/hooks/use-toast";
import { Save, ArrowLeft } from "lucide-react";

export default function ModeloEditor() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const editando = !!id && id !== "novo";

  const [carregando, setCarregando] = useState(editando);
  const [salvando, setSalvando] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState<DocCategoria>("peticao_inicial");
  const [areaDireito, setAreaDireito] = useState<DocAreaDireito>("previdenciario");
  const [conteudoHtml, setConteudoHtml] = useState("<p></p>");
  const [fonte, setFonte] = useState("Bookman Old Style");
  const [tamanhoFonte, setTamanhoFonte] = useState(12);
  const [espacamento, setEspacamento] = useState(1.5);

  useEffect(() => {
    if (!editando) return;
    (async () => {
      const { data, error } = await supabase.from("doc_modelos").select("*").eq("id", id!).maybeSingle();
      if (error || !data) {
        toast({ title: "Modelo não encontrado", variant: "destructive" });
        navigate("/documentos/modelos");
        return;
      }
      const m = data as DocModelo;
      setTitulo(m.titulo);
      setDescricao(m.descricao ?? "");
      setCategoria(m.categoria as DocCategoria);
      setAreaDireito((m.area_direito ?? "geral") as DocAreaDireito);
      setConteudoHtml(m.conteudo_html || "<p></p>");
      setFonte(m.fonte ?? "Bookman Old Style");
      setTamanhoFonte(m.tamanho_fonte ?? 12);
      setEspacamento(Number(m.espacamento_entre_linhas ?? 1.5));
      setCarregando(false);
    })();
  }, [editando, id, navigate]);

  const salvar = async () => {
    if (!titulo.trim()) {
      toast({ title: "Título é obrigatório", variant: "destructive" });
      return;
    }
    setSalvando(true);
    const variaveis = extrairVariaveis(conteudoHtml);
    const payload = {
      titulo: titulo.trim(),
      descricao: descricao.trim() || null,
      categoria,
      area_direito: areaDireito,
      conteudo_html: conteudoHtml,
      variaveis_usadas: variaveis,
      fonte,
      tamanho_fonte: tamanhoFonte,
      espacamento_entre_linhas: espacamento,
    };

    let res;
    if (editando) {
      res = await supabase.from("doc_modelos").update(payload).eq("id", id!);
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      res = await supabase.from("doc_modelos").insert({ ...payload, criado_por: user?.id });
    }
    setSalvando(false);
    if (res.error) {
      toast({ title: "Erro ao salvar", description: res.error.message, variant: "destructive" });
    } else {
      toast({ title: editando ? "Modelo atualizado" : "Modelo criado" });
      navigate("/documentos/modelos");
    }
  };

  if (carregando) return <div className="p-12 text-center text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6">
      <PageHeader title={editando ? "Editar modelo" : "Novo modelo"}>
        <Button variant="outline" onClick={() => navigate("/documentos/modelos")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
        </Button>
        <Button onClick={salvar} disabled={salvando}>
          <Save className="w-4 h-4 mr-2" /> {salvando ? "Salvando..." : "Salvar"}
        </Button>
      </PageHeader>

      <Card className="p-5 grid gap-4 grid-cols-1 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label>Título *</Label>
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Petição inicial — aposentadoria especial" />
        </div>
        <div className="md:col-span-2">
          <Label>Descrição</Label>
          <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} />
        </div>
        <div>
          <Label>Categoria</Label>
          <Select value={categoria} onValueChange={(v) => setCategoria(v as DocCategoria)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(CATEGORIAS_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Área do direito</Label>
          <Select value={areaDireito} onValueChange={(v) => setAreaDireito(v as DocAreaDireito)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(AREAS_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <PecaEditor
        value={conteudoHtml}
        onChange={setConteudoHtml}
        fonte={fonte}
        tamanhoFonte={tamanhoFonte}
        espacamento={espacamento}
        placeholder="Digite o conteúdo do modelo. Use {{variaveis}} para campos dinâmicos."
      />
    </div>
  );
}
