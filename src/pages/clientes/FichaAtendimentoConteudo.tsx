import { useEffect, useRef, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sparkles,
  Loader2,
  Upload,
  FileText,
  Trash2,
  Wand2,
  ArrowRightCircle,
  Save,
  Briefcase,
  ClipboardCheck,
  FileSignature,
  User,
  ListTodo,
  Scale,
  ShieldAlert,
  CheckCircle2,
} from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { ProcessoDoClientePicker } from "@/components/clientes/ProcessoDoClientePicker";
import { iniciarProducaoJuridica } from "@/lib/producao-juridica";


interface Props {
  atendimentoId: string;
  clienteId: string;
  /** Quando renderizada como página, mostra cabeçalho próprio. Sheet usa false. */
  showInternalHeader?: boolean;
  onChanged?: () => void;
  onClose?: () => void;
}

interface ProximoPasso {
  titulo: string;
  detalhe?: string;
  prazo_dias?: number;
  tipo: "diligencia" | "processo" | "processo_administrativo" | "documento" | "contato" | "outro";
  prioridade?: "baixa" | "media" | "alta";
}

interface Ficha {
  id: string;
  cliente_id: string;
  titulo: string | null;
  status: string;
  area: string | null;
  subtipo: string | null;
  informacoes_brutas: string | null;
  resumo: string | null;
  resumo_ia: string | null;
  tese_juridica: string | null;
  fatos: string | null;
  urgencia: string | null;
  qualificacao: Record<string, any> | null;
  pedidos: string[] | null;
  documentos_faltantes: string[] | null;
  proximos_passos: ProximoPasso[] | null;
  dados_estruturados: Record<string, any> | null;
  partes: Record<string, any> | null;
  fundamentacao_legal: { referencia: string; aplicacao: string }[] | null;
  riscos: { risco: string; mitigacao?: string; gravidade: "baixa" | "media" | "alta" }[] | null;
  estrategia: string | null;
  evidencias:
    | {
        campo: string;
        valor: string;
        fonte: string;
        fonte_nome?: string;
        citacao: string;
        confianca?: "baixa" | "media" | "alta";
      }[]
    | null;
  analisado_em: string | null;
  processo_id: string | null;
  item_controladoria_id: string | null;
  convertido_em: string | null;
  convertido_tipo: string | null;
}

interface FichaDoc {
  id: string;
  nome: string;
  tipo: string | null;
  storage_path: string;
  mime_type: string | null;
  tamanho_bytes: number | null;
  resumo_ia: string | null;
  criado_em: string;
}

const AREAS = [
  "previdenciario",
  "familia",
  "consumidor",
  "trabalhista",
  "civel",
  "tributario",
  "criminal",
  "outro",
] as const;

