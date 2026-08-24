import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Upload, Download, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";
import { LABEL_DOC_CATEGORIA, type DocumentoEquipe, type DocumentoCategoria } from "../types";

interface Props { membroId: string; }

const formatTamanho = (b: number | null) => {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
};

export function DocumentosTabEdit({ membroId }: Props) {
  const [items, setItems] = useState<DocumentoEquipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [categoria, setCategoria] = useState<DocumentoCategoria>("outro");
  const [observacao, setObservacao] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const carregar = async () => {
    setLoading(true);
    const { data } = await supabase.from("equipe_documentos").select("*").eq("membro_id", membroId).order("criado_em", { ascending: false });
    setItems((data ?? []) as any);
    setLoading(false);
  };
  useEffect(() => { carregar(); }, [membroId]);

  const enviar = async () => {
    if (!arquivo) { toast.error("Selecione um arquivo"); return; }
    if (arquivo.size > 20 * 1024 * 1024) { toast.error("Arquivo maior que 20 MB"); return; }
    setEnviando(true);
    const ext = arquivo.name.split(".").pop() ?? "bin";
    const path = `${membroId}/${categoria}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("equipe-documentos").upload(path, arquivo, { contentType: arquivo.type });
    if (upErr) { setEnviando(false); toast.error("Falha no upload", { description: upErr.message }); return; }
    const { data: { user } } = await supabase.auth.getUser();
    const { error: insErr } = await supabase.from("equipe_documentos").insert({
      membro_id: membroId, categoria, nome: arquivo.name,
      storage_path: path, mime_type: arquivo.type, tamanho_bytes: arquivo.size,
      observacao: observacao || null, enviado_por: user?.id,
    });
    setEnviando(false);
    if (insErr) {
      await supabase.storage.from("equipe-documentos").remove([path]);
      toast.error("Erro ao registrar", { description: insErr.message });
      return;
    }
    toast.success("Documento enviado");
    setOpen(false); setArquivo(null); setObservacao(""); setCategoria("outro");
    if (inputRef.current) inputRef.current.value = "";
    carregar();
  };

  const baixar = async (doc: DocumentoEquipe) => {
    const { data, error } = await supabase.storage.from("equipe-documentos").createSignedUrl(doc.storage_path, 60);
    if (error || !data) { toast.error("Não foi possível gerar link"); return; }
    window.open(data.signedUrl, "_blank");
  };

  const remover = async (doc: DocumentoEquipe) => {
    await supabase.storage.from("equipe-documentos").remove([doc.storage_path]);
    const { error } = await supabase.from("equipe_documentos").delete().eq("id", doc.id);
    if (error) toast.error("Erro", { description: error.message });
    else { toast.success("Removido"); carregar(); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-semibold">Documentos do colaborador</h3>
          <p className="text-xs text-muted-foreground">Anexos privados visíveis apenas para gestores. Máx. 20 MB por arquivo.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" variant="gold"><Upload className="w-4 h-4" /> Enviar</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Enviar documento</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Categoria</Label>
                <Select value={categoria} onValueChange={(v) => setCategoria(v as DocumentoCategoria)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(LABEL_DOC_CATEGORIA).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Arquivo *</Label>
                <Input ref={inputRef} type="file" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
                {arquivo && <p className="text-xs text-muted-foreground mt-1">{arquivo.name} · {formatTamanho(arquivo.size)}</p>}
              </div>
              <div>
                <Label>Observação</Label>
                <Input value={observacao} onChange={(e) => setObservacao(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button variant="gold" onClick={enviar} disabled={enviando || !arquivo}>{enviando ? "Enviando..." : "Enviar"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Carregando...</p>
        : items.length === 0 ? <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Nenhum documento enviado.</CardContent></Card>
        : (
          <div className="space-y-2">
            {items.map((d) => (
              <Card key={d.id}><CardContent className="p-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{d.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {LABEL_DOC_CATEGORIA[d.categoria]} · {formatTamanho(d.tamanho_bytes)} · {new Date(d.criado_em).toLocaleDateString("pt-BR")}
                    </p>
                    {d.observacao && <p className="text-xs text-muted-foreground italic truncate">{d.observacao}</p>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => baixar(d)}><Download className="w-4 h-4" /></Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild><Button size="icon" variant="ghost"><Trash2 className="w-4 h-4 text-destructive" /></Button></AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>Excluir documento?</AlertDialogTitle></AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => remover(d)}>Excluir</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent></Card>
            ))}
          </div>
        )}
    </div>
  );
}
