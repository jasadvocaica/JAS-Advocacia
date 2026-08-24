import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  FileText, Folder, Upload, Download, Trash2, Loader2, Image as ImageIcon,
  FileSpreadsheet, FileType2, File as FileIcon, Search, Wand2, ChevronDown,
  Share2,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";

interface Documento {
  id: string;
  cliente_id: string | null;
  processo_id: string | null;
  nome: string;
  url: string;
  categoria: string | null;
  mime_type: string | null;
  tamanho_bytes: number | null;
  versao: number;
  criado_em: string;
  upload_por: string | null;
  compartilhar_com_parceiro: boolean;
}

const CATEGORIAS = [
  { v: "procuracao", l: "Procuração" },
  { v: "rg_cpf", l: "RG / CPF" },
  { v: "comprovante_residencia", l: "Comprovante de residência" },
  { v: "comprovante_renda", l: "Comprovante de renda" },
  { v: "laudo_medico", l: "Laudo médico" },
  { v: "exame", l: "Exame" },
  { v: "carteira_trabalho", l: "Carteira de trabalho" },
  { v: "cnis", l: "CNIS" },
  { v: "indeferimento", l: "Carta de indeferimento" },
  { v: "contrato", l: "Contrato" },
  { v: "outro", l: "Outro" },
] as const;

const CATEGORIA_CLASS: Record<string, string> = {
  procuracao: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  rg_cpf: "bg-violet-500/15 text-violet-600 border-violet-500/30",
  comprovante_residencia: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  comprovante_renda: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  laudo_medico: "bg-rose-500/15 text-rose-600 border-rose-500/30",
  exame: "bg-rose-500/15 text-rose-600 border-rose-500/30",
  carteira_trabalho: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  cnis: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  indeferimento: "bg-destructive/10 text-destructive border-destructive/30",
  contrato: "bg-gold/15 text-gold border-gold/30",
  outro: "bg-muted text-muted-foreground border-muted-foreground/30",
};

function iconForMime(mime: string | null) {
  if (!mime) return FileIcon;
  if (mime.startsWith("image/")) return ImageIcon;
  if (mime.includes("pdf")) return FileType2;
  if (mime.includes("sheet") || mime.includes("excel") || mime.includes("csv")) return FileSpreadsheet;
  return FileText;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  clienteId: string;
}