export function FichaAtendimentoConteudo({
  atendimentoId,
  clienteId,
  showInternalHeader = false,
  onChanged,
  onClose,
}: Props) {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const podeEditar = hasPermission("clientes", "editar");
  const podeCriarProcesso = hasPermission("processos", "criar");
  const podeCriarControladoria = hasPermission("controladoria", "criar");

  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [clienteNome, setClienteNome] = useState<string>("");
  const [docs, setDocs] = useState<FichaDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [analisando, setAnalisando] = useState(false);
  const [enviandoArquivo, setEnviandoArquivo] = useState(false);
  const [instrExtras, setInstrExtras] = useState("");
  const [confirmarConverter, setConfirmarConverter] =
    useState<null | "processo" | "processo_administrativo" | "diligencia">(null);
  const [convertendo, setConvertendo] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function carregar() {
    if (!atendimentoId) return;
    setLoading(true);
    const [{ data: f }, { data: d }] = await Promise.all([
      supabase
        .from("cliente_atendimentos")
        .select(
          "id, cliente_id, titulo, status, area, subtipo, informacoes_brutas, resumo, resumo_ia, tese_juridica, fatos, urgencia, qualificacao, pedidos, documentos_faltantes, proximos_passos, dados_estruturados, partes, fundamentacao_legal, riscos, estrategia, evidencias, analisado_em, processo_id, item_controladoria_id, convertido_em, convertido_tipo",
        )
        .eq("id", atendimentoId)
        .maybeSingle(),
      supabase
        .from("cliente_ficha_documentos")
        .select("id, nome, tipo, storage_path, mime_type, tamanho_bytes, resumo_ia, criado_em")
        .eq("atendimento_id", atendimentoId)
        .order("criado_em", { ascending: false }),
    ]);
    setFicha(f as any);
    setDocs((d ?? []) as FichaDoc[]);
    if (f?.cliente_id) {
      const { data: c } = await supabase
        .from("clientes")
        .select("nome, cpf_cnpj")
        .eq("id", f.cliente_id)
        .maybeSingle();
      setClienteNome(c ? `${c.nome}${c.cpf_cnpj ? ` · ${c.cpf_cnpj}` : ""}` : "");
    }
    setLoading(false);
  }

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atendimentoId]);

  async function salvar() {
    if (!ficha) return;
    setSalvando(true);
    const { error } = await supabase
      .from("cliente_atendimentos")
      .update({
        titulo: ficha.titulo,
        area: ficha.area,
        subtipo: ficha.subtipo,
        informacoes_brutas: ficha.informacoes_brutas,
        resumo: ficha.resumo ?? "",
        tese_juridica: ficha.tese_juridica,
        fatos: ficha.fatos,
        processo_id: ficha.processo_id,
      })
      .eq("id", ficha.id);
    setSalvando(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Ficha salva");
      onChanged?.();
    }
  }

  async function analisarComIA() {
    if (!ficha) return;
    setAnalisando(true);
    try {
      const { data, error } = await supabase.functions.invoke("ficha-atendimento-ia", {
        body: { atendimento_id: ficha.id, instrucoes_extras: instrExtras || undefined },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Ficha estruturada pela Bia");
      await carregar();
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na IA");
    } finally {
      setAnalisando(false);
    }
  }

  async function uploadArquivo(files: FileList | File[] | null) {
    if (!files || (files as any).length === 0 || !ficha) return;
    const arr = Array.from(files as any) as File[];
    const MAX_BYTES = 25 * 1024 * 1024;
    const grandes = arr.filter((f) => f.size > MAX_BYTES);
    if (grandes.length > 0) {
      toast.error(
        `Arquivo(s) muito grande(s): ${grandes.map((g) => g.name).join(", ")}. Limite: 25 MB por arquivo.`,
      );
      return;
    }
    setEnviandoArquivo(true);
    try {
      for (const file of arr) {
        const ext = file.name.split(".").pop() ?? "bin";
        const path = `${clienteId}/${ficha.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("fichas-atendimento")
          .upload(path, file, {
            contentType: file.type || "application/octet-stream",
            upsert: true,
          });
        if (upErr) throw upErr;
        const { error: insErr } = await supabase.from("cliente_ficha_documentos").insert({
          atendimento_id: ficha.id,
          cliente_id: clienteId,
          nome: file.name,
          tipo: detectarTipoDoc(file.name),
          storage_path: path,
          mime_type: file.type || null,
          tamanho_bytes: file.size,
          enviado_por: user?.id ?? null,
        });
        if (insErr) throw insErr;
      }
      toast.success(`${arr.length} arquivo(s) enviado(s) — analisando...`);
      await carregar();
      void analisarComIA();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(
        msg.includes("Failed to fetch")
          ? "Falha de conexão. Tente um arquivo menor (≤25 MB) ou verifique sua internet."
          : msg,
      );
    } finally {
      setEnviandoArquivo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function excluirDoc(d: FichaDoc) {
    if (!confirm(`Excluir "${d.nome}"?`)) return;
    await supabase.storage.from("fichas-atendimento").remove([d.storage_path]);
    const { error } = await supabase.from("cliente_ficha_documentos").delete().eq("id", d.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Documento removido");
      await carregar();
    }
  }

  async function abrirDoc(d: FichaDoc) {
    const { data, error } = await supabase.storage
      .from("fichas-atendimento")
      .createSignedUrl(d.storage_path, 60);
    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? "Não foi possível abrir");
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  async function converter(tipo: NonNullable<typeof confirmarConverter>) {
    if (!ficha) return;
    setConvertendo(true);
    try {
      const tituloFicha = ficha.titulo ?? "Atendimento";
      const descricao = [
        ficha.resumo,
        ficha.tese_juridica ? `\n\n**Tese:**\n${ficha.tese_juridica}` : "",
      ]
        .filter(Boolean)
        .join("");

      let novoProcessoId: string | null = null;
      let novoItemId: string | null = null;

      if (tipo === "processo" || tipo === "processo_administrativo") {
        const { data: p, error: pErr } = await supabase
          .from("processos")
          .insert({
            cliente_id: clienteId,
            tipo: tipo === "processo_administrativo" ? "administrativo" : "judicial",
            area_direito: ficha.area ?? null,
            observacoes_internas:
              `Originado da ficha de atendimento "${tituloFicha}".\n\n` + (descricao || ""),
            status: "ativo",
            criado_por: user?.id ?? null,
          })
          .select("id")
          .maybeSingle();
        if (pErr) throw pErr;
        novoProcessoId = p?.id ?? null;
      } else if (tipo === "diligencia") {
        const { data: i, error: iErr } = await supabase
          .from("controladoria_itens")
          .insert({
            tipo: "diligencia",
            titulo: tituloFicha,
            descricao: descricao || ficha.informacoes_brutas || "",
            prioridade: "media",
            data_vencimento: new Date(Date.now() + 86400000 * 5).toISOString(),
            cliente_id: clienteId,
            origem: "controladoria",
            criado_por: user?.id ?? null,
          })
          .select("id")
          .maybeSingle();
        if (iErr) throw iErr;
        novoItemId = i?.id ?? null;
      }

      const { error: upErr } = await supabase
        .from("cliente_atendimentos")
        .update({
          status: "convertido",
          convertido_em: new Date().toISOString(),
          convertido_tipo: tipo,
          processo_id: novoProcessoId ?? ficha.processo_id,
          item_controladoria_id: novoItemId ?? ficha.item_controladoria_id,
          link: novoProcessoId
            ? `/processos/${novoProcessoId}`
            : novoItemId
              ? `/controladoria`
              : ficha.processo_id
                ? `/processos/${ficha.processo_id}`
                : null,
        })
        .eq("id", ficha.id);
      if (upErr) throw upErr;

      // Produção jurídica (POP): só dispara nesta conversão nova e explícita.
      // Nunca bloqueia a conversão — no máximo avisa e registra pendência.
      const producao = await iniciarProducaoJuridica({
        atendimentoId: ficha.id,
        processoId: novoProcessoId ?? ficha.processo_id ?? null,
      });
      if (producao.criouFluxo) {
        toast.success("Fluxo de produção jurídica iniciado na Controladoria");
      } else if (producao.aviso) {
        toast.warning(producao.aviso, { duration: 10000 });
      }


      toast.success("Atendimento convertido com sucesso");
      onChanged?.();
      onClose?.();
      if (novoProcessoId) navigate(`/processos/${novoProcessoId}`);
      else if (novoItemId) navigate(`/controladoria`);

    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na conversão");
    } finally {
      setConvertendo(false);
      setConfirmarConverter(null);
    }
  }

  async function criarPassoNaControladoria(p: ProximoPasso) {
    if (!ficha) return;
    const dias = typeof p.prazo_dias === "number" && p.prazo_dias > 0 ? p.prazo_dias : 5;
    const { error } = await supabase.from("controladoria_itens").insert({
      tipo:
        p.tipo === "documento" || p.tipo === "contato" || p.tipo === "outro"
          ? "diligencia"
          : (p.tipo as any),
      titulo: p.titulo,
      descricao: p.detalhe ?? "",
      prioridade: p.prioridade ?? "media",
      data_vencimento: new Date(Date.now() + 86400000 * dias).toISOString(),
      cliente_id: clienteId,
      origem: "controladoria",
      criado_por: user?.id ?? null,
    });
    if (error) toast.error(error.message);
    else toast.success(`"${p.titulo}" criado na Controladoria`);
  }

  // Progresso da ficha
  const progresso = useMemo(() => {
    if (!ficha) return { pct: 0, etapas: [] as { label: string; ok: boolean }[] };
    const etapas = [
      { label: "Cliente vinculado", ok: !!ficha.cliente_id },
      { label: "Documentos anexados", ok: docs.length > 0 },
      { label: "Análise da IA realizada", ok: !!ficha.analisado_em },
      { label: "Resumo do caso", ok: !!(ficha.resumo && ficha.resumo.trim().length > 10) },
      { label: "Convertido em processo/diligência", ok: !!ficha.convertido_tipo },
    ];
    const pct = Math.round((etapas.filter((e) => e.ok).length / etapas.length) * 100);
    return { pct, etapas };
  }, [ficha, docs]);

  if (loading || !ficha) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando ficha...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Cabeçalho interno (apenas em página) */}
      {showInternalHeader && (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="w-3.5 h-3.5 text-primary" /> Ficha de atendimento
              </div>
              <h2 className="text-xl sm:text-2xl font-display tracking-tight">
                {ficha.titulo || "Atendimento sem título"}
              </h2>
              <p className="text-sm text-muted-foreground">{clienteNome || "—"}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={salvar} disabled={salvando || !podeEditar} className="gap-1">
                {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Salvar
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="gap-1">
                    <ArrowRightCircle className="w-3.5 h-3.5" /> Converter
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    disabled={!podeCriarProcesso}
                    onClick={() => setConfirmarConverter("processo")}
                  >
                    <Briefcase className="w-3.5 h-3.5 mr-2" /> Processo judicial
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!podeCriarProcesso}
                    onClick={() => setConfirmarConverter("processo_administrativo")}
                  >
                    <FileSignature className="w-3.5 h-3.5 mr-2" /> Processo administrativo
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!podeCriarControladoria}
                    onClick={() => setConfirmarConverter("diligencia")}
                  >
                    <ClipboardCheck className="w-3.5 h-3.5 mr-2" /> Diligência na controladoria
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      )}

      {/* Status + barra de progresso */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="capitalize">
              {ficha.status}
            </Badge>
            {ficha.area && <Badge variant="secondary">{ficha.area}</Badge>}
            {ficha.subtipo && <Badge variant="outline">{ficha.subtipo}</Badge>}
            {ficha.urgencia && (
              <Badge
                variant={ficha.urgencia === "critica" || ficha.urgencia === "alta" ? "destructive" : "secondary"}
                className="capitalize"
              >
                Urgência: {ficha.urgencia}
              </Badge>
            )}
            {ficha.convertido_tipo && (
              <Badge variant="outline" className="bg-success/10 text-success">
                convertido em {ficha.convertido_tipo}
              </Badge>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {progresso.pct}% completa
            </span>
          </div>
          <Progress value={progresso.pct} className="h-1.5" />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {progresso.etapas.map((e) => (
              <span key={e.label} className="flex items-center gap-1">
                <CheckCircle2
                  className={`w-3.5 h-3.5 ${e.ok ? "text-success" : "text-muted-foreground/40"}`}
                />
                {e.label}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="resumo" className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="resumo" className="gap-1">
            <User className="w-3.5 h-3.5" /> Resumo
          </TabsTrigger>
          <TabsTrigger value="documentos" className="gap-1">
            <FileText className="w-3.5 h-3.5" /> Documentos
            {docs.length > 0 && (
              <span className="ml-1 text-[10px] bg-muted rounded px-1">{docs.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="ia" className="gap-1">
            <Sparkles className="w-3.5 h-3.5" /> Análise IA
          </TabsTrigger>
          <TabsTrigger value="proximos" className="gap-1">
            <ListTodo className="w-3.5 h-3.5" /> Próximos passos
            {Array.isArray(ficha.proximos_passos) && ficha.proximos_passos.length > 0 && (
              <span className="ml-1 text-[10px] bg-muted rounded px-1">
                {ficha.proximos_passos.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="conversao" className="gap-1">
            <ArrowRightCircle className="w-3.5 h-3.5" /> Conversão
          </TabsTrigger>
        </TabsList>

        {/* RESUMO ============================================== */}
        <TabsContent value="resumo" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Identificação</CardTitle>
              <CardDescription>Cliente, processo vinculado e dados básicos</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">
                  Cliente vinculado
                </div>
                <div className="text-sm font-medium">{clienteNome || "—"}</div>
              </div>
              <ProcessoDoClientePicker
                clienteId={ficha.cliente_id}
                value={ficha.processo_id}
                onChange={(pid) => setFicha({ ...ficha, processo_id: pid })}
                label="Processo deste cliente (opcional)"
                disabled={!podeEditar}
              />
              <div className="space-y-1.5">
                <Label>Título</Label>
                <Input
                  value={ficha.titulo ?? ""}
                  onChange={(e) => setFicha({ ...ficha, titulo: e.target.value })}
                  disabled={!podeEditar}
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Área</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={ficha.area ?? ""}
                    onChange={(e) => setFicha({ ...ficha, area: e.target.value || null })}
                    disabled={!podeEditar}
                  >
                    <option value="">Selecione...</option>
                    {AREAS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Subtipo</Label>
                  <Input
                    value={ficha.subtipo ?? ""}
                    onChange={(e) => setFicha({ ...ficha, subtipo: e.target.value || null })}
                    placeholder="ex.: bpc_loas, isencao_ir"
                    disabled={!podeEditar}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Caso</CardTitle>
              <CardDescription>Resumo, fatos e tese jurídica</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>Resumo do caso</Label>
                <Textarea
                  rows={4}
                  value={ficha.resumo ?? ""}
                  onChange={(e) => setFicha({ ...ficha, resumo: e.target.value })}
                  disabled={!podeEditar}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Fatos</Label>
                <Textarea
                  rows={4}
                  value={ficha.fatos ?? ""}
                  onChange={(e) => setFicha({ ...ficha, fatos: e.target.value })}
                  placeholder="Narrativa cronológica dos fatos."
                  disabled={!podeEditar}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tese jurídica</Label>
                <Textarea
                  rows={5}
                  value={ficha.tese_juridica ?? ""}
                  onChange={(e) => setFicha({ ...ficha, tese_juridica: e.target.value })}
                  disabled={!podeEditar}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Anotações ou texto bruto</Label>
                <Textarea
                  rows={4}
                  value={ficha.informacoes_brutas ?? ""}
                  onChange={(e) => setFicha({ ...ficha, informacoes_brutas: e.target.value })}
                  placeholder="Cole conversa de WhatsApp, notas da reunião ou qualquer informação adicional. A Bia também lê isso."
                  disabled={!podeEditar}
                />
              </div>
            </CardContent>
          </Card>

          {!showInternalHeader && (
            <div className="flex justify-end">
              <Button onClick={salvar} disabled={salvando || !podeEditar} className="gap-1">
                {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Salvar alterações
              </Button>
            </div>
          )}
        </TabsContent>

        {/* DOCUMENTOS ============================================== */}
        <TabsContent value="documentos" className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  if (podeEditar) setArrastando(true);
                }}
                onDragLeave={() => setArrastando(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setArrastando(false);
                  if (!podeEditar) return;
                  if (e.dataTransfer.files?.length) uploadArquivo(e.dataTransfer.files);
                }}
                className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
                  arrastando ? "border-primary bg-primary/10" : "border-border bg-muted/20 hover:bg-muted/40"
                }`}
              >
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  hidden
                  onChange={(e) => uploadArquivo(e.target.files)}
                />
                <Upload className="w-7 h-7 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium">Arraste documentos aqui ou clique para selecionar</p>
                <p className="text-xs text-muted-foreground mt-1">
                  PDFs, imagens (JPG/PNG) e áudios — a Bia lê e pré-preenche a ficha automaticamente.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={enviandoArquivo || analisando || !podeEditar}
                  className="gap-1 mt-3"
                >
                  {enviandoArquivo || analisando ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  {enviandoArquivo ? "Enviando..." : analisando ? "Analisando..." : "Selecionar arquivos"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {docs.length > 0 ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{docs.length} documento(s) anexado(s)</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {docs.map((d) => (
                    <div key={d.id} className="flex items-start gap-3 p-3">
                      <FileText className="w-4 h-4 mt-0.5 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <button
                          onClick={() => abrirDoc(d)}
                          className="text-sm font-medium truncate text-left hover:underline"
                        >
                          {d.nome}
                        </button>
                        <div className="text-xs text-muted-foreground flex gap-2">
                          {d.tipo && <span>{d.tipo}</span>}
                          <span>{formatDateTime(d.criado_em)}</span>
                        </div>
                        {d.resumo_ia && (
                          <p className="text-xs text-muted-foreground italic mt-1 line-clamp-2">
                            {d.resumo_ia}
                          </p>
                        )}
                      </div>
                      {podeEditar && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => excluirDoc(d)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                Nenhum documento anexado ainda.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ANÁLISE IA ============================================== */}
        <TabsContent value="ia" className="space-y-4">
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" /> Bia — Análise estruturada
              </CardTitle>
              <CardDescription>
                A IA lê os documentos e o texto bruto para preencher os campos abaixo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Textarea
                rows={2}
                placeholder="Instruções extras para a Bia (opcional). Ex.: Foque em revisar requisitos do BPC."
                value={instrExtras}
                onChange={(e) => setInstrExtras(e.target.value)}
                disabled={!podeEditar}
              />
              <Button size="sm" onClick={analisarComIA} disabled={analisando || !podeEditar} className="gap-1">
                {analisando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                {ficha.resumo_ia ? "Reanalisar com IA" : "Montar ficha com IA"}
              </Button>
              {ficha.analisado_em && (
                <p className="text-xs text-muted-foreground">
                  Última análise: {formatDateTime(ficha.analisado_em)}
                </p>
              )}
            </CardContent>
          </Card>

          {ficha.partes && Object.keys(ficha.partes).length > 0 && (
            <CamposComEvidencia
              label="Partes e processo"
              prefixo="partes"
              obj={ficha.partes}
              evidencias={ficha.evidencias ?? []}
              docs={docs}
              onAbrirDoc={abrirDoc}
            />
          )}

          {ficha.qualificacao && Object.keys(ficha.qualificacao).length > 0 && (
            <CamposComEvidencia
              label="Qualificação"
              prefixo="qualificacao"
              obj={ficha.qualificacao}
              evidencias={ficha.evidencias ?? []}
              docs={docs}
              onAbrirDoc={abrirDoc}
            />
          )}

          {ficha.dados_estruturados && Object.keys(ficha.dados_estruturados).length > 0 && (
            <CamposComEvidencia
              label="Dados extraídos"
              prefixo="dados_estruturados"
              obj={ficha.dados_estruturados}
              evidencias={ficha.evidencias ?? []}
              docs={docs}
              onAbrirDoc={abrirDoc}
            />
          )}

          {ficha.estrategia && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Scale className="w-4 h-4" /> Estratégia sugerida
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border bg-primary/5 p-3 text-sm whitespace-pre-wrap">
                  {ficha.estrategia}
                </div>
              </CardContent>
            </Card>
          )}

          {Array.isArray(ficha.fundamentacao_legal) && ficha.fundamentacao_legal.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Fundamentação legal</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y text-sm">
                  {ficha.fundamentacao_legal.map((f, i) => (
                    <div key={i} className="p-3 space-y-0.5">
                      <div className="font-medium">{f.referencia}</div>
                      <div className="text-xs text-muted-foreground">{f.aplicacao}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {Array.isArray(ficha.riscos) && ficha.riscos.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-warning" /> Riscos identificados
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {ficha.riscos.map((r, i) => (
                  <div key={i} className="rounded-md border border-warning/40 bg-warning/5 p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={r.gravidade === "alta" ? "destructive" : "secondary"}
                        className="text-[10px] capitalize"
                      >
                        {r.gravidade}
                      </Badge>
                      <span className="text-sm font-medium">{r.risco}</span>
                    </div>
                    {r.mitigacao && (
                      <p className="text-xs text-muted-foreground">
                        <strong>Mitigação:</strong> {r.mitigacao}
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* PRÓXIMOS PASSOS ============================================== */}
        <TabsContent value="proximos" className="space-y-4">
          {Array.isArray(ficha.pedidos) && ficha.pedidos.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Pedidos sugeridos</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-sm space-y-1 list-disc list-inside">
                  {ficha.pedidos.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {Array.isArray(ficha.documentos_faltantes) && ficha.documentos_faltantes.length > 0 && (
            <Card className="border-warning/40 bg-warning/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Documentos faltantes</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-sm space-y-1 list-disc list-inside">
                  {ficha.documentos_faltantes.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {Array.isArray(ficha.proximos_passos) && ficha.proximos_passos.length > 0 ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Próximos passos sugeridos</CardTitle>
                <CardDescription>Crie tarefas na controladoria com 1 clique.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {ficha.proximos_passos.map((p, i) => (
                  <div key={i} className="rounded-md border p-3 flex items-start gap-2">
                    <ClipboardCheck className="w-4 h-4 mt-0.5 text-primary" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
                        {p.titulo}
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {p.tipo}
                        </Badge>
                        {p.prioridade && (
                          <Badge
                            variant={p.prioridade === "alta" ? "destructive" : "secondary"}
                            className="text-[10px] capitalize"
                          >
                            {p.prioridade}
                          </Badge>
                        )}
                        {typeof p.prazo_dias === "number" && (
                          <span className="text-xs text-muted-foreground">em {p.prazo_dias}d</span>
                        )}
                      </div>
                      {p.detalhe && <p className="text-xs text-muted-foreground mt-0.5">{p.detalhe}</p>}
                    </div>
                    {podeCriarControladoria && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs gap-1"
                        onClick={() => criarPassoNaControladoria(p)}
                      >
                        <ArrowRightCircle className="w-3 h-3" /> Controladoria
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                Nenhum próximo passo sugerido. Faça a análise da IA para gerar sugestões.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* CONVERSÃO ============================================== */}
        <TabsContent value="conversao" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Converter atendimento</CardTitle>
              <CardDescription>
                Transforme esta ficha em um processo ou diligência. O cliente e os dados serão
                vinculados automaticamente.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-3 gap-3">
              <Button
                variant="outline"
                className="h-auto flex-col p-4 gap-2"
                disabled={!podeCriarProcesso || ficha.status === "convertido"}
                onClick={() => setConfirmarConverter("processo")}
              >
                <Briefcase className="w-5 h-5 text-primary" />
                <span className="text-sm font-medium">Processo judicial</span>
              </Button>
              <Button
                variant="outline"
                className="h-auto flex-col p-4 gap-2"
                disabled={!podeCriarProcesso || ficha.status === "convertido"}
                onClick={() => setConfirmarConverter("processo_administrativo")}
              >
                <FileSignature className="w-5 h-5 text-primary" />
                <span className="text-sm font-medium">Processo administrativo</span>
              </Button>
              <Button
                variant="outline"
                className="h-auto flex-col p-4 gap-2"
                disabled={!podeCriarControladoria || ficha.status === "convertido"}
                onClick={() => setConfirmarConverter("diligencia")}
              >
                <ClipboardCheck className="w-5 h-5 text-primary" />
                <span className="text-sm font-medium">Diligência</span>
              </Button>
            </CardContent>
            {ficha.convertido_tipo && (
              <CardContent>
                <p className="text-sm text-success flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> Já convertida em{" "}
                  <strong>{ficha.convertido_tipo}</strong>
                  {ficha.convertido_em && ` em ${formatDateTime(ficha.convertido_em)}`}.
                </p>
              </CardContent>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog
        open={confirmarConverter !== null}
        onOpenChange={(o) => !o && setConfirmarConverter(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Converter ficha?</AlertDialogTitle>
            <AlertDialogDescription>
              A ficha será marcada como <strong>convertida</strong> e um novo registro em{" "}
              <strong>
                {confirmarConverter === "processo"
                  ? "Processos (judicial)"
                  : confirmarConverter === "processo_administrativo"
                    ? "Processos (administrativo)"
                    : "Controladoria (diligência)"}
              </strong>{" "}
              será criado, vinculado ao cliente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={convertendo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={convertendo}
              onClick={() => confirmarConverter && converter(confirmarConverter)}
            >
              {convertendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Converter"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function detectarTipoDoc(nome: string): string {
  const n = nome.toLowerCase();
  if (n.includes("cnis")) return "cnis";
  if (n.includes("laudo")) return "laudo";
  if (n.includes("rg")) return "rg";
  if (n.includes("cpf")) return "cpf";
  if (n.includes("ctps")) return "ctps";
  if (n.includes("declar")) return "declaracao";
  if (n.endsWith(".pdf")) return "pdf";
  if (/\.(png|jpe?g|webp)$/.test(n)) return "imagem";
  return "outro";
}

interface Evidencia {
  campo: string;
  valor: string;
  fonte: string;
  fonte_nome?: string;
  citacao: string;
  confianca?: "baixa" | "media" | "alta";
}

function CamposComEvidencia({
  label,
  prefixo,
  obj,
  evidencias,
  docs,
  onAbrirDoc,
}: {
  label: string;
  prefixo: string;
  obj: Record<string, any>;
  evidencias: Evidencia[];
  docs: FichaDoc[];
  onAbrirDoc: (d: FichaDoc) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{label}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y text-sm">
          {Object.entries(obj).map(([k, v]) => {
            const ev = evidencias.find((e) => e.campo === `${prefixo}.${k}`);
            const doc = ev ? docs.find((d) => d.id === ev.fonte) : undefined;
            return (
              <div key={k} className="px-3 py-2">
                <div className="flex justify-between gap-2 items-baseline">
                  <span className="text-muted-foreground capitalize text-xs">
                    {k.replace(/_/g, " ")}
                  </span>
                  <span className="font-medium text-right truncate">{String(v)}</span>
                </div>
                {ev && (
                  <div className="mt-1 pl-2 border-l-2 border-primary/40 text-xs text-muted-foreground italic flex flex-wrap items-baseline gap-1">
                    <span>"{ev.citacao}"</span>
                    <span className="not-italic">
                      {doc ? (
                        <button
                          type="button"
                          onClick={() => onAbrirDoc(doc)}
                          className="text-primary hover:underline"
                        >
                          — {doc.nome}
                        </button>
                      ) : (
                        <span>— {ev.fonte_nome ?? ev.fonte}</span>
                      )}
                      {ev.confianca && (
                        <Badge variant="outline" className="ml-1 text-[9px] capitalize">
                          {ev.confianca}
                        </Badge>
                      )}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