export default function DocumentosTab({ clienteId }: Props) {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState<string>("todas");
  const [openUpload, setOpenUpload] = useState(false);
  const [removing, setRemoving] = useState<Documento | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [categoria, setCategoria] = useState<string>("outro");
  const [nomeCustom, setNomeCustom] = useState("");
  const [compartilharParceiro, setCompartilharParceiro] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const podeCriar = hasPermission("documentos", "criar");
  const podeExcluir = hasPermission("documentos", "excluir");

  function gerarPeca(categoriaPeca: "procuracao" | "contrato" | "notificacao") {
    navigate(
      `/documentos/pecas/novo?cliente_id=${clienteId}&categoria=${categoriaPeca}&auto=1`,
    );
  }

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("documentos")
      .select("*")
      .eq("cliente_id", clienteId)
      .order("criado_em", { ascending: false });
    if (error) toast.error("Erro ao carregar documentos");
    setItems((data as Documento[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [clienteId]);

  function resetForm() {
    setFile(null);
    setCategoria("outro");
    setNomeCustom("");
    setCompartilharParceiro(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function handleUpload() {
    if (!file) {
      toast.error("Selecione um arquivo");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "bin";
      const safeName = (nomeCustom.trim() || file.name).replace(/[^\w.\-]+/g, "_");
      const path = `${clienteId}/${Date.now()}-${safeName}`;

      const { error: upErr } = await supabase.storage
        .from("documentos")
        .upload(path, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
      if (upErr) throw upErr;

      const { error: insErr } = await supabase.from("documentos").insert({
        cliente_id: clienteId,
        nome: nomeCustom.trim() || file.name,
        url: path,
        categoria,
        mime_type: file.type || null,
        tamanho_bytes: file.size,
        upload_por: user?.id ?? null,
        compartilhar_com_parceiro: compartilharParceiro,
      });
      if (insErr) {
        // rollback do storage
        await supabase.storage.from("documentos").remove([path]);
        throw insErr;
      }

      toast.success("Documento enviado");
      setOpenUpload(false);
      resetForm();
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao enviar");
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(d: Documento) {
    try {
      const { data, error } = await supabase.storage
        .from("documentos")
        .createSignedUrl(d.url, 60);
      if (error || !data?.signedUrl) throw error ?? new Error("Falha ao gerar link");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao baixar");
    }
  }

  async function handleDelete() {
    if (!removing) return;
    try {
      const { error: stErr } = await supabase.storage
        .from("documentos")
        .remove([removing.url]);
      if (stErr) console.warn("storage remove error", stErr);
      const { error } = await supabase.from("documentos").delete().eq("id", removing.id);
      if (error) throw error;
      toast.success("Documento excluído");
      setRemoving(null);
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao excluir");
    }
  }

  async function toggleCompartilhar(d: Documento, valor: boolean) {
    setItems((prev) => prev.map((x) => (x.id === d.id ? { ...x, compartilhar_com_parceiro: valor } : x)));
    const { error } = await supabase
      .from("documentos")
      .update({ compartilhar_com_parceiro: valor })
      .eq("id", d.id);
    if (error) {
      setItems((prev) => prev.map((x) => (x.id === d.id ? { ...x, compartilhar_com_parceiro: !valor } : x)));
      toast.error("Não foi possível atualizar", { description: error.message });
    } else {
      toast.success(valor ? "Documento liberado para o parceiro" : "Documento ocultado do parceiro");
    }
  }

  const filtered = items.filter((d) => {
    if (filtroCategoria !== "todas" && (d.categoria ?? "outro") !== filtroCategoria) return false;
    if (busca && !d.nome.toLowerCase().includes(busca.toLowerCase())) return false;
    return true;
  });

  // Agrupa por categoria
  const grupos = filtered.reduce<Record<string, Documento[]>>((acc, d) => {
    const k = d.categoria ?? "outro";
    (acc[k] ??= []).push(d);
    return acc;
  }, {});

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Folder className="w-4 h-4 text-gold" />
          <h3 className="font-display text-lg">Documentos</h3>
          <Badge variant="outline" className="ml-2">{items.length}</Badge>
        </div>
        {podeCriar && (
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Wand2 className="w-4 h-4" /> Gerar peça <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs">Modelos do cliente</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => gerarPeca("procuracao")}>
                  Procuração
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => gerarPeca("contrato")}>
                  Contrato de honorários
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => gerarPeca("notificacao")}>
                  Notificação extrajudicial
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => navigate(`/documentos/pecas/novo?cliente_id=${clienteId}`)}>
                  Outra peça…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" onClick={() => setOpenUpload(true)}>
              <Upload className="w-4 h-4 mr-1.5" /> Enviar arquivo
            </Button>
          </div>
        )}
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome…"
            className="pl-9"
          />
        </div>
        <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as categorias</SelectItem>
            {CATEGORIAS.map((c) => (
              <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">
          {items.length === 0 ? "Nenhum documento ainda." : "Nada encontrado com os filtros aplicados."}
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(grupos).map(([cat, docs]) => {
            const catLabel = CATEGORIAS.find((c) => c.v === cat)?.l ?? "Outro";
            return (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className={`text-[10px] ${CATEGORIA_CLASS[cat] ?? CATEGORIA_CLASS.outro}`}>
                    {catLabel}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{docs.length} arquivo(s)</span>
                </div>
                <div className="space-y-1.5">
                  {docs.map((d) => {
                    const Icon = iconForMime(d.mime_type);
                    return (
                      <div
                        key={d.id}
                        className="flex items-center gap-3 rounded-lg border bg-card p-3 hover:bg-accent/30 transition-colors"
                      >
                        <Icon className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{d.nome}</p>
                            {d.compartilhar_com_parceiro && (
                              <Badge variant="secondary" className="text-[10px] gap-1 shrink-0">
                                <Share2 className="w-3 h-3" /> Parceiro
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {formatSize(d.tamanho_bytes)} · enviado em {formatDate(d.criado_em)}
                            {d.versao > 1 && <> · v{d.versao}</>}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div
                            className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-accent/50"
                            title="Compartilhar este documento com o parceiro vinculado"
                          >
                            <Share2 className="w-3.5 h-3.5 text-muted-foreground" />
                            <Switch
                              checked={d.compartilhar_com_parceiro}
                              onCheckedChange={(v) => toggleCompartilhar(d, v)}
                              aria-label="Compartilhar com parceiro"
                            />
                          </div>
                          <Button size="icon" variant="ghost" onClick={() => handleDownload(d)} title="Baixar">
                            <Download className="w-4 h-4" />
                          </Button>
                          {podeExcluir && (
                            <Button size="icon" variant="ghost" onClick={() => setRemoving(d)} title="Excluir">
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload dialog */}
      <Dialog open={openUpload} onOpenChange={(o) => { setOpenUpload(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar documento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Arquivo *</Label>
              <Input
                ref={fileInput}
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {file && (
                <p className="text-xs text-muted-foreground mt-1">
                  {file.name} · {formatSize(file.size)}
                </p>
              )}
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map((c) => <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nome (opcional)</Label>
              <Input
                value={nomeCustom}
                onChange={(e) => setNomeCustom(e.target.value)}
                placeholder="Deixe em branco para usar o nome do arquivo"
              />
            </div>
            <div className="flex items-start justify-between gap-3 rounded-lg border p-3 bg-muted/30">
              <div className="flex gap-2 min-w-0">
                <Share2 className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <Label htmlFor="compartilhar-parceiro" className="text-sm font-medium cursor-pointer">
                    Compartilhar com parceiro
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Libera este documento no portal do parceiro vinculado ao processo. Por padrão fica oculto.
                  </p>
                </div>
              </div>
              <Switch
                id="compartilhar-parceiro"
                checked={compartilharParceiro}
                onCheckedChange={setCompartilharParceiro}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenUpload(false)}>Cancelar</Button>
            <Button onClick={handleUpload} disabled={uploading || !file}>
              {uploading ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Enviando…</> : "Enviar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir documento?</AlertDialogTitle>
            <AlertDialogDescription>
              "{removing?.nome}" será removido permanentemente do cofre de documentos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
